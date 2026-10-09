"""Replay the SPY 0DTE iron-condor bot (``_drive_mirror/CT1.3/spy_0dte_ic_bot.py``) on real option bars.

Offline: reads only the CSV fixtures in ``data/fixtures/0dte_real`` (pulled read-only from the Robinhood
connector) and writes ``docs/backtest/ic_real_marks.md`` plus a per-session CSV. Re-run it as more sessions
are added to the fixture directory::

    .venv/bin/python engine/letf/ic_replay.py            # from the repo root
    .venv/bin/python engine/letf/ic_replay.py --no-write # print only

Fixture layout (one file per session, named after the 0DTE expiry = session date):

* ``SPY_5min.csv``       SPY regular-hours 5-minute bars, left-edge UTC labels.
* ``VIX_0945.csv``       VIX 5-minute bar 13:40Z (its close is the 09:45 ET value), one row per session.
* ``legs_YYYYMMDD.csv``  5-minute option bars, 13:30Z-19:55Z, legs sp/lp/sc/lc (+ optional context legs
                         atm_c/atm_p/hp/hc). Exact bot timing.
* ``legs10_YYYYMMDD.csv`` 10-minute option bars for sessions whose 5-minute bars Robinhood no longer serves
                         (only interpolated filler). Approximate timing: entry marks at 09:50 ET instead of
                         09:45, management checks at 10:00/10:10/10:20, the "15:45" exit at 15:40.
* ``instruments.json``   option instrument ids per session/leg (provenance only).

Bars are left-edge labelled; the price "at" clock time T is the close of the bar that ends at T. A bar flagged
``interpolated`` carries no information; the most recent real bar before it is used instead and flagged.
"""
from __future__ import annotations

import argparse
import glob
import math
import os
from dataclasses import dataclass, field
from datetime import datetime, timedelta, timezone

import pandas as pd

# ───────────── bot constants (mirrors spy_0dte_ic_bot.py) ─────────────
EXPECTED_MOVE_DIV = 16.0
PUT_WING = 5.0
CALL_WING = 3.0
PROFIT_TARGET = 0.25
VIX1D_MAX = 25.0              # only applied when VIX1D is available (it is not, see VOL_SOURCE)
TREND_FRAC = 0.50
MIN_CREDIT = 0.30
CREDIT_CONCESSION = 0.02      # entry fill = mid credit - 0.02 ; exit fill = mid debit + 0.02
FEE_PER_LEG_SIDE = 0.04       # $ per contract per leg per side (assumption: Alpaca reg/OCC pass-through)
FEES_ROUND_TRIP = FEE_PER_LEG_SIDE * 4 * 2
EVENT_DAYS = {                # the bot's list (Oct-Nov only) ...
    "2026-10-02": "NFP", "2026-10-14": "CPI", "2026-10-15": "PPI",
    "2026-10-28": "FOMC", "2026-10-30": "PCE", "2026-11-06": "NFP",
}
EVENT_DAYS_ADDED = {          # ... plus the September equivalent the monthly edit would have contained
    "2026-09-16": "FOMC decision (Sep 15-16 meeting; not in the bot's Oct-Nov list, added here)",
}
VOL_SOURCE = "VIX (VIX1D not available from the Robinhood connector), 5-minute bar 13:40Z close = 09:45 ET"

ET_OFFSET = timedelta(hours=-4)   # EDT throughout Sep/Oct 2026 (DST ends 2026-11-01)
ENTRY_ET = (9, 45)
EXIT_ET = (10, 20)
HOLD_ET = (15, 45)
CLOSE_ET = (16, 0)

REPO = os.path.abspath(os.path.join(os.path.dirname(__file__), "..", ".."))
DATA_DIR = os.path.join(REPO, "data", "fixtures", "0dte_real")
OUT_MD = os.path.join(REPO, "docs", "backtest", "ic_real_marks.md")
OUT_CSV = os.path.join(REPO, "docs", "backtest", "ic_real_marks_sessions.csv")


