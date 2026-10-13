# Slopecycle GEO Dashboard Specification

Prepared: 13 October 2026
Owner: Slopecycle
Status: Draft for build

Reference example (included exactly as provided): https://www.beaconsignals.ai/

## 1. Purpose and scope

Slopecycle needs one screen that answers four questions:

1. Where does Slopecycle appear online, and where do AI engines place it when a consumer asks about kids ski gear?
2. How do consumers and AI engines describe Slopecycle compared with the competitor set?
3. Is AI sentiment toward Slopecycle favorable or unfavorable, and what is driving it?
4. Where, geographically and by platform, does that data come from?

GEO in this document means Generative Engine Optimization: how often and how favorably Slopecycle is surfaced in AI generated answers (ChatGPT, Gemini, Perplexity, Claude, Google AI Overviews and similar engines). Because consumer perception is tied to location, the dashboard also maps the geographic origin of every data point. Both senses of "geo" are covered in a single view.

The dashboard benchmarks Slopecycle against exactly these competitor categories, as supplied:

| Category | Named entries supplied | Tracking unit |
|---|---|---|
| Ski clothing brands | Supplied as a list in the competitor inputs | Each brand in the list |
| Rental companies | KitLender, SportsBasement | Each company |
| Second-hand sites and stores | Supplied as a list in the competitor inputs | Each site or store |
| Hand-me-down groups | Supplied as a list in the competitor inputs | Each group |
| Similar companies and forums | Supplied as a list in the competitor inputs | Each company or forum |

No companies or categories beyond these are added. Where a chart below says "competitor set" it means the union of these five categories.

## 2. Data inputs and current state

### 2.1 Inputs available

| Input | What it contains | Used by |
|---|---|---|
| Slopecycle site-presence data | Pages, directories, marketplaces, social profiles and AI answers where Slopecycle is named | Section 4.1 |
| Competitor lists | The five categories above | Sections 4.2, 4.3 |
| Consumer sentiment data | Reviews, posts, comments and forum threads mentioning Slopecycle or a competitor | Sections 4.2, 4.3 |
| AI sentiment analysis results | Per mention: engine, prompt, polarity (favorable, neutral, unfavorable), confidence, extracted claims | Section 4.3 |
| Source metadata | Geographic origin (country, region, city where available) and platform type | Section 4.4 |

### 2.2 What already exists in the Slopecycle app

The Slopecycle app (Base44) exposes three entities today. They are the first live feeds for the dashboard.

| Entity | Fields | Snapshot observed on 13 October 2026 |
|---|---|---|
| PageVisit | path, referrer, utm_source, utm_medium, utm_campaign, session_id, created_date | 500 visits read between 11 and 13 October; all on path "/"; referrer is app.base44.com for 367, empty for 130, facebook.com for 2, l.instagram.com for 1; utm_source set on 5 ("pitch" on 4, "ig" on 1) |
| WaitlistSignup | email, kid_age_bracket, source, created_date | 13 signups since 13 September; age brackets 2 to 4, 5 to 8, 9 to 12, 13+; source values "pitch", "claude_check", "test-run" and empty |
| Setting | key, value | waitlist_sheet_id and waitlist_sheet_name (Google Sheet export of the waitlist) |

Two observations shape the design:

- Almost all visits carry no UTM tags and show the app host as referrer, so true acquisition source is unknown for most traffic. Source tagging is a prerequisite for the source-origin panels in Section 4.4.
- Test records ("test-run", "claude_check") sit alongside real signups. The ingestion layer needs a filter for test data.

## 3. Dashboard layout

Single page, scroll vertical, twelve-column grid, 16px gutter on phone width. Filters sit in one row at the top and apply to every panel. The AI chat panel is docked on the right on desktop and becomes a bottom sheet on mobile.

```
+--------------------------------------------------------------+----------+
| Filters: Date range | Engine | Region | Platform | Competitor |          |
+--------------------------------------------------------------+          |
| KPI row (6 stat tiles)                                       |          |
+--------------------------------------------------------------+   AI     |
| 4.1 Site presence                                            |  chat    |
+------------------------------+-------------------------------+  panel   |
| 4.2 Slopecycle vs competitors| 4.3 AI sentiment              |          |
+------------------------------+-------------------------------+          |
| 4.4 Geographic and source origin                             |          |
+--------------------------------------------------------------+          |
| 4.5 Actionable insights (AI generated, ranked)               |          |
+--------------------------------------------------------------+----------+
```

