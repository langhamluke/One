# Flight Plan — Data Sources

Every pay and benefit value in `airlines.ts` carries `source`, `asOf`, and `verified`.
Values marked `verified: false` (interpolated, estimated, or proxy) show an amber **VERIFY** tag in Advisor Mode.
Seed values were supplied as "verified as of Oct 2026"; items found via search but not read first-hand are flagged.

## Airline pay & retirement

| Item | Value | Source |
|---|---|---|
| American (APA) company 401(k) | 18% of pay from May 2026 (17% from May 2024) | APA contract summary as reported by aviationa2z.com (Aug 2026) — https://www.aviationa2z.com/ |
| American 737 12-yr FO / CA (2026) | $266.58 / $402.01 per hr | aviationa2z.com, "American Airlines Pilot Salary 2026" — https://www.aviationa2z.com/ |
| American widebody 12-yr CA / FO (2026) | $483.74 / $330.44; CA → $498.25 on 1/1/2027 | boltflight.com, "Top 5 Airlines…2026" — https://boltflight.com/ |
| American 1st-year FO | ≈$113/hr (2024 scale — VERIFY 2026) | thrustflight.com — https://thrustflight.com/american-airlines-pilot-salary/ |
| American contract amendable | 1 Aug 2027 (4-yr deal ratified Aug 2023) | FlightGlobal — https://www.flightglobal.com/strategy/american-airlines-pilots-accept-new-deal-that-will-boost-pay-up-to-46/154644.article ; Nasdaq/Zacks coverage |
| American excess-401(k) MBCB | Market Based Cash Balance Plan for excess 401(k) contributions (VERIFY mechanics) | Airways Magazine — https://airwaysmag.com/summary-apa-american-agreement/ |
| Southwest 2026 rates | 1st-yr FO $125.90; 12-yr FO $240.20; 12-yr CA $343.14 per TFP | aerocorner.com — https://aerocorner.com/blog/southwest-airlines-pilot-salary/ ; aviationa2z.com (Aug 2026) |
| Southwest raises | +4% 1/1/2027; +3.25% 1/1/2028; amendable Jan 2029 | AP / AJOT on 2024 ratification — https://www.ajot.com/ ; aviationa2z.com |
| Southwest retirement | 18% non-elective + 2% market-based cash balance plan (2026) | aviationa2z.com (Aug 2026) |
| Southwest pay unit | Trip for Pay (TFP), not hourly | airlinegeeks.com — https://airlinegeeks.com/ |
| FedEx (ALPA) contract | Effective 6/29/2026; ~40% raise in 2026; +3%/yr 2028–2030; amendable Dec 2030; legacy pension + new MBCB | ALPA press release (Jun 2026) — https://www.alpa.org/press-room/2026/06/fedex-pilots-ratify-new-collective-bargaining-agreement ; Supply Chain Dive — https://www.supplychaindive.com/ ; FreightWaves — https://www.freightwaves.com/ |
| FedEx top widebody CA / FO | $469 / $332.49 per hr | boltflight.com — https://boltflight.com/ |
| FedEx MBCB education | Comparison of cash balance plans; floor = company contributions | FDX MEC (Mar 2026) — https://fdx.alpa.org/Portals/7/Documents/communications/public/2026/03/2026-mbcbp-education-comparison-of-cash-balance-plans.pdf |
| FedEx election window, pay credits, FAE caps | Apr–May 30, 2027; ≈9% (≤2028) / ≈10%; FAE cap $340k legacy / $290k switchers (VERIFY) | Secondary advisor commentary — https://leadingedgeplanning.com/fedex-pilots-open-enrollment/ |
| Envoy | New-hire FO > $90/hr; 50% pilot supply premium through 12/31/2026; CA pay rate at 750 Part 121 hrs while FO; guaranteed flow to AA | envoyair.com/pilots — https://www.envoyair.com/pilots/ |
| Envoy captain steps (VERIFY) | $165 / $168.75 / $172.50 / $176.25 / $225 (yrs 2–6) | Envoy Pilot Portfolio 6/10/2026 (via search summary) — https://www.envoyair.com/wp-content/uploads/2026/06/Envoy-Pilot-Portfolio-6.10.2026.pdf |
| United / Delta reference | 18% DC retirement contribution (pay scales are American proxies — VERIFY) | aerocorner.com; boltflight.com |
| FAA mandatory retirement | Age 65 (Part 121); APA opposes raising to 67 | FAA — https://www.faa.gov/ ; Jefferies (Jun 2026) |

## Tax & IRS limits (2026)

| Item | Source |
|---|---|
| 401(k) $24,500; catch-up $8,000; age 60–63 $11,250; §415(c) $72,000; §401(a)(17) $360,000; IRA $7,500; Roth phase-out $153k–$168k / $242k–$252k; Roth catch-up wage threshold $150,000 | IRS Notice 2025-67 — https://www.irs.gov/newsroom/401k-limit-increases-to-24500-for-2026-ira-limit-increases-to-7500 |
| HSA $4,400 / $8,750 | IRS Rev. Proc. 2025-19 — https://www.irs.gov/pub/irs-drop/rp-25-19.pdf |
| Federal brackets & standard deduction ($16,100 / $32,200) | IRS Rev. Proc. 2025-32 — https://www.irs.gov/newsroom/irs-releases-tax-inflation-adjustments-for-tax-year-2026-including-amendments-from-the-one-big-beautiful-bill |
| Social Security wage base $184,500 | SSA 2026 COLA fact sheet — https://www.ssa.gov/news/press/factsheets/colafacts2026.pdf |

## Questionnaire

FNCE 2830 Investor Risk Questionnaire, CU Boulder (cites the Securities Industry Association Risk Tolerance Quiz and the ProQuest Risk Tolerance Questionnaire).

## Capital-market assumptions

`cma.ts` values are illustrative long-term assumptions chosen for this tool, not a forecast or a third-party publication.