def et_to_utc(date: str, hm: tuple[int, int]) -> pd.Timestamp:
    d = datetime.strptime(date, "%Y-%m-%d").replace(hour=hm[0], minute=hm[1], tzinfo=timezone.utc)
    return pd.Timestamp(d - ET_OFFSET)


def utc_to_et_str(ts: pd.Timestamp) -> str:
    return (ts + ET_OFFSET).strftime("%H:%M")


# ───────────── data loading ─────────────
def load_spy(data_dir: str) -> pd.DataFrame:
    d = pd.read_csv(os.path.join(data_dir, "SPY_5min.csv"))
    d["t"] = pd.to_datetime(d["time_utc"], utc=True)
    d["end"] = d["t"] + pd.Timedelta(minutes=5)
    d["date"] = d["time_utc"].str[:10]
    return d


def load_vix(data_dir: str) -> dict[str, float]:
    d = pd.read_csv(os.path.join(data_dir, "VIX_0945.csv"))
    return {r.date: float(r.close) for r in d.itertuples()}


def load_legs(data_dir: str) -> dict[str, tuple[pd.DataFrame, int]]:
    """date -> (bars, interval_minutes). 5-minute files win over 10-minute files for the same date."""
    out: dict[str, tuple[pd.DataFrame, int]] = {}
    for pat, minutes in (("legs10_*.csv", 10), ("legs_*.csv", 5)):
        for f in sorted(glob.glob(os.path.join(data_dir, pat))):
            stem = os.path.basename(f).split("_")[1].split(".")[0]
            date = f"{stem[:4]}-{stem[4:6]}-{stem[6:]}"
            d = pd.read_csv(f)
            d["t"] = pd.to_datetime(d["time_utc"], utc=True)
            d["end"] = d["t"] + pd.Timedelta(minutes=minutes)
            d["interpolated"] = d["interpolated"].astype(str).str.lower().eq("true")
            out[date] = (d, minutes)
    return out


# ───────────── replay core ─────────────
@dataclass
class Marks:
    bars: pd.DataFrame
    minutes: int
    flags: list[str] = field(default_factory=list)

    def leg_close(self, leg: str, t_end: pd.Timestamp) -> float | None:
        g = self.bars[(self.bars["leg"] == leg) & (self.bars["end"] <= t_end)].sort_values("end")
        if g.empty:
            return None
        exact = g[g["end"] == t_end]
        real = g[~g["interpolated"]]
        if real.empty:
            self.flags.append(f"{leg}@{utc_to_et_str(t_end)}: no real bar")
            return None
        if exact.empty or bool(exact["interpolated"].iloc[0]):
            last = real.iloc[-1]
            self.flags.append(f"{leg}@{utc_to_et_str(t_end)} interpolated/missing -> used real bar ending "
                              f"{utc_to_et_str(last['end'])}")
            return float(last["close"])
        return float(exact["close"].iloc[0])

    def condor(self, t_end: pd.Timestamp) -> float | None:
        v = {k: self.leg_close(k, t_end) for k in ("sp", "sc", "lp", "lc")}
        if any(x is None for x in v.values()):
            return None
        return v["sp"] + v["sc"] - v["lp"] - v["lc"]

    def ends(self, after: pd.Timestamp, upto: pd.Timestamp, step10: bool = False) -> list[pd.Timestamp]:
        e = sorted(set(self.bars["end"]))
        e = [x for x in e if after < x <= upto]
        if step10:
            e = [x for x in e if x.minute % 10 == 0]
        return e


def manage(m: Marks, entry_t: pd.Timestamp, fill: float, last_t: pd.Timestamp, step10: bool) -> dict:
    target = fill * (1 - PROFIT_TARGET)
    worst, debit, exit_t, reason = None, None, None, "time"
    path = []
    for t in m.ends(entry_t, last_t, step10):
        d = m.condor(t)
        if d is None:
            continue
        debit, exit_t = d, t
        path.append((utc_to_et_str(t), round(d, 2)))
        worst = d if worst is None else max(worst, d)
        if d <= target + 1e-9:
            reason = "target"
            break
    if debit is None:
        return {"exit_reason": "no marks", "pnl": None}
    exit_fill = debit + CREDIT_CONCESSION
    pnl = (fill - exit_fill) * 100 - FEES_ROUND_TRIP
    return {"exit_t": utc_to_et_str(exit_t), "exit_reason": reason, "exit_debit": round(debit, 2),
            "exit_fill": round(exit_fill, 2), "pnl": round(pnl, 2), "worst_debit": round(worst, 2),
            "max_loss_wide_wing": round((PUT_WING - fill) * 100 + FEES_ROUND_TRIP, 2),
            "target_debit": round(target, 4), "path": path}