Global filter row:

| Filter | Type | Default |
|---|---|---|
| Date range | Preset chips (7d, 30d, 90d, season to date) plus custom | 30d |
| AI engine | Multi-select | All |
| Region | Country, then state or province | All |
| Platform type | Multi-select: AI engine, search, marketplace, social, forum, review site, directory, news | All |
| Competitor | Multi-select grouped by the five categories | All |

Every chart ships with a hover tooltip, a table view toggle, and a "Ask AI about this" button that pre-fills the chat panel (Section 5).

## 4. Components

### 4.0 KPI row

Six stat tiles, each with value, delta versus prior period, and a 30 day sparkline.

| Tile | Definition |
|---|---|
| AI visibility score | Share of tracked prompts where any engine names Slopecycle, 0 to 100 |
| Share of voice | Slopecycle mentions divided by all mentions across Slopecycle plus the competitor set |
| Citation rate | Share of AI answers that link to a Slopecycle owned page, not just name it |
| Net AI sentiment | Favorable minus unfavorable AI mentions, as a percentage of all AI mentions |
| Sites with presence | Count of distinct domains where Slopecycle currently appears |
| Regions reached | Count of countries or states with at least one mention |

Chart type: stat tile (value plus delta plus sparkline). No bar chart for a single number.

### 4.1 Site presence: where Slopecycle appears

Shows every place Slopecycle is named, with status and freshness.

| Widget | Chart type | Encoding |
|---|---|---|
| Presence by platform type | Horizontal bar, sequential single hue | Count of sites per platform type, sorted high to low |
| Presence coverage grid | Heatmap, sequential | Rows: platform type. Columns: AI engine or site. Cell: mention count in period |
| Presence inventory | Table | Domain, platform type, first seen, last seen, listing accuracy (correct, outdated, missing), link to source |
| Prompt coverage | Horizontal bar, emphasis form | For each tracked prompt (for example "best way to get ski clothes for a growing kid"), share of engines that name Slopecycle. Slopecycle in accent hue, competitor set in gray |

Listing accuracy flags power the "fix outdated listings" insight in Section 6.

### 4.2 Consumer and competitor comparison

Benchmarks how consumers see Slopecycle against each competitor category.

| Widget | Chart type | Encoding |
|---|---|---|
| Share of voice by category | Stacked horizontal bar, categorical, fixed hue order | One bar per competitor category plus Slopecycle; segments by platform type |
| Mention trend | Multi-line, at most 6 lines, legend plus direct labels | Weekly mentions: Slopecycle, ski clothing brands, rental companies, second-hand sites and stores, hand-me-down groups, similar companies and forums |
| Head to head: Slopecycle vs KitLender vs SportsBasement | Grouped bar, 3 series | Share of voice, citation rate, net sentiment, average mention age |
| Attribute comparison | Heatmap, diverging centered on category average | Rows: attributes consumers raise (price, fit, condition, convenience, sustainability, sizing as kids grow, availability). Columns: Slopecycle and each category. Cell: net sentiment on that attribute |
| Top consumer phrases | Table with inline bars | Phrase, count, net sentiment, example source |

Rules: one y axis per chart. More than 7 competitors in a category fold into "Other" within that category. Color follows the entity, never its rank, so filtering competitors does not repaint survivors.

### 4.3 AI sentiment toward Slopecycle

| Widget | Chart type | Encoding |
|---|---|---|
| Sentiment split | Diverging stacked bar, centered on neutral | Favorable, neutral, unfavorable share of AI mentions, one bar per engine |
| Sentiment trend | Line, single series with baseline at zero | Net AI sentiment per week |
| Sentiment by engine vs competitor set | Dumbbell | For each engine, Slopecycle net sentiment versus competitor-set average |
| Claim ledger | Table | Each claim AI engines make about Slopecycle, polarity, engine, frequency, whether the claim is accurate, source cited by the engine |
| Driver breakdown | Horizontal bar, diverging | Attributes that drive favorable (right) or unfavorable (left) mentions |

The claim ledger is the most actionable element: inaccurate unfavorable claims become correction tasks; accurate unfavorable claims become product or messaging tasks.

### 4.4 Geographic and source origin

