# Data sources — Base Case (data pass 2026-11-03)

Every real-world figure in `shared/data/*.ts` is a `Sourced<T>` with `source`, `asOf`, `verified`. This file lists every
source and URL the 2026-11-03 data pass relied on, grouped by file, and ends with the **could-not-verify** list.

**Method.** Direct fetches of bls.gov, irs.gov, ssa.gov, studentaid.gov, taxfoundation.org and onetonline.org were
blocked in this build, so every figure was taken from web-search result snippets (129 searches). `verified: true` was
set only when a figure appeared in an authoritative source (BLS OOH, O\*NET's republication of OEWS, SSA/Federal
Register, IRS newsroom, a state revenue department) **or** in at least two independent reputable secondary sources that
agree. Everything else is `verified: false` with a note. Only URLs that actually appeared in search results are cited.

---

## careers.ts — occupations (BLS OEWS May 2025, national) and metros

### National reference
| Item | Value | Source | URL |
|---|---|---|---|
| All-occupations annual mean wage, May 2025 | $69,770 (hourly $33.54) | BLS OEWS "largest occupations" table; BLS metro news releases | https://www.bls.gov/oes/2025/may/largest2.htm ; https://www.bls.gov/news.release/archives/ocwage_05152026.htm |

### Percentile bands (annual p10 / p25 / p50 / p75 / p90), as of 2025-05
Primary channel: **O\*NET OnLine "National/Local Wages"** pages (U.S. DOL/ETA, republishing BLS 2025 wage data) —
`https://www.onetonline.org/link/localwages/<SOC>.00` (state/zip variants of the same page were what the search returned
for some SOCs; the national "United States" row is identical). Cross-checks: BLS Occupational Outlook Handbook
(May 2025 median, p10, p90), tradecareerpath.com, resumevera.com, hyring.com, wagedex.com.

