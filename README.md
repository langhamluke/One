# One — leveraged-ETF options engine (TQQQ / UPRO / QQQ / SPY)

Two layers, because TradingView's Pine Script cannot read options chains or the web:

1. **Engine (Python, `engine/letf`)** — pulls live chains, computes dealer gamma exposure
   (flip, call/put walls, max pain, vanna/charm), maps QQQ/SPY levels onto TQQQ/UPRO,
   reads the catalyst calendar and free sentiment feeds, scores a systematic signal,
   ranks every single-leg contract by expected value with Kelly sizing, writes a report,
   and alerts by email/SMS. Emits a level block you paste into TradingView.
2. **Pine indicator (`pine/letf_levels_signals.pine`)** — plots the pasted levels plus
   native levels (round numbers, VWAP bands, opening range, pivots, prior day H/L),
   regime table, and the same long-call / long-put signals with alerts.

Research behind the design (60+ repos and scripts reviewed): `docs/research/prior-art.md`.

## Quick start (your machine or a droplet)

```bash
git clone -b claude/serene-clarke-ln6u4a https://github.com/langhamluke/One.git && cd One
cp .env.example .env            # add Alpaca keys (free paper account) + email/SMS settings
cp config/settings.example.yaml config/settings.yaml
docker compose run --rm letf python -m letf run      # one report now
docker compose up -d --build                           # scheduler: pre-open, every 15 min RTH, post-close
```
Without Docker: `python3 -m venv .venv && . .venv/bin/activate && pip install -r engine/requirements.txt && cd engine && python -m letf run`.

Droplet one-liner (Ubuntu, as root): `curl -fsSL https://raw.githubusercontent.com/langhamluke/One/claude/serene-clarke-ln6u4a/deploy/droplet.sh | bash`

Offline demo with recorded chains: `cd engine && python -m letf run --provider fixtures --offline`.

## What the engine does on each run

| Step | Module | Notes |
|---|---|---|
| Catalysts | `catalysts.py` | Computed: OPEX, quad witching, VIX expiry, quarter/month end, Russell and Nasdaq-100 reconstitution, election days. Fetched: FOMC (Fed), CPI and jobs (BLS). Yours: `config/catalysts.yaml` (political deadlines, IPOs, earnings). |
| Sentiment | `sentiment/` | Free sources only: RSS (ZeroHedge, Seeking Alpha, CNBC, Google News incl. geopolitics), Reddit public JSON, Telegram public channel (Walter Bloomberg mirror), optional TradingView ideas. Scored with pyfin-sentiment or a finance lexicon. Capped at ±15% of the signal. |
| Gamma | `gex.py`, `levels.py` | SqueezeMetrics/SpotGamma convention. Flip by both cumulative crossing and the rigorous spot-shift profile. Levels mapped to 3x ETFs by percent distance × leverage. |
| Signal | `signals.py` | Trend (SMA200/EMA20) + dip/bounce (5-day pullback, RSI5) core, gamma regime, catalyst pressure, sentiment. Hard blocks: IV rank too high to buy premium, EXTREME vol for calls, LOW vol for puts. |
| Ranking | `ranker.py` | Monte Carlo terminal distribution (lognormal + Student-t blend, drift from score). EV, EV/premium, POP, P(2x), Kelly. Filters: delta 0.15–0.65, OI ≥ 100, volume ≥ 10, spread ≤ 12%. Premium cap 1% of account, half-Kelly. |
| Output | `report.py`, `notify.py` | `out/latest.md`, `out/ranked_<SYM>.csv`, `out/levels_<SYM>.txt` (paste into Pine), email + SMS on signal change. |

## Risk defaults (editable in `config/settings.yaml`)
Max premium per trade 1% of account, max 3 open positions, 3% total premium at risk, half-Kelly cap, take profit 2x, stop −50%, time stop at 1 DTE. Defined-risk short premium into events requires spreads and is off (`allow_spreads: false`).

## Data sources
Alpaca (free paper keys give greeks + IV + OI on an indicative feed; Algo Trader Plus gives real-time OPRA), CBOE free delayed JSON (no keys), or recorded fixtures. Daily history via yfinance with a CSV cache in `data/cache/`.

## Backtest
`cd engine && python -m letf.backtest --symbols TQQQ UPRO --parents QQQ SPY --start 2020-01-01 --out ../out/backtest` — synthetic Black-Scholes option pricing from VXN/VIX, walk-forward optimization, trade-bootstrap Monte Carlo. Read the limitations section in the generated report before trusting any number.

## Tests
`cd engine && python -m pytest -q`
