# LETF Levels & Signals (Pine Script v6 indicator)

`letf_levels_signals.pine` is a TradingView **indicator** (not a strategy) for TQQQ, UPRO, QQQ or SPY on
5m / 15m / 1h / 4h charts. It overlays:

1. **Engine levels** pasted from the Python options engine (gamma flip, call/put walls, max pain, vol trigger, vanna levels, catalysts).
2. **Native levels** computed on the chart: round numbers, prior-day H/L/C, session VWAP with ±1σ/±2σ bands, opening range, pivot S/R, daily EMA20 / SMA200.
3. **Regime context** in a table: daily trend, VIX percentile regime, gamma regime, daily RSI(5), 5-day pullback, next catalyst, signal state.
4. **Systematic long-call / long-put signals** with alert conditions.

License: MIT. The level-paste pattern is inspired by community scripts (BKLevels, Gamma Exposure Profile – Manual Chain Input).

---

## Installation

1. Open TradingView → chart → **Pine Editor** (bottom panel).
2. Click **Open → New indicator**, delete the template, paste the full contents of `letf_levels_signals.pine`.
3. **Save** (give it a name) and click **Add to chart**.
4. Open the indicator settings (gear icon) and paste the engine block into **Engine levels**.

Requirements and plan notes:

- Uses 3 `request.security` calls (own symbol daily ×2, VIX daily ×1), well under the free-plan limit.
- `max_lines_count=500`, `max_labels_count=500`, `max_boxes_count=100` are declared; drawings are pruned so the limits are never hit in practice.
- The script compiles and runs with an empty **Engine levels** input; everything that depends on pasted levels shows `n/a`.
- VIX symbol defaults to `CBOE:VIX`. If your plan cannot access it, set the input to `TVC:VIX`. An invalid symbol does not error, it yields a `n/a` vol regime (`ignore_invalid_symbol=true`).
- Meant for intraday charts. Opening range and session VWAP are only meaningful ≤ 1h; on a daily chart the session logic degenerates to one bar per "session".

---

## The paste format ("Engine levels" input)

One record per line. Lines may also be separated by `;` (the script replaces every `;` with a newline before parsing, so a single-line paste works). The first line is a header that starts with `#`.

```
#v1;sym=TQQQ;date=2026-10-07;src=QQQ;ratio=0.1387
flip,105.20,80,Gamma flip
callwall,110.00,100,Call wall
putwall,98.50,90,Put wall
maxpain,104.00,50,Max pain
vt,103.30,60,Vol trigger
hvl,101.10,40,High vanna
lvl,106.75,30,Level
catalyst,2026-10-08,CPI 8:30
catalyst,2026-10-10,OPEX
```

### Header

`key=value` pairs separated by `;` (or on their own lines).

| key     | meaning                                                                                   |
|---------|-------------------------------------------------------------------------------------------|
| `sym`   | Ticker the levels belong to. Must equal `syminfo.ticker` of the chart (case-insensitive) or the whole paste is **ignored** and a red warning label is drawn. If `sym` is omitted the paste is accepted. |
| `date`  | Level date `YYYY-MM-DD`. Compared with the chart's date in **exchange time**.             |
| `src`   | Informational (e.g. the underlying the chain came from). Shown in the table.              |
| `ratio` | Informational (e.g. the leveraged-ETF / underlying price ratio). Shown in the table.      |

### Level rows: `type,price,strength,label`

- `type` (case-insensitive) → color: `callwall` red, `putwall` green, `flip` orange, `maxpain` blue, `vt` purple, anything else (`hvl`, `lvl`, …) gray.
- `price` must parse as a positive number, otherwise the row is skipped.
- `strength` 0–100 (optional, default 50). Drives line width 1–4 and transparency (stronger = wider and more opaque).
- `label` optional (defaults to the type). Commas inside the label are kept.

Each level is drawn as a horizontal line from the first bar of the current session, extended to the right, with a label to the right of the last bar showing `label  price`.

Special types feed the regime and signals:

- `flip` → gamma regime (background faint green above the flip, faint red below), flip-cross alerts, long-put logic.
- `putwall` → long-call setup requires price above the put wall.
- `callwall`, `putwall`, `flip`, `maxpain` → level-touch markers and alerts.

### Catalyst rows: `catalyst,YYYY-MM-DD,label`

Feed the catalyst table (bottom-right by default) and the "Next catalyst" row. When a catalyst date equals the chart's current date (exchange time): a vertical dashed yellow line is drawn at the session open, a **CATALYST TODAY** tag is shown, the "Catalyst today" alert fires once at the open, and (if enabled) signals require an extra confirmation bar.

### Stale levels

If the header `date` is not the date of the last bar on the chart (exchange time) the paste is considered **stale**:

- **Hide stale levels = ON** (default): nothing is drawn; a gray info label says the levels are hidden; the gamma regime and level-based signal filters treat the levels as absent.
- **Hide stale levels = OFF**: levels are drawn with at least 50% transparency and remain active for regime/signals on every bar.

On a non-stale paste, levels are only "active" on bars of the header date, so historical bars on other days are not colored by a flip that did not apply to them.

### Parsing robustness

Whitespace is trimmed, blank/invalid lines are skipped, missing strength/label are tolerated, bad numbers never throw. Parsing happens once on the first bar (a changed input re-runs the script, so it is always current). Lines and labels for the pasted levels are deleted and redrawn on the last bar only.

---

## Inputs

### Engine levels (paste)
| input | default | notes |
|---|---|---|
| Engine levels | empty | the pasted block |
| Hide stale levels | true | see above |
| Level label offset (bars to the right) | 3 | where level labels sit |

### Native levels
| input | default | notes |
|---|---|---|
| Round numbers / step (0 = auto) | on / 0 | auto step: price < 50 → 1, < 200 → 5, < 1000 → 10, else 50 |
| Round-number steps each side of price | 6 | lines drawn ± N steps around the last close |
| Half-step dotted round numbers | off | |
| Prior day high / low / close | on | `request.security(…, "D", [high[1], low[1], close[1]])`, no lookahead |
| Session VWAP / ±1σ ±2σ bands | on / on | VWAP anchored to session start; bands are the cumulative volume-weighted standard deviation of hlc3 around VWAP since the anchor. If volume is 0/na the bar is weighted 1. |
| Opening range / OR window | on / `0930-0945` | session string in exchange time (`input.session`); change the end time to change the OR length |
| Keep OR drawings for N days | 5 | older OR boxes/lines are deleted |
| Pivot S/R / left / right | on / 10 / 5 | `ta.pivothigh` / `ta.pivotlow` |
| Pivots kept per side | 6 | most recent pivots kept as right-extended dashed lines |
| Daily EMA20 / SMA200 | on | from the "D" timeframe |