def spy_at(spy: pd.DataFrame, t_end: pd.Timestamp, col: str = "close") -> float:
    r = spy[spy["end"] == t_end]
    return float(r[col].iloc[0])


def replay_session(date: str, spy: pd.DataFrame, vix: dict, legs: dict, step10: bool = False) -> dict:
    row: dict = {"date": date}
    ev = EVENT_DAYS.get(date) or EVENT_DAYS_ADDED.get(date)
    s = spy[spy["date"] == date]
    t945 = et_to_utc(date, ENTRY_ET)
    open_ = float(s[s["t"] == et_to_utc(date, (9, 30))]["open"].iloc[0])
    spot = spy_at(s, t945)
    row.update(spy_open=round(open_, 2), spot=round(spot, 2))
    if ev:
        row.update(decision_A="SKIP", reason_A=f"event day: {ev}", data="-")
        return row
    if date not in vix:
        row.update(decision_A="EXCLUDED", reason_A="no VIX 09:45 value in fixtures", data="-")
        return row
    vol = vix[date]
    em = spot * (vol / EXPECTED_MOVE_DIV) / 100.0
    row.update(vol=vol, exp_move=round(em, 2))
    sp, sc = math.floor(spot - em), math.ceil(spot + em)       # SPY 0DTE lists $1 strikes near the money
    lp, lc = sp - PUT_WING, sc + CALL_WING
    row.update(lp=int(lp), sp=int(sp), sc=int(sc), lc=int(lc))

    # realised SPY context
    t1020, tclose = et_to_utc(date, EXIT_ET), et_to_utc(date, CLOSE_ET)
    after = s[(s["end"] > t945) & (s["end"] <= tclose)]
    row.update(mv_1020=round(spy_at(s, t1020) - spot, 2), mv_close=round(spy_at(s, tclose) - spot, 2),
               day_hi=round(float(after["high"].max()), 2), day_lo=round(float(after["low"].min()), 2))
    row["short_touched"] = ("call" if row["day_hi"] >= sc else "") + ("put" if row["day_lo"] <= sp else "")

    trend_skip = abs(spot - open_) > TREND_FRAC * em
    row["trend_move"] = round(spot - open_, 2)
    row["trend_limit"] = round(TREND_FRAC * em, 2)

    if date not in legs:
        row.update(decision_A="EXCLUDED", reason_A="no real option bars", data="-")
        return row
    bars, minutes = legs[date]
    m = Marks(bars, minutes)
    row["data"] = f"{minutes}m" + (" (10m sampling)" if step10 and minutes == 5 else "")
    have = {lg: int(bars[bars["leg"] == lg]["strike"].iloc[0]) for lg in ("sp", "lp", "sc", "lc")
            if (bars["leg"] == lg).any()}
    if have != {"sp": sp, "lp": lp, "sc": sc, "lc": lc}:
        row.update(decision_A="EXCLUDED", reason_A=f"fixture strikes {have} != computed")
        return row

    # entry marks: first bar end at/after 09:45 on the sampling grid
    grid = m.ends(t945 - pd.Timedelta(minutes=1), tclose, step10)
    entry_t = grid[0]
    credit = m.condor(entry_t)
    if credit is None:
        row.update(decision_A="EXCLUDED", reason_A="missing entry marks")
        return row
    fill = credit - CREDIT_CONCESSION
    row.update(entry_t=utc_to_et_str(entry_t), credit=round(credit, 2), fill=round(fill, 2))
    for k in ("sp", "lp", "sc", "lc"):
        row[f"px_{k}"] = m.leg_close(k, entry_t)

    # context legs (only in the richer 5-minute fixtures)
    if {"atm_c", "atm_p"} <= set(bars["leg"]):
        straddle = m.leg_close("atm_c", entry_t) + m.leg_close("atm_p", entry_t)
        row["straddle"] = round(straddle, 2)
        row["straddle_sigma"] = round(straddle / math.sqrt(2 / math.pi), 2)   # E|X| = 0.798 sigma
    if {"hp", "hc"} <= set(bars["leg"]):
        row["half_sigma_strangle"] = round(m.leg_close("hp", entry_t) + m.leg_close("hc", entry_t), 2)

    reasons = []
    if trend_skip:
        reasons.append(f"trend {spot - open_:+.2f} vs limit {TREND_FRAC * em:.2f}")
    if credit < MIN_CREDIT:
        reasons.append(f"credit {credit:.2f} < {MIN_CREDIT:.2f}")
    row["decision_A"] = "SKIP" if reasons else "ENTER"
    row["reason_A"] = "; ".join(reasons)

    t_exit, t_hold = et_to_utc(date, EXIT_ET), et_to_utc(date, HOLD_ET)
    c = manage(m, entry_t, fill, t_exit, step10)          # variant C (and A when A enters)
    c_hold = manage(m, entry_t, fill, t_hold, step10)     # variant C2 / B
    for k, v in c.items():
        row[f"C_{k}"] = v
    for k, v in c_hold.items():
        row[f"C2_{k}"] = v
    row["flags"] = "; ".join(dict.fromkeys(m.flags))
    core = bars[bars["leg"].isin(["sp", "lp", "sc", "lc"]) & bars["interpolated"]]
    row["interp_bars"] = ", ".join(f"{r.leg} {utc_to_et_str(r.end)}" for r in core.itertuples())
    return row


