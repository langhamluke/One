# Slopecycle GEO Dashboard prototype

Single-file prototype of the dashboard specified in `docs/slopecycle-geo-dashboard-spec.md`.

## Open it

Open `prototype/index.html` in any browser. No build step and no server needed. The page has no external dependencies apart from Google Fonts; every chart is inline SVG.

## What is live and what is sample

| Panel | Data | Status |
|---|---|---|
| Referrer and UTM feed, Daily visits, Waitlist origin | PageVisit and WaitlistSignup entities from the Slopecycle app | Live. The file ships with a snapshot taken 13 October 2026 (792 visits, 13 signups). When the page is opened as a published Claude artifact with the Slopecycle connector, it refreshes from the app and the status pill turns green. |
| Every other panel and the KPI row | Generated placeholder data from a seeded generator | Sample. Each card carries a Sample tag. Replace the generator with the feeds in section 7 of the spec. |

The sample generator uses only the five supplied competitor categories, with KitLender and SportsBasement as the named rental companies, five AI engines, eight tracked prompts, seven attributes and a US state tile map.

## Controls

- One filter row scopes every panel: date range, AI engine, region, platform type, competitor category, and a toggle that hides test records (sources test, test-run, claude_check).
- Every chart has a Table toggle and an Ask AI button that opens the chat with that panel in focus.
- The mention map toggles between mention counts and net sentiment.
- Insight cards keep their status (new, in progress, done) in the viewer's browser.

## Chat

When opened as a published artifact, the chat asks Claude with the dashboard's current aggregates as context and streams the answer. Opened as a plain file, it falls back to local answers computed from the same aggregates. Both modes cite the panels and scope used.

## Connecting the real feeds

The `SNAP` constant at the top of the script holds the live snapshot. The `refreshLive` function shows the shape expected from the Slopecycle app (PageVisit: referrer, utm_source, created_date; WaitlistSignup: kid_age_bracket, source, created_date). For the sample panels, replace `ANSWERS` and `MENTIONS` with records in the shape `{wk, engine, platform, region, entity, cat, pol, attr, cited, prompt}` and the rest of the page renders unchanged.