| Code | SOC | Band | Verified | Sources seen |
|---|---|---|---|---|
| software_developer | 15-1252 | 82,460 / 105,210 / 135,980 / 171,980 / 214,670 | yes | O\*NET (…15-1252.00?st=NE); BLS OOH https://www.bls.gov/ooh/computer-and-information-technology/software-developers.htm ; hyring |
| data_scientist | 15-2051 | 67,240 / 85,660 / 120,230 / 158,880 / 199,130 | yes | O\*NET …/15-2051.00 ; wagedex ; coderhouse |
| computer_systems_analyst | 15-1211 | 67,340 / 82,860 / 105,850 / 134,110 / 167,710 | yes | BLS OOH https://www.bls.gov/ooh/computer-and-information-technology/computer-systems-analysts.htm ; O\*NET …/15-1211.00?st=TX |
| information_security_analyst | 15-1212 | 75,090 / 97,810 / 129,180 / 163,500 / 199,850 | yes | O\*NET …/15-1212.00?st= ; resumevera ; wagedex |
| registered_nurse | 29-1141 | 68,940 / 80,330 / 97,550 / 112,350 / 137,470 | yes | O\*NET …/29-1141.00 ; https://tradecareerpath.com/trades/registered-nurse/salary/ ; wagedex/hyring (median) |
| nurse_practitioner | 29-1171 | 101,340 / 117,990 / 132,300 / 156,700 / 174,420 | yes | O\*NET …/29-1171.00?st=MD ; BLS OOH nurse-anesthetists-nurse-midwives-and-nurse-practitioners.htm ; hyring |
| physical_therapist | 29-1123 | 77,140 / 86,160 / 102,760 / 121,160 / 135,140 | yes | BLS OOH https://www.bls.gov/ooh/healthcare/physical-therapists.htm ; O\*NET …/29-1123.00 |
| pharmacist | 29-1051 | 99,290 / 129,380 / 140,910 / 161,840 / 174,230 | yes | BLS OOH https://www.bls.gov/ooh/healthcare/pharmacists.htm ; O\*NET …/29-1051.00 |
| medical_health_services_manager | 11-9111 | 73,390 / 94,700 / 123,860 / 166,100 / 224,340 | yes | BLS OOH https://www.bls.gov/ooh/management/medical-and-health-services-managers.htm ; O\*NET …/11-9111.00 ; wagedex |
| physician_assistant | 29-1071 | 99,380 / 120,670 / 135,880 / 163,980 / 190,280 | yes | O\*NET …/29-1071.00?st=TX (2025 set) ; wagedex |
| dental_hygienist | 29-1292 | 74,880 / 83,570 / 98,100 / 108,480 / 126,050 | yes | O\*NET …/29-1292.00?st=FL ; hyring ; cs-recruiters |
| accountant | 13-2011 | 56,020 / 67,020 / 83,680 / 109,810 / 144,090 | yes | O\*NET …/13-2011.00?st=MN ; hyring ; wagedex |
| financial_analyst | 13-2051 | 63,720 / 79,290 / 102,740 / 133,340 / 180,860 | yes | O\*NET …/13-2051.00 ; wagedex ; hyring |
| personal_financial_advisor | 13-2052 | 50,190 / 72,440 / 105,070 / 176,790 / 357,020 | yes | BLS OOH https://www.bls.gov/ooh/business-and-financial/personal-financial-advisors.htm ; O\*NET …/13-2052.00 |
| management_analyst | 13-1111 | 60,640 / 77,950 / 101,860 / 133,370 / 171,640 | yes | O\*NET …/13-1111.00 ; resumevera ; wagedex |
| market_research_analyst | 13-1161 | 43,390 / 58,350 / 78,760 / 108,310 / 155,480 | yes | O\*NET …/13-1161.00 ; wagedex |
| hr_specialist | 13-1071 | 47,180 / 58,610 / 75,940 / 99,380 / 128,720 | yes | O\*NET …/13-1071.00?st=TX ; hyring |
| sales_representative | 41-4012 | 39,090 / 50,470 / 72,080 / 99,640 / 137,550 | yes | O\*NET …/41-4012.00 ; wagedex |
| logistician | 13-1081 | 50,890 / 64,440 / 82,320 / 106,190 / 133,160 | yes | https://tradecareerpath.com/trades/logistician/salary/ ; second aggregator with identical table |
| elementary_teacher | 25-2021 | 47,960 / 57,710 / 63,970 / 81,450 / 104,340 | yes | O\*NET …/25-2021.00 ; https://resumevera.com/salary/teacher |
| secondary_teacher | 25-2031 | 48,780 / 59,980 / 72,040 / 92,570 / 107,600 | **no** | O\*NET …/25-2031.00?st=SD only (older O\*NET row shows 47,330/57,800/64,580/83,010/104,670) |
| social_worker | 21-1021 | 42,280 / 48,270 / 59,550 / 76,070 / 95,530 | yes | O\*NET …/21-1021.00 ; wagedex |
| police_officer | 33-3051 | 47,510 / 59,290 / 76,210 / 97,600 / 115,120 | yes | O\*NET …/33-3051.00?st=AZ (newer set) ; wagedex |
| civil_engineer | 17-2051 | 68,240 / 79,930 / 100,840 / 129,680 / 163,220 | yes | O\*NET …/17-2051.00 ; https://tradecareerpath.com/trades/civil-engineer/salary/ |
| mechanical_engineer | 17-2141 | 73,990 / 84,130 / 104,110 / 132,590 / 164,340 | yes | https://tradecareerpath.com/trades/mechanical-engineer/salary/ ; O\*NET 17-2141.01/.02 pages (p10/p90) ; hyring |
| electrical_engineer | 17-2071 | 76,550 / 92,830 / 120,630 / 152,950 / 184,300 | yes | https://tradecareerpath.com/trades/electrical-engineer/salary/ ; https://resumevera.com/salary/electrical-engineer |
| industrial_engineer | 17-2112 | 74,370 / 83,600 / 102,440 / 129,250 / 159,860 | yes | https://tradecareerpath.com/trades/industrial-engineer/salary/ ; https://wagedex.com/jobs/industrial-engineers |
| architect | 17-1011 | 62,300 / 77,960 / 99,280 / 126,550 / 161,420 | yes | O\*NET …/17-1011.00 ; wagedex |
| construction_manager | 11-9021 | 69,690 / 88,550 / 114,990 / 151,640 / 189,440 | yes | O\*NET …/11-9021.00?st=MN ; wagedex |
| lawyer | 23-1011 | 78,360 / 102,990 / 159,670 / 221,370 / 351,600 | yes | O\*NET …/23-1011.00?st=WA ; https://wagedex.com/jobs/lawyers |
| paralegal | 23-2011 | 44,740 / 50,340 / 62,890 / 80,080 / 101,500 | yes | O\*NET …/23-2011.00 ; wagedex |
| graphic_designer | 27-1024 | 39,520 / 49,040 / 62,960 / 81,830 / 104,910 | yes | O\*NET …/27-1024.00?st=TX ; https://wagedex.com/jobs/graphic-designers |
| pr_specialist | 27-3031 | 44,110 / 56,260 / 74,750 / 100,370 / 135,150 | yes | O\*NET …/27-3031.00 ; wagedex ; https://everything-pr.com/what-pr-practitioners-actually-make-the-2026-salary-map |
| electrician | 47-2111 | 42,640 / 49,430 / 63,190 / 83,940 / 108,510 | yes | O\*NET …/47-2111.00?st= ; https://wagedex.com/jobs/electricians ; https://cs-recruiters.com/salary-guide/electrician/ |
| plumber | 47-2152 | 44,150 / 50,190 / 63,800 / 85,110 / 108,420 | yes | O\*NET …/47-2152.00?st=NY ; wagedex (median) |
| hvac_mechanic | 49-9021 | 40,050 / 48,360 / 61,010 / 77,060 / 95,210 | yes | O\*NET …/49-9021.00?st=NY ; https://hyring.com/jobseeker-toolkit/salary/hvac-technician-salary-in-usa ; tradecareerpath |
| airline_pilot | 53-2011 | 106,710 / 182,280 / 232,140 / 384,440 / 463,830 | yes | O\*NET …/53-2011.00 ; https://wagedex.com/jobs/airline-pilots-copilots-and-flight-engineers |

