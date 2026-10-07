# Prior art: open-source code and ideas for the TQQQ / UPRO / QQQ / SPY options system

Compiled 2026-10-07. Four parallel research sweeps covered GitHub, TradingView, QuantConnect,
Reddit, Substack, and the options-data vendor landscape. Everything below was verified by
fetching the repository page unless marked **unverified** (the sandbox's network policy blocks
tradingview.com, quantconnect.com, cboe.com, spotgamma.com and several other vendor domains, so
those details come from search-index snippets). Star counts and dates are as of the compile date.
All backtest numbers are author-reported and should be treated as claims, not results.

---

## 1. Bottom line

**What exists and is worth building on**

| Need | Best existing piece | License | Why |
|---|---|---|---|
| Gamma exposure, flip, walls, vanna, charm for SPX/NDX/SPY/QQQ | [Darthreign/gex-dashboard](https://github.com/Darthreign/gex-dashboard) | MIT | Active (commit 2026-10-06), free CBOE data, exactly our four parents, ships an MCP server and Discord bot |
| Clean, tested GEX formula layer | [FlashAlpha-lab/gex-explained](https://github.com/FlashAlpha-lab/gex-explained) | MIT | Small pure functions for GEX, flip, walls, DEX, VEX, CHEX with tests; data-source agnostic |
| Rigorous zero-gamma (spot-shift profile) | [jensolson/SPX-Gamma-Exposure](https://github.com/jensolson/SPX-Gamma-Exposure) | unverified | Only repo implementing the Perfiliev method rather than the naive cumulative-sum crossing |
| Probability of profit and expected value per contract | [rgaveiga/optionlab](https://github.com/rgaveiga/optionlab) | GPL-3 | 575 stars, updated 2026-09, supports custom price distributions |
| Live chain to POP/ROC ranking | [twolven/mcp-optionsflow](https://github.com/twolven/mcp-optionsflow) | MIT | Closest thing to a live scanner; evaluates credit spreads and CSPs with POP and liquidity checks |
| Fast IV and greeks | [vollib/py_vollib](https://github.com/vollib/py_vollib) | MIT | Standard, maintained |
| Kelly and fractional Kelly sizing | [wdm0006/keeks](https://github.com/wdm0006/keeks) | MIT | Drawdown-adjusted Kelly; binary-outcome only, so we wrap it |
| SPX 0DTE credit spread backtest with trade log | [thunderscarf/SPX_0DTE_Options_Selling_Public](https://github.com/thunderscarf/SPX_0DTE_Options_Selling_Public) | MIT | Expected-move sizing from VIX1D, regime-directed side selection; needs Polygon |
| Options portfolio backtester | [lambdaclass/options_backtester](https://github.com/lambdaclass/options_backtester) | MIT | Rust core, presets for condors, strangles, tail hedges; bring your own chain history |
| Synthetic pre-inception TQQQ/UPRO history | [nateGeorge/simulate_leveraged_ETFs](https://github.com/nateGeorge/simulate_leveraged_ETFs) | unverified | Extends TQQQ to 1999 and UPRO to 1993 for backtests |
| TradingView ideas scraper | [mnwato/tradingview-scraper](https://github.com/mnwato/tradingview-scraper) | MIT | 428 stars, updated 2026-09; Ideas, Minds, News, screener |
| Substack pulls | [NHagar/substack_api](https://github.com/NHagar/substack_api) | unverified | 229 stars, updated 2026-09; plus plain RSS |
| Reddit sentiment MCP | [ferdousbhai/wsb-analyst-mcp](https://github.com/ferdousbhai/wsb-analyst-mcp) | unverified | Ready to call from Claude |
| Social-text sentiment model | [FinTwitBERT-sentiment](https://github.com/TimKoornstra/FinTwitBERT) | GPL-3 repo, HF model | Trained on tweets, not headlines |
| VIX term structure | [dougransom/vix_utils](https://github.com/dougransom/vix_utils) | unverified | Free CBOE futures CSVs to contango/backwardation series |
| Pine level injection pattern | Gamma Exposure Profile - Manual Chain Input ([o4YZLni4](https://www.tradingview.com/script/o4YZLni4/)) and BKLevels ([30d9iBGn](https://www.tradingview.com/script/30d9iBGn-BKLevels)) | open-source on TV | Header-plus-rows paste schema with a date line so stale levels auto-hide |
| Pine querying option contracts | Options Chain Table [Enhanced] ([ruBu5dfJ](https://www.tradingview.com/script/ruBu5dfJ-Options-Chain-Table-Enhanced/)) | open-source on TV | Proves Pine can request OPRA contract symbols for price and volume within the 40-call limit |

**What does not exist anywhere (we build it)**

- Nothing maps QQQ or SPY gamma levels onto TQQQ or UPRO. Closest pattern is EzOptions' ETF-to-SPX moneyness mapping and the ES/NQ projection rule in Gex-Multi: convert price levels by ratio, never rescale gamma dollars.
- No open-source tool ranks a live chain by expected value and Kelly fraction together. We compose optionlab plus a chain feed plus keeks.
- No event-driven premium-selling backtest (FOMC, CPI, earnings) with public code. Only published evidence exists; see section 4.
- No maintained free economic-calendar package. investpy is broken; the practical route is scraping the Federal Reserve FOMC calendar and the BLS release schedule directly.
- No Pine script reads options open interest. Every gamma-level script on TradingView takes levels by paste or by republishing the script.

---

## 2. Architecture the findings force

Pine Script has no network access, Pine Seeds is closed to new repositories (verified in the
[official README](https://github.com/tradingview-pine-seeds/docs)), and TradingView webhooks are
outbound only. So the system is two layers:

1. **Engine (Python, runs on your machine or a scheduled job).** Pulls chains, computes GEX, flip, walls, max pain, vanna and charm on SPX, NDX, SPY and QQQ, maps levels to TQQQ and UPRO by moneyness, pulls catalysts and sentiment, scores contracts, and emits (a) a level block for Pine, (b) a daily trade sheet, (c) push alerts.
2. **Pine indicator.** Plots price-derived levels natively (round numbers, pivots, VWAP bands, opening range, prior day high and low, VIX regime), takes the engine's level block through one `input.text_area` with a date line, fires alerts on level interactions, and optionally queries a handful of OPRA contract symbols for live price.

Injection patterns seen in the wild, best to worst:
- Header plus rows paste with date gating (Gamma Exposure Profile, BKLevels). Chosen.
- Hardcoded weekly defaults plus paste override (TLADe NQ script). Good fallback so the script works out of the box.
- Vendor regenerates the whole script daily (OMG, SpotGamma's TradingView upload). Works but clumsy.

---

## 3. Options data: what was verified today

| Source | Cost | Delay | OI | IV | Greeks | Status |
|---|---|---|---|---|---|---|
| **Robinhood MCP connector (this session)** | free with account | real-time | yes | yes | delta, gamma, theta, vega, rho, chance of profit | **Tested live on QQQ. Works.** Daily expirations through Oct 23. Quotes stamped within the minute. |
| CBOE delayed JSON `cdn.cboe.com/api/global/delayed_quotes/options/{SYM}.json` (`_SPX`, `_NDX`) | free, no auth | ~15 min, OI end of day | yes | yes | yes plus theo | **Blocked from this sandbox by network policy.** Used by most GEX repos; should work from your machine. No terms-of-service guarantee. |
| Alpaca Basic | free, paper account | indicative feed | via contracts endpoint | yes | yes | 200 req/min. Good free fallback with greeks. |
| Tradier sandbox | free | 15 min | yes | yes (ORATS) | yes | 120 req/min. [blake365/options-chain](https://github.com/blake365/options-chain) wraps it as an MCP. |
| yfinance | free | ~15 min | yes, glitchy | yes | no | Prototypes only. Known zero-OI bugs. |
| Polygon | $29/mo Starter for options | 15 min | snapshot | snapshot | snapshot | No historical greeks or OI on any plan. |
| Schwab Trader API | free with account | real-time | yes | yes | yes | [Schwabdev](https://github.com/tylerebowers/Schwabdev) 875 stars MIT. Approval takes days. |
| Interactive Brokers | account plus OPRA $1.50/mo | real-time | yes | yes | yes | [ib_async](https://github.com/ib-api-reloaded/ib_async). Heaviest setup, best quality. |

Sentiment and catalyst sources:

| Source | Cost | Access route | Notes |
|---|---|---|---|
| Unusual Whales API | $50/wk trial, $150/mo Basic, $375/mo Advanced | [phields/unusualwhales-mcp](https://github.com/phields/unusualwhales-mcp) covers 81 endpoints | Pricing per [UW announcement](https://unusualwhales.substack.com/p/unusual-whales-api-prices-increasing) |
| SpotGamma | ~$89 to $299/mo | No public API per their support page; CSV export for subscribers | Free without login: daily SPX GEX chart (prior day), implied earnings moves, vol ranking |
| X / Twitter | API Basic $200/mo; free tier is write-only | fintwit-web scrapes via session cookies | Cookie scraping is a terms-of-service risk |
| Reddit | free, 100 queries/min | PRAW or wsb-analyst-mcp | Pushshift backfill is gone |
| TradingView ideas | free | mnwato/tradingview-scraper | Needs a TradingView cookie to avoid captcha |
| Substack | free for public posts | substack_api or RSS at `<pub>.substack.com/feed` | |
| CBOE put/call ratio | free | daily stats HTML page | Historical CSV ends 2019 |
| VIX term structure | free | vix_utils | |
| FOMC, CPI, NFP dates | free | scrape federalreserve.gov and bls.gov schedules | No working package |

---

## 4. Strategy ideas with public evidence

**Leveraged ETF timing**
- Gayed and Bilello, "Leverage for the Long Run" (2016 Dow Award, [PDF](https://docs.cmtassociation.org/dow-award/2016-gayed-bilello.pdf), unverified): leverage only when S&P is above its moving average, T-bills otherwise, 1928 to 2015. Unconditional 3x shows roughly -99.9% max drawdown; moving-average gating is what makes leverage survivable.
- TradingView "TQQQ 200 SMA +5% entry / -3% exit" ([VfrwgjA6](https://www.tradingview.com/script/VfrwgjA6-TQQQ-200-SMA-5-Entry-3-Exit-since-2010-Metrics-by-DE)): signals on QQQ, executed on TQQQ, with hysteresis to cut whipsaws.
- "Vol-Target Trend Engine" ([2wyXTTMc](https://www.tradingview.com/script/2wyXTTMc-Vol-Target-Trend-Engine/)): 3x only above the 200-day, exposure = min(1, 45% target / 20-day realized vol). Claims +3,862% from 2010 to 2026 with 41.9% max drawdown. Unverified.
- TASC March 2026 "High-Probability Weekly Trading Strategy for TQQQ" (Kurczek, [nVECqIQx](https://www.tradingview.com/script/nVECqIQx/)): wait for a 1% dip below the week's open, target +1%, breakeven stop after 0.5% drawdown, flat by Friday. Peer-reviewed rules, current.
- 9-Sig on TQQQ (QuantConnect community backtest, unverified): 60/40 TQQQ/bonds, quarterly rebalance to a 9% per quarter signal line. Claims 40.6% CAGR with 77.8% max drawdown.
- [Filip303/Simple-Strategy](https://github.com/Filip303/Simple-Strategy): VIX term-structure regime plus 10% vol target. Honest result: underperforms buy-and-hold on return, halves drawdown. Clean code to port.

**Index options**
- thunderscarf SPX 0DTE: sells credit spreads at 9:45 ET, expected move = (VIX1D / sqrt 252) x 0.5 x SPX, put spread in bullish regime, call spread in bearish. Author reports 78% win rate, 15.7% annualized, Sharpe 0.97, max drawdown -16% over 537 days.
- Cboe, "Henry Schwartz's Zero-Day SPX Iron Condor Strategy" ([link](https://www.cboe.com/insights/posts/henry-schwartzs-zero-day-spx-iron-condor-strategy-a-deep-dive), unverified).
- Nasdaq, "FOMC Volatility Premium: Evidence from 1-Day Nasdaq-100 Straddles" ([link](https://www.nasdaq.com/articles/fomc-volatility-premium-evidence-1-day-nasdaq-100-straddles), unverified): implied vol has tended to overstate realized on FOMC days. Supports selling premium into FOMC.
- IVolatility stress test of 9,622 earnings straddles ([link](https://www.ivolatility.com/news/3147), unverified): 62% of long straddles lost; only an IV-rank-below-20 filter was net profitable. Supports buying convexity only when IV is cheap, not whenever a catalyst is near.

---

## 5. Full inventory

### 5a. Gamma exposure and options-level repos

| Repo | Lang | Stars | Last commit | License | Data | Computes | Verdict |
|---|---|---|---|---|---|---|---|
| [Darthreign/gex-dashboard](https://github.com/Darthreign/gex-dashboard) | Py | 18 | 2026-10-06 | MIT | CBOE, optional dxFeed | GEX, DEX, flip, walls, vanna, charm, P/C, skew, MCP + Discord | **Primary reference** |
| [FlashAlpha-lab/gex-explained](https://github.com/FlashAlpha-lab/gex-explained) | Py | 12 | 2026-08 | MIT | FlashAlpha API, sample CSV | GEX, flip, walls, DEX, VEX, CHEX, tests | **Formula layer** |
| [gammagrid/gammagrid](https://github.com/gammagrid/gammagrid) | Py Streamlit | 79 | 2026-09 | AGPL-3 | yfinance | GEX, flip, walls, max pain, IV surface, vanna, charm | Most complete; AGPL means reimplement, do not copy |
| [jensolson/SPX-Gamma-Exposure](https://github.com/jensolson/SPX-Gamma-Exposure) | Py | 166 | 2025-07 | unverified | CBOE .dat | Zero-gamma via spot-shift profile | Port the profile loop |
| [Matteo-Ferrara/gex-tracker](https://github.com/Matteo-Ferrara/gex-tracker) | Py | 219 | 2023-04 | unverified | CBOE JSON | GEX by strike and expiry | Minimal reference, abandoned |
| [itsfabtrading/Gex-Multi](https://github.com/itsfabtrading/Gex-Multi) | Py | 7 | 2026-08 | Apache-2 | CBOE | flip, walls, magnet, 0DTE sublevels, expected-move band | Index-to-futures projection rule |
| [EazyDuz1t/EzOptions](https://github.com/EazyDuz1t/EzOptions) | Py Streamlit | 79 | 2026-04 | unverified | yfinance | GEX, DEX, VEX, charm, speed, vomma, color; ETF-to-SPX moneyness map | Closed-form vanna and charm; mapping pattern |
| [EazyDuz1t/EzOptions-Schwab](https://github.com/EazyDuz1t/EzOptions-Schwab) | Py Flask | 41 | 2026-09 | GPL-3 | Schwab | same plus heatmap | Schwab only |
| [puneet-chandna/0DTE-dealer-gamma](https://github.com/puneet-chandna/0DTE-dealer-gamma) | Py + TS | 11 | 2026-05 | PolyForm NC | yfinance / Tradier | SPX 0DTE GEX, flip, regime, backtest | Non-commercial license; Tradier adapter reference |
| [zrack/gex-terminal](https://github.com/zrack/gex-terminal) | Py | 21 | 2026-09 | MIT | Databento, IBKR, yfinance | GEX via Black-76 and BS, replay | Provider-abstraction pattern |
| [mnsrulz/mytradingview](https://github.com/mnsrulz/mytradingview) | TS | 103 | 2026-10-06 | MIT | Tradier + CBOE | GEX, DEX, P/C, history | Tradier integration pattern |
| [Kza56/OFK_Atas_GEX](https://github.com/Kza56/OFK_Atas_GEX) | C# + Py | 39 | 2026-05 | PolyForm NC | CME + CBOE | levels to JSON drawn on futures charts | Pipeline pattern only |
| [BitraAI/gex_app](https://github.com/BitraAI/gex_app) | Py | 6 | 2026-09 | proprietary | Schwab | walls above/below spot, flip with 1% threshold, max pain | Reference only |
| [FlashAlpha-lab/0dte-options-analytics](https://github.com/FlashAlpha-lab/0dte-options-analytics) | Py | 12 | 2026-08 | MIT | FlashAlpha | pin strike, regime, straddle expected move | Vendor dependent |
| [asad70/Options-Max-Pain-Calculator](https://github.com/asad70/Options-Max-Pain-Calculator) | Py | 23 | 2023-03 | unverified | Yahoo | max pain | Reimplement; it is 15 lines |
| [erma0x/gexxer](https://github.com/erma0x/gexxer) | ipynb | 31 | 2025-05 | Apache-2 | Yahoo | unscaled GEX | Avoid |

Formula conventions to standardize on:
- GEX per contract, per 1% move: `sign x gamma x OI x 100 x S^2 x 0.01`, calls positive, puts negative (SqueezeMetrics 2017, SpotGamma naive model). Do not mix with the per-$1 variant when comparing SPX against SPY.
- Gamma flip: compute both the cheap cumulative-sum crossing nearest spot and the rigorous spot-shift profile; report disagreement.
- Walls: strike with the largest positive net GEX (call) and most negative (put), restricted to above and below spot respectively.
- Vanna exposure: `vanna x OI x 100 x S x 0.01`. Charm exposure: `charm x OI x 100 x S / 365`.
- Max pain: strike minimizing the sum of in-the-money intrinsic value times OI across calls and puts.
- Cross-instrument mapping: `level_TQQQ = level_QQQ / QQQ_px x TQQQ_px`. Levels only; gamma dollars stay on the parent.

Methodology sources: [SqueezeMetrics white paper](https://squeezemetrics.com/monitor/download/pdf/white_paper.pdf), [Perfiliev zero-gamma guide](https://perfiliev.co.uk/market-commentary/how-to-calculate-gamma-exposure-and-zero-gamma-level/), [SpotGamma on GEX](https://spotgamma.com/what-is-gex-gamma-exposure/), [SpotGamma on walls](https://spotgamma.com/call-wall-put-wall-explained/), [SpotGamma on the volatility trigger](https://spotgamma.com/volatility-trigger-zero-gamma-trading/). All unverified from the sandbox.

### 5b. Strategy and backtest repos

| Repo | Platform | Stars | Updated | License | What | Verdict |
|---|---|---|---|---|---|---|
| [thunderscarf/SPX_0DTE_Options_Selling_Public](https://github.com/thunderscarf/SPX_0DTE_Options_Selling_Public) | Py, Polygon | 2 | 2025-09 | MIT | 0DTE credit spreads with full trade log | **Best open 0DTE starting point** |
| [lambdaclass/options_backtester](https://github.com/lambdaclass/options_backtester) | Py + Rust | 277 | - | MIT | portfolio backtester, presets, sweeps | **Backtest engine** |
| [brayvid/trading-algorithm](https://github.com/brayvid/trading-algorithm) | QuantConnect | 2 | 2026-07 | unverified | SPY MA cross + TQQQ hold with drawdown exits | Readable LEAN template |
| [Filip303/Simple-Strategy](https://github.com/Filip303/Simple-Strategy) | Py | 0 | 2026-07 | unverified | VIX regime + vol target | Port the regime and vol-target code |
| [nateGeorge/simulate_leveraged_ETFs](https://github.com/nateGeorge/simulate_leveraged_ETFs) | Py | - | 2019 | unverified | synthetic TQQQ/UPRO history | Extend backtests |
| [staskh/trading_skills](https://github.com/staskh/trading_skills) | Py + IBKR | 374 | active | MIT | 0DTE credit spreads on SPX/NDX with EMA and VIX regime | Skill path unverified |
| [michaelchu/optopsy](https://github.com/michaelchu/optopsy) | Py | 1.5k | 2026-04 | AGPL-3 | 38 strategies, delta targeting, 80 entry signals | Historical ranking; AGPL |
| [brndnmtthws/thetagang](https://github.com/brndnmtthws/thetagang) | Py + IBKR | 2.7k | 2026-10 | AGPL-3 | live wheel bot, delta and DTE selection | Production selection logic; AGPL |
| [je-suis-tm/quant-trading](https://github.com/je-suis-tm/quant-trading) | Py | 10.9k | - | Apache-2 | event straddle module | Educational |
| QuantConnect library "Leveraged ETFs with Systematic Risk Management" ([link](https://www.quantconnect.com/learning/articles/investment-strategy-library/leveraged-etfs-with-systematic-risk-management)) | QC | - | unverified | - | SSO above 200-day else SHY | LEAN template |

### 5c. Contract selection and math

| Repo | Stars | Updated | License | What | Verdict |
|---|---|---|---|---|---|
| [rgaveiga/optionlab](https://github.com/rgaveiga/optionlab) | 575 | 2026-09 | GPL-3 | multi-leg P/L, greeks, POP, expected profit with custom distributions | **EV and POP engine** |
| [twolven/mcp-optionsflow](https://github.com/twolven/mcp-optionsflow) | - | 2026-08 | MIT | live chain to spread candidates with POP, ROC, liquidity | **Scanner skeleton** |
| [EconomiaUNMSM/OptionStrat-AI](https://github.com/EconomiaUNMSM/OptionStrat-AI) | - | - | unstated | recommender ranking spreads by ROC at POP tiers | Heavier alternative |
| [vollib/py_vollib](https://github.com/vollib/py_vollib) | 437 | 2026-04 | MIT | IV and greeks | **Core math** |
| [wdm0006/keeks](https://github.com/wdm0006/keeks) | 6 | - | MIT | Kelly variants | **Sizing** |
| [tastyware/tastytrade](https://github.com/tastyware/tastytrade) | 259 | 2026-08 | MIT | SDK with streaming greeks | If tastytrade is ever the broker |
| [quantsbin/Quantsbin](https://github.com/quantsbin/Quantsbin) | 655 | 2021 | MIT | pricing incl. American | Stale but solid |
| [hashabcd/opstrat](https://github.com/hashabcd/opstrat) | 169 | 2021 | MIT | payoff plots | Viz only |

### 5d. TradingView Pine scripts (all details from search snippets; tradingview.com is blocked from the sandbox)

Gamma-level plotters, all manual input:

| Script | Access | Input method | Verdict |
|---|---|---|---|
| [Gamma Exposure Profile - Manual Chain Input](https://www.tradingview.com/script/o4YZLni4/) | open | header `#spot=;dte=;mult=;iv=;date=` then `strike;callOI;putOI` rows; computes BS gamma, flip and walls inside Pine | **Closest to our injection schema** |
| [BKLevels](https://www.tradingview.com/script/30d9iBGn-BKLevels) | open | multi-line: date line, then `ticker,price,color,width,description`; date-gated | **Per-level metadata schema** |
| [BijuuFlow Gamma Grid](https://www.tradingview.com/script/Ek9bBjFA-BijuuFlow-Gamma-Grid/) | open | pasted ladder with strength 1 to 100 driving width and zones; cash-to-futures offset | Strength-ranked rendering |
| [GEX Levels NQ/NDX/QQQ](https://www.tradingview.com/script/Ry5ZZ6Y2/) | open | hardcoded weekly defaults plus paste override; QQQ = NDX / 40 | Default-plus-override pattern |
| [Gamma Exposure Levels [BackQuant]](https://www.tradingview.com/script/nyyInUl8-Gamma-Exposure-Levels-BackQuant/) | open | free-text paste, regex extracts dollar values | Free-text parsing |
| [GEX Levels - Dealer Gamma Exposure](https://www.tradingview.com/script/TfBS3GjM-GEX-Levels-Dealer-Gamma-Exposure/) | open | compact string; documents the S^2 x 1% formula | Convention reference |
| [SPY Daily Gamma Levels [Manual Input With Alerts]](https://www.tradingview.com/script/sG2j6uM0-SPY-Daily-Gamma-Levels-Manual-Input-With-Alerts/) | open | four numeric inputs, prior day auto-deleted, cross alerts | Minimal template |
| [Options Levels: Call/Put Walls, Gamma Flip, Dark Gamma, Whales](https://www.tradingview.com/script/IYCPPgCn-Options-Levels-Call-Put-Walls-Gamma-Flip-Dark-Gamma-Whales) | open | single ordered 13-level input; alerts on close beyond walls | Alert pattern |
| [SPX Gamma Pin Detector](https://www.tradingview.com/script/G9FDZPHc-SPX-Gamma-Pin-Detector) | open, v5 | hardcoded; pin zone within 0.1%, VIX below 15 gate | Pin-proximity logic |
| [Options Max Pain Calculator [BackQuant]](https://www.tradingview.com/script/vsPwh0vN-Options-Max-Pain-Calculator-BackQuant/) | open | synthetic OI | Black-Scholes and max-pain math in Pine |
| [OMG Daily GEX Levels](https://www.tradingview.com/script/KtbWqmwQ) | open | vendor republishes script daily | Shows the regenerate approach |

Level-injection utilities: [Delimited Levels](https://www.tradingview.com/script/qkgoX74Z-Delimited-Levels), [QuickInputsLevelParser library](https://www.tradingview.com/script/eJjOk11e-QuickInputsLevelParser/), [Input Text Area to Array](https://www.tradingview.com/script/bDBQh2Ij-Input-Text-Area-to-Array-then-Reshape-Table).

Price-derived levels: [Round Number Levels Pro](https://www.tradingview.com/script/T1NAmWI9-Round-Number-Levels-Pro/), [Rounded Grid Levels](https://www.tradingview.com/script/8vTWKFK7-Rounded-Grid-Levels/), [Automatic Support & Resistance](https://www.tradingview.com/script/JXrNys5J-Automatic-Support-Resistance/) (MPL-2.0), [VWAP Bands [UAlgo]](https://www.tradingview.com/script/sRQMBgOv-VWAP-Bands-UAlgo), [Time Based ORB](https://www.tradingview.com/script/qyXkapNa-Time-Based-ORB/), [Dual SuperTrend with VIX Filter](https://www.tradingview.com/script/GjZOz8Pu-Dual-SuperTrend-w-VIX-Filter-Strategy-presentTrading/).

Leveraged ETF strategies in Pine: [TQQQ 200 SMA +5%/-3%](https://www.tradingview.com/script/VfrwgjA6-TQQQ-200-SMA-5-Entry-3-Exit-since-2010-Metrics-by-DE), [TQQQ for the Long Term (Composer port)](https://www.tradingview.com/script/CiW6StdS-TQQQ-for-the-Long-Term-Composer), [Vol-Target Trend Engine](https://www.tradingview.com/script/2wyXTTMc-Vol-Target-Trend-Engine/), [Leveraged ETF Strategy Tester](https://www.tradingview.com/script/UnTAKUJc-Leveraged-ETF-Strategy-Tester/), [TASC 2026.03 TQQQ weekly](https://www.tradingview.com/script/nVECqIQx/).

Option symbols in Pine: [Options Chain Table [Enhanced]](https://www.tradingview.com/script/ruBu5dfJ-Options-Chain-Table-Enhanced/) builds `OPRA:SPXW251226C5800` style tickers and pulls volume and price with `request.security`. Open interest and IV from Pine remain unverified; no script was found reading them.

Platform facts: 40 unique `request.*` calls per script on non-professional plans, 64 on Expert and Ultimate with Pine v6. Webhooks require a paid plan, respond within 3 seconds, outbound only.

### 5e. Sentiment, scrapers, classifiers

| Repo | Stars | Updated | Dependency | Verdict |
|---|---|---|---|---|
| [mnwato/tradingview-scraper](https://github.com/mnwato/tradingview-scraper) | 428 | 2026-09 | TV cookie | **TradingView ideas** |
| [StephanAkkerman/fintwit-web](https://github.com/StephanAkkerman/fintwit-web) | 0 | 2026-10 | X session cookies | Freshest X aggregator; terms-of-service risk |
| [StephanAkkerman/fintwit-bot](https://github.com/StephanAkkerman/fintwit-bot) | 165 | 2026-09 | X cookies | Superseded; mine for scraper code |
| [NHagar/substack_api](https://github.com/NHagar/substack_api) | 229 | 2026-09 | none for public posts | **Substack** |
| [ferdousbhai/wsb-analyst-mcp](https://github.com/ferdousbhai/wsb-analyst-mcp) | 30 | 2025-09 | Reddit creds | **Reddit MCP** |
| [asad70/reddit-sentiment-analysis](https://github.com/asad70/reddit-sentiment-analysis) | 287 | 2023 | Reddit API | Reference |
| [TimKoornstra/FinTwitBERT](https://github.com/TimKoornstra/FinTwitBERT) | 9 | 2024 | none | **Social-text classifier** |
| [moritzwilksch/pyfin-sentiment](https://github.com/moritzwilksch/pyfin-sentiment) | 1 | 2024 | none | Lightweight CPU alternative |
| [ProsusAI/finBERT](https://github.com/ProsusAI/finBERT) | 2.2k | 2022 | none | Headlines baseline |
| [AI4Finance-Foundation/FinGPT](https://github.com/AI4Finance-Foundation/FinGPT) | 21.4k | 2026-09 | GPU | If hosting a 7B to 13B model |
| [phields/unusualwhales-mcp](https://github.com/phields/unusualwhales-mcp) | 4 | 2025-08 | paid UW key | **If UW is purchased** |
| [dougransom/vix_utils](https://github.com/dougransom/vix_utils) | 64 | 2024-05 | free CBOE CSV | **VIX term structure** |
| [puddup/cboe-options](https://github.com/puddup/cboe-options) | 1 | 2024-06 | free | Endpoint pattern |
| [borisjoffe/FOMC-dates.js](https://github.com/borisjoffe/FOMC-dates.js) | 0 | 2024 | none | Re-scrape pattern |
| [alvarobartt/investpy](https://github.com/alvarobartt/investpy) | 1.9k | 2022 | broken | Do not use |

---

## 6. Licensing rules for the build

- Copy freely from MIT and Apache-2 sources with attribution: gex-explained, Darthreign, Gex-Multi, py_vollib, keeks, thunderscarf, lambdaclass, mnwato, mcp-optionsflow.
- Reimplement rather than copy from AGPL and GPL sources (gammagrid, optopsy, thetagang, optionlab) unless the whole project is released under the same license. optionlab can be used as an installed dependency without copying its code; calling it from our engine is fine under GPL only if we are comfortable with the engine itself being GPL when distributed. Safer: reimplement POP and EV, which is a few hundred lines.
- Avoid PolyForm Noncommercial code entirely (puneet-chandna, Kza56) because a trading engine is commercial use.
- Treat TradingView published scripts under their Mozilla Public License default: patterns are reusable, verbatim code needs attribution.

---

## 7. Still needed from you

The build plan is clear from the research. The questions from the first message still decide the specifics; the ones that change the architecture are:

1. Broker and execution. Robinhood is connected and verified as a data source. Signals only, or orders with confirmation?
2. Holding period: 0DTE, same-week, or multi-week. This picks which backtest to port first.
3. Which paid feeds you already have: TradingView plan tier, SpotGamma, Unusual Whales, X Premium.
4. Where the engine runs: your machine, a scheduled job in this repo, or a cloud box.
5. Definition of optimal: expected value under a directional view, probability of profit, or reward-to-risk at a target.

Everything else can be defaulted and stated when the first version ships.