def summarize(pnls: list[float]) -> dict:
    if not pnls:
        return {"n": 0, "win_rate": None, "total": 0.0, "avg": None, "worst": None, "best": None}
    s = pd.Series(pnls)
    return {"n": len(s), "win_rate": round(float((s > 0).mean()) * 100, 1), "total": round(float(s.sum()), 2),
            "avg": round(float(s.mean()), 2), "worst": round(float(s.min()), 2), "best": round(float(s.max()), 2)}


def run(data_dir: str = DATA_DIR, step10: bool = False) -> pd.DataFrame:
    spy, vix, legs = load_spy(data_dir), load_vix(data_dir), load_legs(data_dir)
    dates = sorted(set(spy["date"]))
    return pd.DataFrame([replay_session(d, spy, vix, legs, step10) for d in dates])


def variant_table(df: pd.DataFrame) -> dict[str, dict]:
    traded = df[df.get("credit").notna()] if "credit" in df else df.iloc[0:0]
    a = traded[traded["decision_A"] == "ENTER"]
    return {
        "A  exact bot (filters on, exit by 10:20)": summarize(a["C_pnl"].dropna().tolist()),
        "B  A's entries, hold to 15:45 (target on)": summarize(a["C2_pnl"].dropna().tolist()),
        "C  no trend/min-credit filter, exit by 10:20": summarize(traded["C_pnl"].dropna().tolist()),
        "C2 no filters, hold to 15:45 (target on)": summarize(traded["C2_pnl"].dropna().tolist()),
    }


# ───────────── report ─────────────
def fmt(x, nd=2):
    if x is None or (isinstance(x, float) and math.isnan(x)):
        return ""
    return f"{x:.{nd}f}" if isinstance(x, float) else str(x)