| Widget | Chart type | Encoding |
|---|---|---|
| Mention map | Choropleth, sequential single hue, country then state drill down | Mention count per region; toggle to net sentiment (diverging) |
| Region ranking | Horizontal bar, sequential | Top 10 regions by mentions; secondary toggle for net sentiment |
| Source origin | Stacked horizontal bar, categorical | Platform type per region |
| Referrer and UTM feed (live from PageVisit) | Horizontal bar, sequential | Visits by referrer host and by utm_source; untagged traffic shown as its own bar so the gap is visible |
| Waitlist origin (live from WaitlistSignup) | Stacked horizontal bar | Signups by source, segmented by kid_age_bracket |

The choropleth caps at three categorical overlays; everything else uses one hue.

### 4.5 Actionable insights panel

Ranked list, refreshed daily. Each card shows: insight title, evidence (chart link and numbers), suggested action, expected effect on a KPI, owner, status (new, in progress, done). Cards are generated by the AI layer from the same data the charts use and are editable. Sample content is in Section 6.

## 5. AI chat interface

### 5.1 Placement

- Desktop: right rail, 360px wide, always visible, collapsible to a tab.
- Mobile: floating button bottom right that opens a bottom sheet at 80% height.
- Every chart has an "Ask AI about this" button that opens the chat with the chart context attached.

### 5.2 Interaction flow

1. User types a question or taps a suggested prompt ("Why did unfavorable sentiment rise in Colorado this month?", "Which engines never cite us?", "What should we post to reach hand-me-down groups?").
2. The assistant resolves the question to a data scope: current filters plus any chart context attached.
3. The assistant queries the dashboard data layer (never the raw web) and answers with: a one-line answer, the supporting numbers, a small inline chart when useful, and links to the panels used.
4. If the answer suggests an action, the assistant offers to create an insight card in Section 4.5 with one tap.
5. Conversation history is kept per user for 30 days and can be exported.

### 5.3 Guardrails

- Answers must cite the panel and date range they drew from.
- The assistant never invents competitors or regions; it answers only from the five categories and the loaded data.
- When data is missing (for example untagged traffic), the assistant says so and recommends the fix rather than estimating.

### 5.4 Suggested starter prompts

- "Summarize Slopecycle visibility this week versus last."
- "Compare our AI sentiment to KitLender and SportsBasement."
- "Which attributes do second-hand sites win on?"
- "Where are hand-me-down groups most active and are we present there?"
- "List inaccurate claims AI engines make about us."

## 6. Sample actionable insights

Illustrative cards, grounded in the live app data and standard GEO practice. Numbers from the competitor and sentiment feeds are placeholders until those feeds are connected.

- Tag all outbound links. 99 percent of recent visits arrived with no UTM parameters, so source origin cannot be attributed. Add utm_source, utm_medium and utm_campaign to every social post, pitch deck link and directory listing. Expected effect: Source origin panels become populated within one week.
- Separate test data from real data. Waitlist sources "test-run" and "claude_check" and empty-source signups are mixed with real "pitch" signups. Add an is_test flag and exclude it by default. Expected effect: Waitlist origin chart reflects real demand.
- Convert pitch traffic into a trackable channel. "pitch" is the only consistently tagged source and produced 4 of 13 waitlist signups. Give each pitch audience its own utm_campaign so the dashboard can rank audiences.
- Close the citation gap. Where the prompt coverage chart shows an engine naming Slopecycle but never linking to it, publish a plain, crawlable page that states what Slopecycle is, who it serves, and pricing, so engines have a canonical source to cite.
- Target the age brackets that convert. Waitlist signups cluster in the 5 to 8 bracket. Create one landing section and one FAQ per bracket so engines answer bracket-specific prompts with Slopecycle.
- Correct inaccurate AI claims. Any unfavorable claim in the claim ledger marked inaccurate gets a correction page and, where the engine cites a third-party source, an outreach request to that source.
- Win the attributes competitors lose on. Where the attribute heatmap shows second-hand sites and stores scoring low on condition or sizing consistency, publish content that addresses exactly those attributes with Slopecycle's process.
- Be present where hand-me-down groups talk. For regions where hand-me-down groups show high mention volume and Slopecycle has zero presence, join or partner with those groups and seed answers to common questions.
- Match rental messaging in rental comparisons. In prompts where KitLender or SportsBasement are named and Slopecycle is not, add comparison content that explains how Slopecycle differs from a per-trip rental.
- Watch regional sentiment swings. Alert when net AI sentiment in any region drops more than 15 points week over week, and route the driver breakdown to the owner.

## 7. Data integration placeholders