### Regime
| input | default | notes |
|---|---|---|
| VIX symbol | `CBOE:VIX` | try `TVC:VIX` if unavailable |
| VIX percentile window (daily bars) | 252 | percentile = % of prior daily closes in the window that are below the current close |
| Use completed daily bars (non-repainting) | true | ON: daily EMA/SMA/RSI/VIX/5-day-high come from the last **completed** daily bar (`[1]`), so values do not change intraday and historical bars do not see end-of-day data. The 5-day high then = max(prior 4 completed days, today's running high). OFF: the developing daily bar is used. |
| Gamma regime background | true | |

### Signals
| input | default | notes |
|---|---|---|
| Call: min 5-day pullback % | 1.5 | pullback = (5-day high − close) / 5-day high |
| Call: daily RSI5 below | 40 | |
| Put: daily RSI5 above | 60 | |
| Level touch tolerance % | 0.15 | bar range overlaps level ± tolerance |
| Require confirmation on catalyst days | true | see below |
| Show level-touch markers | true | |

### Display
| input | default |
|---|---|
| Regime table / table position | on / top right |
| Catalyst table / catalyst table position | on / bottom right |
| Catalyst rows shown | 8 |

---

## Regime definitions

- **Trend (D)**: `close > SMA200(D) and close > EMA20(D)` → UP; both below → DOWN; else MIXED. The chart close is compared with the daily moving averages.
- **Vol regime**: VIX percentile rank over the window: LOW < 25, NORMAL 25–75, HIGH > 75, EXTREME > 90. The table shows the VIX close and percentile.
- **Gamma**: price above pasted `flip` → POSITIVE GAMMA (faint green background); below → NEGATIVE GAMMA (faint red); no flip → n/a.
- **RSI5 (D)**: daily RSI(5).
- **Pullback 5d**: (highest high over 5 daily bars − close) / highest high, in %.

## Signal rules (evaluated on bar close)

**LONG CALL**
- Setup: daily close > SMA200(D) **and** pullback ≥ 1.5 % **and** RSI5(D) < 40 **and** vol regime ≠ EXTREME **and** (if a `putwall` is pasted) close > put wall.
- Trigger: close crosses above session VWAP **or** close > previous bar high, while the setup is true.
- Plot: green triangle below the bar with "CALL". Fires at most once per day and not again until the setup has gone false.

**LONG PUT**
- Setup: close < EMA20(D) **and** (close < SMA200(D) **or** price below pasted `flip`) **and** RSI5(D) > 60 **and** vol regime ≠ LOW.
- Trigger: close crosses below session VWAP **or** close < previous bar low.
- Plot: red triangle above the bar with "PUT". Same once-per-day / re-arm logic.

**Catalyst-day confirmation** (default on): on a day with a pasted catalyst, the setup + trigger must occur on bar N and bar N+1 must close above (call) / below (put) bar N's close before the signal fires.

**Level touches**: a small circle at the level when the bar's range comes within the tolerance of the call wall, put wall, flip or max pain.

Signals use `barstate.isconfirmed`, so on the realtime bar they appear (and `var` state updates) only when the bar closes. Use the **"Once per bar close"** alert frequency.

---

## Alerts

Create an alert on the chart → Condition: *LETF Levels & Signals* → choose one of:

| alert | fires when | message |
|---|---|---|
| Long call signal | long-call signal bar closes | `{"sym":"{{ticker}}","event":"LONG_CALL","price":{{close}},"tf":"{{interval}}","time":"{{timenow}}"}` |
| Long put signal | long-put signal bar closes | `{"sym":"{{ticker}}","event":"LONG_PUT",…}` |
| Touch call wall | bar range within tolerance of call wall | `…"event":"TOUCH_CALLWALL"…` |
| Touch put wall | bar range within tolerance of put wall | `…"event":"TOUCH_PUTWALL"…` |
| Touch gamma flip | bar range within tolerance of flip | `…"event":"TOUCH_FLIP"…` |
| Touch max pain | bar range within tolerance of max pain | `…"event":"TOUCH_MAXPAIN"…` |
| Cross gamma flip up | close crosses above flip | `…"event":"FLIP_CROSS_UP"…` |
| Cross gamma flip down | close crosses below flip | `…"event":"FLIP_CROSS_DOWN"…` |
| Catalyst today | first bar of a session whose date has a pasted catalyst | `…"event":"CATALYST_TODAY"…` |

The messages are JSON-like strings with TradingView placeholders (`{{ticker}}`, `{{close}}`, `{{interval}}`, `{{timenow}}`) that are substituted when the alert fires, so a webhook receiver can parse them directly. Use "Once per bar close" for the signal alerts; touch/cross alerts can also use "Once per bar".

---

## Known limitations

- "Today" means the date of the **last bar on the chart** in exchange time; on a weekend a Friday-dated paste is still "fresh".
- The opening-range box on 1h/4h charts covers the first bar that starts inside the OR window.
- Only the last pasted `flip`/`callwall`/`putwall`/`maxpain` of each type is used for regime and signals (all rows are still drawn).
- `request.security` on a chart timeframe above daily is not supported.