def md_report(df: pd.DataFrame, df10: pd.DataFrame) -> str:
    traded = df[df["credit"].notna()]
    five = traded[traded["data"] == "5m"]
    ten = traded[traded["data"] == "10m"]
    first, last = df["date"].min(), df["date"].max()
    L = []
    L.append("# SPY 0DTE iron condor: replay on real Robinhood option bars\n")
    L.append(f"_Generated by `engine/letf/ic_replay.py` from `data/fixtures/0dte_real/` (offline). "
             f"Sessions {first} to {last}._\n")
    L.append("## Bottom line\n")
    n_a = int((traded["decision_A"] == "ENTER").sum())
    L.append(f"* **The bot as written would not have traded on any of the {len(traded)} sessions with real option "
             f"data.** Every non-event session failed the ${MIN_CREDIT:.2f} minimum-credit rule (A entries: "
             f"{n_a}). The trend filter never fired (largest 09:30-09:45 move was "
             f"{traded['trend_move'].abs().max():.2f} against a limit of about {traded['trend_limit'].min():.2f}).")
    L.append(f"* **Real mid credit at the bot's strikes was ${traded['credit'].min():.2f}-"
             f"${traded['credit'].max():.2f} (median ${traded['credit'].median():.2f})** per share for the "
             f"5-wide put / 3-wide call condor with shorts at +/-(VIX/16)% of spot. "
             f"That is far below the $0.30 floor, so variants A and B have n = 0.")
    if "straddle_sigma" in traded and traded["straddle_sigma"].notna().any():
        r = (traded["exp_move"] / traded["straddle_sigma"]).dropna()
        L.append(f"* Why (5-minute sessions, where ATM legs were also pulled): at 09:45 the 0DTE ATM straddle implied a 1-sigma move to the close of about "
                 f"${traded['straddle_sigma'].dropna().min():.2f}-${traded['straddle_sigma'].dropna().max():.2f}, "
                 f"while VIX/16 gave ${traded['exp_move'].min():.2f}-${traded['exp_move'].max():.2f}. The short "
                 f"strikes sit about {r.min():.1f}-{r.max():.1f} sigma out in the 0DTE market's own terms, where "
                 f"each option is worth a few cents. VIX (30-day) is the wrong ruler for a 6-hour option; VIX1D, "
                 f"which the bot prefers, is not served by the connector.")
    if "half_sigma_strangle" in traded and traded["half_sigma_strangle"].notna().any():
        h = traded["half_sigma_strangle"].dropna()
        L.append(f"* Even the naked short put + short call at half the distance (+/-0.5 x exp_move) were worth only "
                 f"${h.min():.2f}-${h.max():.2f} combined at 09:45, before paying for any wings.")
    c = variant_table(df)["C  no trend/min-credit filter, exit by 10:20"]
    L.append(f"* Forcing a trade every non-event day (variant C) gives n = {c['n']}, total "
             f"${c['total']:.2f} per contract, average ${fmt(c['avg'])}: the $0.02 + $0.02 fill concessions and "
             f"$0.32 fees are of the same size as the entire credit. The 25% target is worth 0.25-3 cents per "
             f"share, less than the $0.02 exit concession, so a target hit still loses money unless the debit "
             f"gaps far below the target between checks. Holding to 15:45 (C2) loses less only because more legs "
             f"decay to $0.00-$0.01.")
    L.append(f"* **n is small ({len(traded)} sessions, {len(five)} with exact 5-minute timing, {len(ten)} with "
             f"10-minute approximate timing) and cannot establish or rule out an edge.** This is a sanity check "
             f"of credit size and fill realism against a modeled backtest, nothing more.\n")

    L.append("## Data source and window\n")
    L.append("* Robinhood MCP connector, read-only calls only: `get_equity_historicals` (SPY 5-minute), "
             "`get_index_historicals` (VIX 5-minute), `get_option_instruments` (expired SPY contracts, chain "
             "`c277b118-58d9-4060-8dc5-a3b5898955cb`), `get_option_historicals`. Instrument ids are in "
             "`instruments.json`.")
    L.append("* **5-minute option bars are retained only for about the last 8 sessions.** Expiries 2026-09-29 "
             "through 2026-10-08 have real 5-minute bars on all legs. 2026-09-28 and earlier return only "
             "`interpolated: true` filler at 5-minute (and 1-minute) intervals, but **10-minute and 30-minute "
             "bars for the same contracts are real** (checked back to 2026-08-17). Sessions 2026-09-14 to "
             "2026-09-28 therefore use 10-minute bars (see the timing note below).")
    L.append(f"* SPY 5-minute bars cover {first} to {last} (no interpolated bars). VIX 09:45 values are the "
             f"close of the 13:40Z 5-minute bar.")
    interp = [f"{r.date} ({r.interp_bars} ET bar ends)" for r in traded.itertuples()
              if isinstance(r.interp_bars, str) and r.interp_bars]
    used = [f"{r.date}: {r.flags}" for r in traded.itertuples() if isinstance(r.flags, str) and r.flags]
    L.append("* Interpolated bars on the four condor legs: " + ("; ".join(interp) or "none") + ". "
             + ("Bars where the most recent real bar had to be substituted: " + "; ".join(used) + "."
                if used else "None of them was on an entry, check or exit bar actually used, so no "
                             "substitution was needed."))
    L.append("* Option bars are trade/mark prices, not bid/ask. The first bar of each session comes back with "
             "open = high = low = close; only closes from 09:45 on are used.\n")

    L.append("## Assumptions\n")
    L.append(f"* **Vol source:** {VOL_SOURCE}. The VIX1D >= {VIX1D_MAX:.0f} skip is therefore inactive, as in "
             f"the bot's own fallback path. exp_move = spot x (VIX/16)/100.")
    L.append("* **Spot / open:** spot = close of the SPY 13:40Z bar (09:45 ET); open = open of the 13:30Z bar.")
    L.append(f"* **Strikes:** sp = floor(spot - exp_move), sc = ceil(spot + exp_move) on the $1 grid, lp = sp - 5, "
             f"lc = sc + 3. Every strike was confirmed to exist with `get_option_instruments` (state=expired).")
    L.append(f"* **Entry:** mid credit = sp + sc - lp - lc from leg closes at the first bar end at or after "
             f"09:45; fill = credit - ${CREDIT_CONCESSION:.2f} (the bot's limit). Always assumed filled.")
    L.append(f"* **Management:** at every bar end until 10:20 ET, debit = sp + sc - lp - lc; exit when debit "
             f"<= fill x 0.75; otherwise exit at the 10:20 mark. Exit fill = debit + ${CREDIT_CONCESSION:.2f}. "
             f"The live bot polls every 60 s; bar closes are coarser, so hits between bar ends are missed.")
    L.append(f"* **Fees:** ${FEE_PER_LEG_SIDE:.2f} per leg per side, ${FEES_ROUND_TRIP:.2f} per condor round "
             f"trip (rough Alpaca regulatory/OCC pass-through; Alpaca charges no options commission). "
             f"P&L per contract = (fill - exit fill) x 100 - fees.")
    L.append("* **10-minute sessions (09-14 to 09-28):** entry marks are the 09:50 ET bar close (5 minutes after "
             "the decision), checks run at 10:00 / 10:10 / 10:20, and the hold-to-15:45 exit uses the 15:40 "
             "close. The table at the end reruns the 5-minute sessions on this 10-minute grid to show how much "
             "the coarser timing moves the numbers.")
    L.append("* **Fill realism:** a 2026-10-07 SPY chain snapshot (`data/fixtures/SPY_chain_20261007.csv`) shows "
             "a $0.01 bid/ask on every SPY option marked under $0.20. Taking the natural price on four legs "
             "costs about 4 x $0.005 = $0.02, so mid - $0.02 is roughly natural, provided the bar close is "
             "close to mid. At 1-cent ticks a 1-tick error per leg is 20-100% of these credits, so the P&L "
             "below is accurate only to a few dollars per contract.")
    L.append(f"* **Event days:** the bot's list ({', '.join(sorted(EVENT_DAYS))}); 2026-09-16 FOMC added for "
             f"September. No option data was pulled for event days.\n")

    L.append("## Per-session results\n")
    L.append("Credit, fill and debits are $ per share. P&L is $ per 1-lot condor after fees. Variant C trades "
             "every non-event day; variant A is the bot's own decision.\n")
    L.append("| date | data | A decision / skip reason | spot | VIX | exp_move | lp/sp - sc/lc | entry | credit | "
             "fill | C exit | C reason | C exit fill | C P&L | worst debit (to exit) | C2 exit | C2 P&L |")
    L.append("|---|---|---|---|---|---|---|---|---|---|---|---|---|---|---|---|---|")
    for r in df.itertuples():
        g = lambda k: getattr(r, k, None)
        strikes = f"{g('lp'):.0f}/{g('sp'):.0f} - {g('sc'):.0f}/{g('lc'):.0f}" if g("sp") == g("sp") and g("sp") is not None else ""
        dec = f"{r.decision_A}" + (f": {r.reason_A}" if isinstance(r.reason_A, str) and r.reason_A else "")
        L.append(f"| {r.date} | {g('data') or ''} | {dec} | {fmt(g('spot'))} | {fmt(g('vol'))} | {fmt(g('exp_move'))} | "
                 f"{strikes} | {g('entry_t') if isinstance(g('entry_t'), str) else ''} | {fmt(g('credit'))} | "
                 f"{fmt(g('fill'))} | {g('C_exit_t') if isinstance(g('C_exit_t'), str) else ''} | "
                 f"{g('C_exit_reason') if isinstance(g('C_exit_reason'), str) else ''} | {fmt(g('C_exit_fill'))} | "
                 f"{fmt(g('C_pnl'))} | {fmt(g('C_worst_debit'))} | "
                 f"{g('C2_exit_t') if isinstance(g('C2_exit_t'), str) else ''} | {fmt(g('C2_pnl'))} |")
    L.append("")
    L.append("Leg prices at entry (sp / lp / sc / lc):\n")
    L.append("| date | sp | lp | sc | lc | ATM straddle | straddle 1-sigma | exp_move / sigma | strangle at 0.5 x exp_move |")
    L.append("|---|---|---|---|---|---|---|---|---|")
    for r in traded.itertuples():
        g = lambda k: getattr(r, k, None)
        ratio = (r.exp_move / g("straddle_sigma")) if g("straddle_sigma") == g("straddle_sigma") and g("straddle_sigma") else None
        L.append(f"| {r.date} | {fmt(r.px_sp)} | {fmt(r.px_lp)} | {fmt(r.px_sc)} | {fmt(r.px_lc)} | "
                 f"{fmt(g('straddle'))} | {fmt(g('straddle_sigma'))} | {fmt(ratio, 1)} | {fmt(g('half_sigma_strangle'))} |")
    L.append("")

    L.append("## Variant summary ($ per 1-lot condor, after fees)\n")
    L.append("| variant | sample | n trades | win rate % | total | avg | worst | best |")
    L.append("|---|---|---|---|---|---|---|---|")
    for label, sub in (("all", df), ("5-minute only", df[df["data"].isin(["5m", "-"])]),
                       ("10-minute only", df[df["data"].isin(["10m", "-"])])):
        for name, s in variant_table(sub).items():
            L.append(f"| {name} | {label} | {s['n']} | {fmt(s['win_rate'], 1)} | {fmt(s['total'])} | "
                     f"{fmt(s['avg'])} | {fmt(s['worst'])} | {fmt(s['best'])} |")
    L.append("")

    L.append("## D. Adverse excursion\n")
    L.append("Variant A took no trades, so excursion is shown for the variant C trades: the worst (highest) "
             "debit marked between entry and exit, the worst debit if held to 15:45, and the theoretical max "
             "loss on the wider (5-point put) wing, (5 - fill) x 100 + fees.\n")
    L.append("| date | fill | worst debit to 10:20 exit | worst debit to 15:45 | max loss wide wing |")
    L.append("|---|---|---|---|---|")
    for r in traded.itertuples():
        L.append(f"| {r.date} | {fmt(r.fill)} | {fmt(r.C_worst_debit)} | {fmt(r.C2_worst_debit)} | "
                 f"{fmt(r.C_max_loss_wide_wing)} |")
    L.append("")

    L.append("## Context: realized SPY move vs exp_move\n")
    L.append("| date | exp_move | 09:45->10:20 | x exp_move | 09:45->16:00 | x exp_move | high/low after 09:45 | short strike touched |")
    L.append("|---|---|---|---|---|---|---|---|")
    for r in df[df["exp_move"].notna()].itertuples() if "exp_move" in df else []:
        L.append(f"| {r.date} | {fmt(r.exp_move)} | {fmt(r.mv_1020)} | {fmt(r.mv_1020 / r.exp_move)} | "
                 f"{fmt(r.mv_close)} | {fmt(r.mv_close / r.exp_move)} | {fmt(r.day_hi)} / {fmt(r.day_lo)} | "
                 f"{r.short_touched or 'no'} |")
    L.append("")

    if df10 is not None and len(df10):
        t5 = df[df["data"] == "5m"].set_index("date")
        t10 = df10[df10["date"].isin(t5.index) & df10["credit"].notna()].set_index("date")
        L.append("## Timing check: 5-minute sessions resampled to the 10-minute grid\n")
        L.append("Same sessions, entry at 09:50 and checks every 10 minutes, as used for 09-14 to 09-28.\n")
        L.append("| date | credit 09:45 | credit 09:50 | C P&L 5m | C P&L 10m grid | C2 P&L 5m | C2 P&L 10m grid |")
        L.append("|---|---|---|---|---|---|---|")
        for d in t10.index:
            L.append(f"| {d} | {fmt(t5.loc[d, 'credit'])} | {fmt(t10.loc[d, 'credit'])} | {fmt(t5.loc[d, 'C_pnl'])} | "
                     f"{fmt(t10.loc[d, 'C_pnl'])} | {fmt(t5.loc[d, 'C2_pnl'])} | {fmt(t10.loc[d, 'C2_pnl'])} |")
        L.append("")

    L.append("## Caveats\n")
    L.append("* Small n: a handful of calm days (VIX 14-17) in one regime. Nothing here estimates tail risk. No "
             "short strike was breached in the window (closest: 2026-09-21, SPY high 774.89 vs the 775 short "
             "call, close +0.93 x exp_move).")
    L.append("* Marks are bar closes of trades/marks, not quotes; several deep-OTM legs print the same "
             "$0.01-$0.03 for hours, which may be stale last-trade values rather than live mids.")
    L.append("* The fill model assumes every limit fills (mid - $0.02 in, mid + $0.02 out).")
    L.append("* To extend: add `legs_YYYYMMDD.csv` (5-minute) or `legs10_YYYYMMDD.csv` files, VIX rows and SPY "
             "bars for new sessions and re-run the script. 10-minute bars reach back further than 5-minute "
             "bars, so a larger 10-minute sample is available on request.")
    return "\n".join(L) + "\n"