Each block lists the feed, its owner, the refresh cadence and the fields the dashboard expects. Fill in the connection details when each feed is ready.

### 7.1 Slopecycle app (live today)

| Feed | Connection | Refresh | Fields |
|---|---|---|---|
| PageVisit | Slopecycle MCP, query_pagevisit | Every 15 minutes | path, referrer, utm_source, utm_medium, utm_campaign, session_id, created_date |
| WaitlistSignup | Slopecycle MCP, query_waitlistsignup | Every 15 minutes | kid_age_bracket, source, created_date (email excluded from the dashboard) |
| Setting | Slopecycle MCP, query_setting | Daily | waitlist_sheet_id, waitlist_sheet_name |

### 7.2 Site-presence data (placeholder)

| Item | Value |
|---|---|
| Source | TBD: crawl or export of directories, marketplaces, social profiles |
| Refresh | Weekly |
| Fields | domain, url, platform_type, first_seen, last_seen, listing_accuracy, region |
| Status | Not connected |

### 7.3 AI engine answers (placeholder)

| Item | Value |
|---|---|
| Source | TBD: prompt panel run against each tracked engine |
| Refresh | Daily |
| Fields | engine, prompt, answer_text, brands_named, urls_cited, region_of_query, run_date |
| Status | Not connected |

### 7.4 Consumer sentiment data (placeholder)

| Item | Value |
|---|---|
| Source | TBD: reviews, forum threads, social posts, group discussions |
| Refresh | Daily |
| Fields | source_url, platform_type, brand_or_category, text, polarity, attributes, region, posted_date |
| Status | Not connected |

### 7.5 AI sentiment analysis results (placeholder)

| Item | Value |
|---|---|
| Source | TBD: classifier output over 7.3 and 7.4 |
| Refresh | Daily, after 7.3 and 7.4 |
| Fields | mention_id, polarity, confidence, claims[], claim_accuracy, drivers[] |
| Status | Not connected |

### 7.6 Source metadata (placeholder)

| Item | Value |
|---|---|
| Source | TBD: geolocation of source domain, author location where public, query region |
| Refresh | With each feed above |
| Fields | country, region, city, platform_type, confidence |
| Status | Not connected |

### 7.7 Competitor lists (placeholder)

| Item | Value |
|---|---|
| Source | Supplied lists for the five categories; KitLender and SportsBasement are the named rental companies |
| Refresh | On change |
| Fields | name, category, domains[], aliases[] |
| Status | Awaiting the full lists |

## 8. Visual design rules

- One hue for magnitude (sequential), two hues plus neutral gray for polarity (diverging), fixed-order categorical hues for identity, and reserved status colors for alerts only.
- Slopecycle is always the accent hue; competitor categories use the fixed categorical order so a filter never recolors a survivor.
- Thin marks, 2px lines, 2px gap between stacked segments, direct labels on at most four series, a legend for two or more series.
- One axis per chart. Two measures of different scale become two charts.
- Text stays in text colors, never in a series color.
- Every chart has a table view and a hover tooltip. Light and dark mode are both specified and validated against their surfaces.
- Palette validation runs before release; a failing adjacent pair is re-stepped, not eyeballed.
- No em-dashes anywhere in the interface copy.

## 9. Execution checklist

- [x] Site-presence visualization included (Section 4.1)
- [x] Consumer vs. competitor comparison covered (Section 4.2)
- [x] AI sentiment display specified (Section 4.3)
- [x] Source origin mapping added (Section 4.4)
- [x] Actionable insights generated (Sections 4.5 and 6)
- [x] AI chat feature described (Section 5)
- [x] Simple charts/graphs outlined (Sections 4.0 to 4.4, 8)
- [x] All constraints respected: reference link unchanged, no added companies or categories, no em-dashes, proper nouns preserved (Slopecycle, KitLender, SportsBasement)

## 10. Conflict resolution

Where any requirement conflicts, priority is: constraints and do-nots first, then output format, then actionable insights, then visual design. One applied case: the dataviz series ladder would allow a seventh line on the mention trend chart, but the "no added categories" constraint keeps it at the five supplied categories plus Slopecycle.

## 11. Prototype

A working single-page prototype lives at `prototype/index.html`. The three Slopecycle app panels are fed by a live snapshot and refresh through the Slopecycle connector when the page runs as a published artifact; every other panel uses labeled sample data until its feed is connected. See `prototype/README.md`.
