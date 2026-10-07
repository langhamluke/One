"""Command line: `python -m letf run` (once) or `python -m letf serve` (scheduler)."""
from __future__ import annotations

import argparse
import json
import os
import sys
import time
from datetime import datetime, timezone, date
from zoneinfo import ZoneInfo

import pandas as pd

from . import config, gex, levels, catalysts, signals, ranker, report, notify
from .data import prices


def make_provider(cfg: dict):
    name = cfg["provider"]
    if name == "fixtures":
        from .data.fixtures import FixtureProvider
        return FixtureProvider(cfg["fixtures_dir"])
    if name == "cboe":
        from .data.cboe import CboeProvider
        return CboeProvider()
    if name == "alpaca":
        from .data.alpaca import AlpacaProvider
        return AlpacaProvider()
    raise SystemExit(f"unknown provider {name}")


def run_once(cfg: dict, online: bool = True, verbose: bool = True) -> dict:
    tz = ZoneInfo(cfg["schedule"]["tz"])
    now = datetime.now(timezone.utc)
    today = now.astimezone(tz).date()
    prov = make_provider(cfg)
    out_dir = cfg["out_dir"]
    os.makedirs(out_dir, exist_ok=True)
    run = {"as_of": now.isoformat(timespec="minutes"), "today": today, "provider": prov.name, "account": cfg["account"],
           "gex": {}, "signals": {}, "ranked": {}, "best": {}, "event_sales": {}}

    # 1. catalysts + sentiment
    cal = catalysts.calendar_for(today, 45, cfg["catalysts_yaml"], cfg["cache_dir"], online=online)
    pressure, soon = catalysts.catalyst_pressure(cal, today)
    run["catalysts"] = [c for c in cal if c.days_until(today) <= 10]
    sent = {"score": 0.0, "n_items": 0, "model": "off", "risk_flags": {}}
    if cfg["sentiment"]["enabled"] and online:
        from .sentiment.score import collect
        s = cfg["sentiment"]
        sent, _ = collect(s["rss"], s["reddit"], s["telegram"], s.get("tradingview", False))
        if sent["risk_flags"]:
            pressure = min(1.0, pressure + 0.1 * min(len(sent["risk_flags"]), 3))
    run["sentiment"] = sent

    # 2. gamma on parents, mapped to leveraged ETFs
    snaps = {}
    for sym in cfg["gex_symbols"]:
        try:
            snap = prov.chain(sym, max_dte=60)
        except Exception as e:
            if verbose:
                print(f"[gex] {sym}: chain failed: {e}")
            continue
        snaps[sym] = snap
        res = gex.analyze(snap.chain, sym, snap.spot, snap.as_of, dte_filter=cfg["dte_filter"])
        lv = levels.levels_from_gex(res)
        mapped = {}
        for dst, (src, lev) in levels.LEVERAGE.items():
            if src == sym and dst in cfg["trade_symbols"]:
                try:
                    dst_spot = prov.spot(dst)
                except Exception:
                    dst_spot = None
                if dst_spot:
                    ml = levels.map_levels(lv, snap.spot, dst_spot, lev)
                    mapped[dst] = ml
                    with open(os.path.join(out_dir, f"levels_{dst}.txt"), "w") as f:
                        f.write(levels.pine_block(ml, dst, today, sym, dst_spot / snap.spot, [(c.day, c.label) for c in run["catalysts"]]))
        with open(os.path.join(out_dir, f"levels_{sym}.txt"), "w") as f:
            f.write(levels.pine_block(lv, sym, today, sym, 1.0, [(c.day, c.label) for c in run["catalysts"]]))
        run["gex"][sym] = {"summary": res.summary(), "levels": lv, "mapped": mapped, "result": res}

    # 3. signals on parents (daily bars), applied to parent + leveraged children
    sp = signals.SignalParams(**cfg.get("signals", {}))
    for sym in cfg["gex_symbols"]:
        try:
            px = prices.daily(sym, cfg["cache_dir"], refresh=online)
            vol = None
            for vsym in (cfg["vol_index"].get(sym, "VIX"), "VIX"):
                try:
                    vol = prices.daily(vsym, cfg["cache_dir"], refresh=online)
                    break
                except Exception:
                    continue
        except Exception as e:
            if verbose:
                print(f"[signals] {sym}: price history failed: {e}")
            continue
        g = run["gex"].get(sym, {}).get("summary", {})
        ctx = signals.SignalContext(gamma_regime=g.get("regime", "unknown"), flip=g.get("flip"), call_wall=g.get("call_wall"), put_wall=g.get("put_wall"),
                                    sentiment=sent.get("score", 0.0), catalyst_pressure=pressure, catalyst_labels=[c.label for c in soon])
        sig, feats = signals.latest_signal(px, vol, ctx, sp)
        run["signals"][sym] = sig
        if cfg.get("allow_spreads"):
            es = signals.event_premium_sale(feats.iloc[-1], pressure, sp)
            if es:
                run["event_sales"][sym] = es
        # 4. rank contracts on parent and its leveraged children
        targets = [sym] + [d for d, (s, _) in levels.LEVERAGE.items() if s == sym and d in cfg["trade_symbols"]]
        rp = ranker.RankParams(account=cfg["account"], max_premium_pct=cfg["risk"]["max_premium_pct"], kelly_cap=cfg["risk"]["kelly_cap"], **cfg["ranker"])
        for t in targets:
            if sig.direction == "NONE":
                run["ranked"][t] = pd.DataFrame()
                continue
            try:
                snap = snaps.get(t) or prov.chain(t, max_dte=cfg["ranker"]["max_dte"] + 1)
                snaps[t] = snap
            except Exception as e:
                if verbose:
                    print(f"[rank] {t}: chain failed: {e}")
                continue
            # leveraged children: the same percent score applies, the chain's own IV carries the 3x
            df = ranker.rank_singles(snap.chain, snap.spot, sig.score, sig.direction, snap.as_of, rp, symbol=t)
            run["ranked"][t] = df
            run["best"][t] = ranker.best(df)
            if not df.empty:
                df.to_csv(os.path.join(out_dir, f"ranked_{t}.csv"), index=False)

    # 5. report + alerts
    md = report.markdown(run)
    with open(os.path.join(out_dir, f"report_{today.isoformat()}.md"), "w") as f:
        f.write(md)
    with open(os.path.join(out_dir, "latest.md"), "w") as f:
        f.write(md)
    state_path = os.path.join(out_dir, "state.json")
    prev = json.load(open(state_path)) if os.path.exists(state_path) else {}
    cur = {s: sg.direction for s, sg in run["signals"].items()}
    changed = cur != prev.get("signals")
    json.dump({"signals": cur, "as_of": run["as_of"]}, open(state_path, "w"))
    text = report.sms(run)
    if text and (changed or not cfg["alerts"]["only_on_change"]):
        res = notify.alert(f"LETF signal {today}", md, text)
        run["alert_result"] = res
    if verbose:
        print(md)
    return run