def main(argv=None):
    ap = argparse.ArgumentParser(description=__doc__.split("\n")[0])
    ap.add_argument("--data-dir", default=DATA_DIR)
    ap.add_argument("--out-md", default=OUT_MD)
    ap.add_argument("--out-csv", default=OUT_CSV)
    ap.add_argument("--no-write", action="store_true")
    a = ap.parse_args(argv)
    df = run(a.data_dir)
    df10 = run(a.data_dir, step10=True)
    cols = ["date", "data", "decision_A", "reason_A", "spot", "vol", "exp_move", "lp", "sp", "sc", "lc",
            "entry_t", "credit", "fill", "C_exit_t", "C_exit_reason", "C_pnl", "C_worst_debit", "C2_exit_t",
            "C2_exit_reason", "C2_pnl"]
    with pd.option_context("display.width", 250, "display.max_columns", 40):
        print(df[[c for c in cols if c in df]].to_string(index=False))
    for name, s in variant_table(df).items():
        print(f"{name:48s} {s}")
    if not a.no_write:
        os.makedirs(os.path.dirname(a.out_md), exist_ok=True)
        with open(a.out_md, "w") as f:
            f.write(md_report(df, df10))
        df.drop(columns=[c for c in df if c.endswith("_path")]).to_csv(a.out_csv, index=False)
        print(f"wrote {a.out_md}\nwrote {a.out_csv}")
    return df


if __name__ == "__main__":
    main()