### Employment (OEWS national) — mostly NOT verified
Verified (true): dental_hygienist 222,740 (gotu.com + hyring); hr_specialist 939,700, pr_specialist 314,500,
airline_pilot 104,600 (BLS OOH / O\*NET 2025 Employment-Projections base counts, noted as such).
Single-aggregator figures (false): software_developer 1,687,890; data_scientist 262,440; nurse_practitioner 323,040;
accountant 1,449,500; financial_analyst 361,980; market_research_analyst 899,580; elementary_teacher 1,388,390;
civil_engineer 367,840; construction_manager 380,360; physician_assistant 162,150; logistician 241,000 and
mechanical_engineer 293,100 (EP 2024 base); computer_systems_analyst 498,810 and secondary_teacher 1,045,170 (cached
bls.gov pages of uncertain vintage). **Estimates from memory of May 2024 OEWS (false, labelled "ESTIMATE")**:
information_security_analyst, registered_nurse, physical_therapist, pharmacist, medical_health_services_manager,
personal_financial_advisor, management_analyst, sales_representative, social_worker, police_officer,
electrical_engineer, industrial_engineer, architect, lawyer, paralegal, graphic_designer, electrician, plumber,
hvac_mechanic.

### Growth, BLS Employment Projections 2024-34 (as of 2025-08)
| Verified | Occupations | Source |
|---|---|---|
| yes | software_developer +15.8%, data_scientist +33.5%, information_security_analyst +28.5% | https://www.bls.gov/opub/ted/2026/artificial-intelligence-information-technology-and-employment-2024-34.htm |
| yes | registered_nurse +5%, nurse_practitioner +40%, physical_therapist +11%, pharmacist +5% | https://www.bls.gov/ooh/field-of-degree/healthcare-and-related/healthcare-and-related-field-of-degree.htm |
| yes | industrial_engineer +11.0%, mechanical_engineer +9.1%, electrical(+electronics) +6.9%, civil_engineer +5.0% | https://www.bls.gov/opub/ted/2026/force-mass-mechanisms-and-vectors-employment-projections-and-wages-in-engineering.htm |
| yes | hr_specialist +6% | https://www.bls.gov/ooh/business-and-financial/human-resources-specialists.htm |
| yes | accountant +5%, financial_analyst +6%, personal_financial_advisor +10% | BLS OOH 2024-34 edition (business-and-financial pages) |
| yes | lawyer +4% | https://www.bls.gov/ooh/legal/lawyers.htm |
| no (2025-35 proxy) | computer_systems_analyst +8% (https://www.bls.gov/ooh/field-of-degree/computer-and-information/computer-and-information-technology-field-of-degree.htm), management_analyst +10%, plumber +7%, hvac_mechanic +11%, pr_specialist ~+2% | current OOH pages (now 2025-35) |
| no (secondary only) | physician_assistant +20.4%, construction_manager +8.7%, graphic_designer +2.1%, logistician +16.7%, electrician +9.5%, dental_hygienist +7% | wagedex.com job/outlook pages citing BLS EP |
| no (estimate) | medical_health_services_manager, market_research_analyst, sales_representative, elementary/secondary_teacher, architect, paralegal, social_worker, police_officer, airline_pilot | recalled OOH figures; labelled ESTIMATE |

### Metro indexes (BLS OEWS May 2025 regional news releases; metro hourly mean ÷ national $33.54; all verified)
denver $39.28 https://www.bls.gov/regions/mountain-plains/news-release/2026/occupationalemploymentandwages_denver_20260805.htm ·
nyc $41.50 https://www.bls.gov/regions/northeast/news-release/2026/occupationalemploymentandwages_newyork_20260605.htm ·
sf $48.19 https://www.bls.gov/regions/west/news-release/2026/occupationalemploymentandwages_sanfrancisco_20260709.htm ·
sanjose $57.32 https://www.bls.gov/regions/west/news-release/2026/occupationalemploymentandwages_sanjose_20260709.htm ·
seattle $44.13 https://www.bls.gov/regions/west/news-release/2026/occupationalemploymentandwages_seattle_20260630.htm ·
la $37.15 https://www.bls.gov/regions/west/news-release/occupationalemploymentandwages_losangeles.htm ·
chicago $35.28 https://www.bls.gov/regions/midwest/news-release/occupationalemploymentandwages_chicago.htm ·
dallas $33.96 https://www.bls.gov/regions/southwest/news-release/occupationalemploymentandwages_dallasfortworth.htm ·
houston $32.51 https://www.bls.gov/regions/southwest/news-release/occupationalemploymentandwages_houston.htm ·
austin $35.85 https://www.bls.gov/regions/southwest/news-release/OccupationalEmploymentandWages_Austin.htm ·
atlanta $34.57 https://www.bls.gov/regions/southeast/news-release/occupationalemploymentandwages_atlanta.htm ·
boston $43.09 https://www.bls.gov/regions/northeast/news-release/occupationalemploymentandwages_boston.htm ·
dc $44.20 https://www.bls.gov/regions/mid-atlantic/news-release/occupationalemploymentandwages_washingtondc.htm ·
phoenix $33.48 https://www.bls.gov/regions/west/news-release/occupationalemploymentandwages_phoenix.htm ·
minneapolis $35.86 https://www.bls.gov/regions/midwest/news-release/occupationalemploymentandwages_minneapolis.htm ·
slc $34.45 https://www.bls.gov/regions/mountain-plains/news-release/2026/occupationalemploymentandwages_saltlakecity_20260813.htm ·
nashville $31.92 https://www.bls.gov/regions/southeast/news-release/occupationalemploymentandwages_nashville.htm ·
charlotte $33.13 https://www.bls.gov/regions/southeast/news-release/occupationalemploymentandwages_charlotte.htm ·
raleigh $34.01 https://www.bls.gov/regions/southeast/news-release/2026/occupationalemploymentandwages_raleigh_20260708.htm ·
miami $32.30 https://www.bls.gov/regions/southeast/news-release/occupationalemploymentandwages_miami.htm

Occupation-specific metro medians (May 2025, aggregators citing OEWS): San Jose software developers $213,110 (statranker,
tradecareerpath, resumevera — verified) and RNs $216,740 (wagedex + one other — verified); SF software developers
$186,640 (hyring/wagedex/resumevera — verified); Seattle software developers $167,280 (verified), RNs $128,260 (sources
disagree, false); Denver software developers $137,610 (hyring/wagedex — verified), RNs $101,130 (wagedex only, false);
NYC software developers $166,830 and RNs $119,720 (single aggregator / MSA scope unclear — false).

---

## states.ts — 2026 state income tax
- Tax Foundation, *State Individual Income Tax Rates and Brackets, 2026* — https://taxfoundation.org/data/all/state/state-income-tax-rates-2026/ (AZ 2.5%, CO 4.4%, IL 4.95%, PA 3.07%, NC 3.99%, no-tax states)
- Tax Foundation, *2026 State Tax Changes* — https://taxfoundation.org/research/all/state/2026-state-tax-changes/ (IN 2.95%, KY 3.5%, MS 4.0%, OH flat)
- Kiplinger flat-tax roundup — https://www.kiplinger.com/taxes/more-states-are-changing-to-flat-tax-rates ; paybrackets — https://paybrackets.com/state-income-tax-rates
- NC 3.99%: Bloomberg Tax — https://news.bloombergtax.com/payroll/north-carolina-to-decrease-income-tax-rate-for-2026
- MI 4.25%: Michigan Treasurer determination (Mining Journal, Apr 2026) — https://www.miningjournal.net/news/local/2026/04/state-individual-income-tax-rate-for-2026-tax-year-determined/
- GA 4.99% (HB 463, retroactive to 1/1/2026): Vialto Partners — https://vialtopartners.com/regional-alerts/united-states-global-equity-2026-state-tax-rate-table-and-q2-updates ; brackets.tax; CBS News (5.09% pre-HB 463) — https://www.cbsnews.com/news/nine-states-cutting-income-taxes-2026
- UT 4.45% (SB 60, single source) — https://ustax.tools/utah-tax-brackets-2026/ (others show 4.50%)
- OH 2.75% flat over $26,050 (HB 96): EY — https://taxnews.ey.com/news/2025-1744-ohio-legislation-lowers-top-personal-tax-rate-retroactive-to-january-1-2025-implements-flat-tax-in-2026 ; Plante Moran — https://plantemoran.com/explore-our-thinking/insight/2025/07/ohio-budget-bill-makes-significant-tax-changes-for-a-variety-of-taxpayers
- IA 3.8%: AOL/Des Moines Register — https://www.aol.com/iowas-income-tax-rate-dropping-104546981.html ; LA 3.0%: https://ustax.tools/tax-insights/states-that-changed-tax-rates-2026/
- VA brackets/$8,750 deduction: https://ustax.tools/virginia-tax-brackets-2026/ ; SB 7 summary — https://open.pluralpolicy.com/va/bills/2026/SB7
- NJ brackets: https://ustax.tools/new-jersey-tax-brackets-2026/ ; TaxAct — https://blog.taxact.com/what-is-new-jersey-state-income-tax/
- NY 2026 rates (3.9%-10.9%, $8,000/$16,050 deduction): https://ustax.tools/new-york-tax-brackets-2026/ ; NerdWallet — https://www.nerdwallet.com/taxes/learn/new-york-state-tax
- SC Act 110 of 2026: SCDOR IL26-20 — https://dor.sc.gov/sites/dor/files/policies/IL26-20.pdf ; rates via prosalarytax — https://prosalarytax.com/state-tax-guide/south-carolina
- MO: MO DOR — https://dor.mo.gov/personal/whatsnew/ ; 2026 thresholds via calculover — https://calculover.com/state-calculators/missouri/
- MN 2026 standard deduction/first bracket: MN DOR — https://www.revenue.state.mn.us/press-release/2025-12-16/minnesota-income-tax-brackets-standard-deduction-and-dependent-exemption
- CA / OR / WI / MD / CT (effective curves): ustax.tools state pages (california-, oregon-, wisconsin-, maryland-tax-brackets-2026), https://taxbracketcalc.com/income-tax/connecticut-income-tax-calculator/ — thresholds conflicted across sources, so curves are estimates.
- WA capital-gains-only note: general knowledge (not searched).

## irs2026.ts
- IRS newsroom IR-2025-111 / Notice 2025-67 — https://www.irs.gov/newsroom/401k-limit-increases-to-24500-for-2026-ira-limit-increases-to-7500 ; KPMG — https://kpmg.com/us/en/taxnewsflash/news/2025/11/notice-2025-67-increased-retirement-plan-contribution-limits-2026.html ; Ascensus — https://thelink.ascensus.com/articles/2025/11/16/irs-releases-2026-cost-of-living-adjusted-retirement-savings-limitations (401(k) $24,500; catch-up $8,000; 60-63 $11,250; IRA $7,500/$1,100; Roth $153k-$168k / $242k-$252k; trad IRA $81k-$91k / $129k-$149k; $150k Roth catch-up wage test — all confirmed; §415(c) $72,000 and §401(a)(17) $360,000 per the same notice, confirmed in the KPMG summary)
- LTCG 2026 thresholds incl. HoH $66,200/$579,600: https://taxstra.com/strategies/capital-gains-tax/ ; https://ustax.tools/capital-gains-tax-rates-2026/ ; https://reedcorp.tax/helpful-guides/2026-capital-gains-tax-brackets/
- Student-loan interest phase-outs ($85k-$100k; $175k-$205k): https://nationaltaxtools.com/guides/student-loan-interest-deduction/ ; https://www.countrytaxcalc.com/tax-guides/student-loan-interest-deduction-2026/
- Saver's Match (Notice 2026-48): Snell & Wilmer — https://www.swlaw.com/publication/the-government-is-matching-retirement-contributions-heres-how-it-works/ ; Western CPE — https://www.westerncpe.com/?p=487511 ; CPA Practice Advisor — https://www.cpapracticeadvisor.com/?p=188256

## tax2026.ts
- Standard deductions and brackets: IRS bulletin — https://content.govdelivery.com/accounts/USIRS/bulletins/3f65fe1 ; Journal of Accountancy — https://www.journalofaccountancy.com/news/2025/oct/annual-inflation-adjustments-announced-for-tax-year-2026/ ; CPA Practice Advisor — https://www.cpapracticeadvisor.com/2025/10/09/irs-adjusts-tax-brackets-standard-deduction-for-2026/170661/
- HoH bracket table (24% ceiling $201,750): Bradford Tax Institute — https://bradfordtaxinstitute.com/Free_Resources/2026-Federal-Tax-Bracket.aspx ; TaxSlayer Pro — https://www.taxslayerpro.com/blog/post/tax-rates-and-brackets-for-your-clients ; ustax.tools HoH page — https://ustax.tools/2026-tax-brackets-head-of-household/

## loans.ts
- Tiered standard plan: tateesq — https://www.tateesq.com/learn/rap-vs-tiered-standard and https://www.tateesq.com/learn/tiered-standard-repayment-plan ; The College Investor — https://thecollegeinvestor.com/66659/standard-plans-remain-after-2026/ ; Kiplinger — https://www.kiplinger.com/personal-finance/college/2026-changes-to-student-loans-you-need-to-know
- HHS 2026 poverty guidelines: ASPE — https://aspe.hhs.gov/topics/poverty-economic-mobility/poverty-guidelines ; detailed table — https://aspe.hhs.gov/sites/default/files/documents/b1bfa16b20ae9b89d525bc35de7c1643/detailed-guidelines-2026.pdf ; Federal Register 2026-01431 — https://www.govinfo.gov/content/pkg/FR-2026-01-26/html/2026-01431.htm

## ss.ts
- 2026 bend points: SSA OACT — https://www.ssa.gov/oact/cola/piaformula.html ; Federal Register 2025-19763 — https://www.govinfo.gov/content/pkg/FR-2025-11-03/pdf/2025-19763.pdf
- 2027 bend points: SSA OACT — https://www.ssa.gov/oact/cola/bendpoints.html ; Federal Register 2026-21796 (Oct 26, 2026) — https://www.govinfo.gov/content/pkg/FR-2026-10-26/pdf/2026-21796.pdf

## playbook.ts
- HYSA rate context: Fortune — https://fortune.com/article/best-savings-account-rates-11-21-2025 ; Motley Fool Nov 2025 roundups (no November 2026 rate survey was found — flagged)
- Social Security Fairness Act: Colorado PERA — https://copera.org/pera-on-the-issues/president-biden-signs-wep-gpo-repeal-bill-into-law/ ; Washington LEOFF — https://leoff.wa.gov/news/2025/windfall-elimination-provision-wep-and-government-pension-offset-gpo-repealed-social ; Chase — https://www.chase.com/personal/investments/learning-and-insights/article/what-is-the-social-security-fairness-act-and-how-will-it-impact-social-security-benefits
- All other playbook figures are quoted from irs2026.ts / tax2026.ts / loans.ts / ss.ts with the same status, or are statutory citations recalled from memory and flagged `verified: false` (FDIC/SIPC limits, FICO weights, vesting rules, §423 ESPP cap, §1211 $3,000 loss limit, wash-sale §1091, ACA age-26, Roth first-home exception, conventional/FHA minimum down payments, renters-insurance premium range).

---

## Could not verify (left `verified: false`)
1. **secondary_teacher** OEWS band — single source (O\*NET state page labelled 2025); large jump from the prior row. Confirm at bls.gov/oes/current/oes252031.htm.
2. **Employment** for 33 of 37 occupations (single aggregator, EP base count, or ESTIMATE from memory). Confirm on bls.gov/oes.
3. **Growth 2024-34** for 21 of 37 occupations (2025-35 proxies, secondary-only, or ESTIMATE). Confirm in the archived 2024-34 OOH edition.
4. **bonusTypical** for every occupation — modelling assumption by design.
5. **All ladder levels** — derived from percentiles by design (`ladderFromBand`).
6. Metro `occupationIndex` for NYC (both), Seattle RNs, Denver RNs.
7. **States**: MA 5% (only calculator sites surfaced), UT 4.45% vs 4.50% (SB 60 single source), NY 2026 intermediate rates (inferred from the "0.1-point cut"), NJ joint schedule, SC 5.21% top rate, MO 2026 thresholds, and the CA/OR/MN/WI/MD/CT effective curves (computed from best-known tables). Flat-state standard-deduction/exemption amounts are from memory where noted.
8. **irs2026.ts**: nothing left unverified in `LIMITS_2026`; `LIMITS_2027_PUBLISHED.projectedElectiveDeferral` remains a projection by design.
9. **playbook**: items listed above as recalled statutory figures; the November 2026 HYSA APY range.
