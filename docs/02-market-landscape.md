# Market landscape (as of October 7, 2026)

This is what exists today, what it costs, and where the openings are. Sources
are linked at the bottom; vendor claims are reported as claims.

## The short version

- Demand forecasting for restaurants is a crowded category at the enterprise
  end (Crunchtime, Restaurant365, Fourth/HotSchedules, Logile) and a growing
  one at the SMB end (Lineup.ai, 5-Out, ClearCOGS, Tenzo). All of them use
  some mix of POS history, weather, and events.
- The POS vendors are moving up the stack. Toast is positioning an AI
  operations layer, Square shipped forecasting-driven inventory with
  MarketMan, both in 2026. Anyone selling a standalone forecast will be
  competing with a feature the POS gives away.
- Pricing anchors: Lineup.ai from about $79 per location per month; point
  solutions $100 to $300; enterprise suites $500 to $2,000 per location per
  month. Buyers report 2 to 5% labor savings in the first six months.
- 26% of US operators report using AI tools; demand forecasting, scheduling,
  and food-waste tracking are the most common uses.
- Logile publishes a landing page pitched at Raising Cane's, offering to
  layer AI forecasting and 15-minute task standards on top of HotSchedules
  and claiming 8 to 12% labor reduction and 20 to 30% forecast accuracy
  lift. This is marketing aimed at Cane's. There is no public evidence of a
  deployment, and crew-level experience inside Cane's stores does not
  reflect one.

## Who does what

| Vendor | Segment | Forecast inputs | Granularity | Schedules | Ordering | People scoring | Intraday re-forecast |
|---|---|---|---|---|---|---|---|
| Lineup.ai | SMB / small chains | POS, weather, local events | Hourly | Yes, built from forecast | No | No | Not advertised |
| 5-Out | SMB / small chains | POS, weather, events | Hourly / 15 min | Recommends | Partial (prep) | No | Not advertised |
| ClearCOGS | SMB / small chains | POS, weather | Daily / item | No | Prep and order guidance | No | No |
| 7shifts | SMB, 50k+ locations | POS sales projections | Hourly | Yes (core product) | No | Basic (attendance) | No |
| HotSchedules / Fourth | Enterprise | POS, weather | 15 min | Yes (core product) | Via Fourth suite | No | No |
| Logile | Enterprise | POS, weather, events | 15 min, task-level | Feeds HotSchedules etc. | No | Engineered labor standards | Claimed |
| Crunchtime | Enterprise multi-unit | POS | Daily / hourly | Yes | Yes (suggested ordering, prep, waste) | No | No |
| Restaurant365 | Mid-market / enterprise | POS | Daily / hourly | Yes | Yes | No | No |
| Toast (IQ) | POS install base | POS | Daily | Partial | Partial | No | No |
| Square + MarketMan | POS install base | POS live demand | Daily / item | No | Yes | No | No |

Nobody in that table sells the three things together that this idea leads
with:

1. **Live intraday re-forecasting with explicit send-home / call-in
   signals.** Everyone forecasts the week; almost nobody updates the next
   four hours from what the first four did, and none push a decision to the
   shift lead's phone.
2. **Per-station employee scorecards that feed the schedule.** Scheduling
   tools know availability and wage; none know that E013 runs fry 20% faster
   than anyone else and therefore belongs on fry on a game night. "Fewer,
   better-placed people" is a labor-cost story the incumbents do not tell.
3. **Forecast-error-aware ordering.** Crunchtime and MarketMan do suggested
   ordering, but safety stock is a static par. Sizing it from the forecast's
   own demonstrated error for each item is what lets the ordering step be
   automated with confidence.

## Where the switching costs really come from

The user's thesis is that once the system learns a store, it keeps getting
better and the operator will not leave. That is true only if the thing that
keeps improving is something the operator cannot take with them:

- **Store-specific learned elasticities** (how much rain at 6pm on a Friday
  costs *this* store, how a home game at *this* distance moves the drive-thru).
- **Employee station histories** that accumulate shift by shift and have no
  export in competing tools.
- **Trust**: the audit trail of "we said 1,430, it was 1,460" that lets a GM
  turn on automated ordering. That trail restarts at zero with a new vendor.

Pure forecast accuracy is not a moat; the POS vendors will match it.

## Data sources and what they cost

| Signal | Source | Cost | Notes |
|---|---|---|---|
| Weather history and 16-day forecast | Open-Meteo | Free non-commercial, paid commercial tiers | Keyless, hourly, 80 years of archive at ~10 km. Used in the prototype. |
| Weather (US gov) | NWS API | Free | Forecast only; no long archive. Fallback. |
| Holidays | `holidays` Python package | Free | Federal plus state (Mardi Gras in LA). Used in the prototype. |
| School calendars | District PDF/ICS, Hazey Data (13.7k districts, API), Edlink | Free to paid | Day-level status: in session, break, teacher day. Prototype ingests CSV. |
| Local events | PredictHQ (from $500/yr), Ticketmaster Discovery API, university athletic feeds, manager entry | Free to paid | Need attendance and distance; the model consumes an hourly pressure number. |
| POS history | Toast, Square, NCR Aloha, PAR Brink, Olo | Varies, APIs and exports | The hardest integration and the first real milestone. |

## Sources

- [10 Best Restaurant Demand Forecasting Software in 2026 (Xenia)](https://www.xenia.team/articles/best-restaurant-forecasting-software)
- [ClearCOGS vs Restaurant365, Lineup.ai, 5-Out, and Crunchtime](https://www.clearcogs.com/blog/clearcogs-vs-restaurant365-lineup-5out-crunchtime-forecasting-comparison/)
- [Best Restaurant Demand Forecasting Software, 2026 buyer's guide (ClearCOGS)](https://www.clearcogs.com/blog/best-restaurant-demand-forecasting-software/)
- [7 Best Restaurant Forecasting Software (5-Out)](https://www.5out.io/post/7-best-restaurant-forecasting-software)
- [Lineup.ai on Capterra](https://www.capterra.ca/software/1027407/lineupai)
- [Logile landing page addressed to Raising Cane's](https://info.logile.com/raising-canes)
- [Toast signals next phase of restaurant tech competition with AI-driven operations (Dec 2025)](https://restauranttechnologynews.com/2025/12/toast-signals-next-phase-of-restaurant-technology-competition-with-expanded-focus-on-ai-driven-operations/)
- [Toast Q1 2026 results (Business Wire, May 2026)](https://www.businesswire.com/news/home/20260507253488/en/Toast-Announces-First-Quarter-2026-Financial-Results/)
- [Square and MarketMan debut AI-powered restaurant inventory tool (PYMNTS, 2026)](https://www.pymnts.com/restaurant-technology/2026/square-and-marketman-debut-ai-powered-restaurant-inventory-tool/)
- [Smarter staffing and forecasting with Square AI](https://squareup.com/us/en/the-bottom-line/operating-your-business/square-ai-vines-and-rushes-winery)
- [AI in Restaurants: 25 Tools for 2026 (Fourth)](https://www.fourth.com/article/ai-in-restaurants)
- [Agentic AI in Restaurants: Scheduling, Inventory, and Operations in 2026 (QSR.pro)](https://qsr.pro/articles/agentic-ai-restaurant-operations-scheduling-inventory-2026)
- [AI Restaurant Software: 2026 Buyer's Guide (Praedixa)](https://praedixa.com/en/ressources/top-ai-restaurant-software-2026/)
- [Open-Meteo](https://open-meteo.com/)
- [Hazey Data school calendars](https://www.hazeydata.ai/ssd/)
- [PredictHQ pricing](https://www.predicthq.com/pricing)