def serve(cfg: dict):
    """Simple scheduler: pre-open, every N minutes during RTH, post-close. Runs forever."""
    tz = ZoneInfo(cfg["schedule"]["tz"])
    every = int(cfg["schedule"]["intraday_every_min"])
    last_slot = None
    while True:
        now = datetime.now(tz)
        hm = now.strftime("%H:%M")
        weekday = now.weekday() < 5
        in_rth = "09:30" <= hm <= "16:00"
        slot = None
        if weekday and hm == cfg["schedule"]["pre_open"]:
            slot = ("pre", now.date())
        elif weekday and hm == cfg["schedule"]["post_close"]:
            slot = ("post", now.date())
        elif weekday and in_rth and now.minute % every == 0:
            slot = ("rth", now.strftime("%Y-%m-%d %H:%M"))
        if slot and slot != last_slot:
            last_slot = slot
            try:
                run_once(cfg, online=True, verbose=False)
                print(f"[serve] ran {slot}")
            except Exception as e:
                print(f"[serve] run failed: {e}")
        time.sleep(20)


def main(argv=None):
    ap = argparse.ArgumentParser(prog="letf")
    ap.add_argument("cmd", choices=["run", "serve", "levels"])
    ap.add_argument("--config", default="config/settings.yaml")
    ap.add_argument("--offline", action="store_true", help="no network: fixtures + cache only")
    ap.add_argument("--provider", help="override provider: alpaca|cboe|fixtures")
    args = ap.parse_args(argv)
    cfg = config.load(args.config)
    if args.provider:
        cfg["provider"] = args.provider
    if args.cmd == "run":
        run_once(cfg, online=not args.offline)
    elif args.cmd == "levels":
        cfg["sentiment"]["enabled"] = False
        run = run_once(cfg, online=not args.offline, verbose=False)
        for sym in run["gex"]:
            print(open(os.path.join(cfg["out_dir"], f"levels_{sym}.txt")).read())
    else:
        serve(cfg)


if __name__ == "__main__":
    main()
