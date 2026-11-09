/**
 * Playbook: life-stage educational content (banking, credit, taxes, insurance, estate basics, tools).
 * Category-level guidance with sources; no brand endorsements or product names. Filled by the data pass 2026-11-03.
 *
 * Every item that states a real-world figure carries a source; figures that could not be re-verified in this build
 * are flagged verified:false (statutory amounts recalled from memory, market rates that move daily, rules of thumb).
 * Figures that live in other data files (irs2026.ts, tax2026.ts, loans.ts, ss.ts) are quoted here with the same
 * source and verification status as those files.
 */
import type { ProductKey } from '../product';
import { AIRLINES, AIRLINES_AS_OF, AIRLINE_SOURCES } from './airlines';
import { LIMITS_2026 } from './irs2026';

export type LifeStage = 'student' | 'first-job' | 'early-career' | 'growing' | 'all';

export interface PlaybookItem {
  text: string;
  source?: string;
  url?: string;
  asOf?: string;
  verified?: boolean;
}

export interface PlaybookTopic {
  key: string;
  title: string;
  stage: LifeStage;
  area: 'banking' | 'credit' | 'tax' | 'insurance' | 'investing' | 'education' | 'housing' | 'estate' | 'tools' | 'retirement' | 'career';
  summary: string;
  items: PlaybookItem[];
  /** Rule the engine uses to surface this topic (documented, implemented in alerts/actions) */
  trigger?: string;
  /** Products the topic is shown in (absent = every product) */
  products?: ProductKey[];
}

const N67 = 'IRS Notice 2025-67 / IR-2025-111 (Nov 13, 2025)';
const N67_URL = 'https://www.irs.gov/newsroom/401k-limit-increases-to-24500-for-2026-ira-limit-increases-to-7500';
const RP32 = 'Rev. Proc. 2025-32 (Oct 2025) via Journal of Accountancy / CPA Practice Advisor';
const RP32_URL = 'https://www.journalofaccountancy.com/news/2025/oct/annual-inflation-adjustments-announced-for-tax-year-2026/';

export const PLAYBOOK: PlaybookTopic[] = [
  {
    key: 'sbloc',
    title: 'SBLOC: borrowing against a brokerage account',
    stage: 'growing',
    area: 'credit',
    summary: 'A securities-based line of credit lets you borrow against a taxable portfolio without selling it, which avoids realizing capital gains. It is a variable-rate demand loan: a market drop can force a collateral call or a sale at the worst time.',
    trigger: 'Debt of kind sbloc -> sbloc-risk alert (caution above 50% of the taxable portfolio)',
    items: [
      { text: 'How it works: a revolving line secured by securities in a non-retirement account; the limit depends on the amount and type of collateral (often around 50% of diversified stocks, more for high-grade bonds). Retirement accounts cannot be pledged.', source: 'FINRA Investor Insights, "Securities-Backed Lines of Credit Explained"', url: 'https://www.finra.org/investors/insights/securities-backed-lines-credit', asOf: '2026-11', verified: true },
      { text: 'Cost: variable, typically SOFR (or prime) plus a spread that shrinks as the line grows; one large brokerage quotes spreads of about 1.90% to 3.10% over its benchmark.', source: 'FINRA; Fidelity line-of-credit materials (Feb 2025)', asOf: '2026-11', verified: true },
      { text: 'Restrictions: proceeds generally cannot be used to buy or carry securities or repay a margin loan (non-purpose loan). Common uses are bridge financing, a down payment, taxes or a business need.', source: 'Schwab and E*TRADE SBLOC disclosures', asOf: '2026-11', verified: true },
      { text: 'Risks: SBLOCs are demand loans the lender can call at any time; if the collateral falls, you must add cash or securities or the lender can sell holdings, possibly creating taxable gains. You can lose more than the pledged account. FINRA suggests taking less than the maximum offered.', source: 'FINRA Investor Insights', url: 'https://www.finra.org/investors/insights/securities-backed-lines-credit', asOf: '2026-11', verified: true },
      { text: 'Taxes: interest is deductible only as investment interest when proceeds fund taxable investments (IRC §163(d)), which SBLOC rules usually prohibit, so treat the interest as a non-deductible cost for most uses.', source: 'IRC §163(d); IRS Pub. 550', asOf: '2026-11', verified: false },
      { text: 'Stage fit: rarely appropriate for new graduates. It becomes relevant once a taxable portfolio is large relative to the borrowing need (a common rule of thumb is borrowing no more than 20-30% of the portfolio) and the borrower has steady income to cover variable interest.', source: 'Planning convention (assumption)', asOf: '2026-11', verified: false },
    ],
  },
  {
    key: 'heloc',
    title: 'HELOC: a home equity line of credit',
    stage: 'growing',
    area: 'housing',
    summary: 'A HELOC is a variable-rate line secured by your home. It is usually cheaper than cards or personal loans, but the home is the collateral and the interest is deductible only for home improvements.',
    trigger: 'Debt of kind heloc -> heloc-risk advisory',
    items: [
      { text: 'How it works: a draw period (commonly 10 years, often interest-only) followed by a repayment period (commonly up to 20 years) in which principal and interest are paid. Lenders usually cap total mortgage debt at about 80-85% of the home value. Base Case models the repayment phase (20-year amortization by default); enter a payment override for an interest-only draw period.', source: 'Industry practice; Freedom Mortgage learning center', asOf: '2026-11', verified: false },
      { text: 'Rate: variable, usually the prime rate plus a margin. Prime is the fed funds upper bound plus 3 points (about 7.00% after the September 2026 rate increase; verify the current WSJ prime rate).', source: 'FOMC statement Oct 28, 2026; WSJ prime convention', asOf: '2026-10', verified: false },
      { text: 'Taxes: interest is deductible only if the money buys, builds or substantially improves the home that secures the loan, only when you itemize, and only within the $750,000 total acquisition-debt cap ($375,000 married filing separately). P.L. 119-21 made these rules permanent.', source: 'IRC §163(h)(3) as amended by P.L. 119-21', asOf: '2026-07', verified: true },
      { text: 'Risks: payments rise when rates rise; lenders can freeze or reduce the line if home values fall; failure to pay puts the home at risk. Using a HELOC to pay off credit cards turns unsecured debt into debt secured by your house.', source: 'CFPB consumer guidance on home equity lines', asOf: '2026-11', verified: false },
      { text: 'Stage fit: available only after buying a home with built-up equity; best used for improvements that add value or as a backstop emergency reserve, not for lifestyle spending.', source: 'Planning convention (assumption)', asOf: '2026-11', verified: false },
    ],
  },
  {
    key: 'first-accounts',
    title: 'First bank accounts and high-yield savings',
    stage: 'first-job',
    area: 'banking',
    summary: 'Keep a no-fee checking account for bills and a separate high-yield savings account (HYSA) for the emergency fund and near-term goals. Pay yourself first with an automatic transfer on payday.',
    items: [
      { text: 'What to look for in checking: no monthly fee or an easy waiver, no minimum balance, a large fee-free ATM network, early direct deposit, and instant transfers to your savings account. Avoid overdraft "protection" that charges per-item fees.' },
      { text: 'What to look for in savings: FDIC or NCUA insurance (up to $250,000 per depositor, per insured bank, per ownership category), a competitive APY that applies to the whole balance, no fees, and no teaser rate that drops after a few months.', source: 'FDIC deposit insurance limit (12 U.S.C. §1821(a)(1)(E))', asOf: '2026-11', verified: false },
      { text: 'Rate context: in late 2025 the top online HYSAs paid roughly 4.0-5.0% APY while the national average savings rate was about 0.41%. Rates move with the federal funds rate (3.75-4.00% after the Oct 28, 2026 FOMC meeting), so expect published APYs around or below that range in November 2026 and check current offers before opening an account.', source: 'Fortune "best savings account rates" (Nov 2025) and Motley Fool rate roundups; FOMC statement Oct 28, 2026 (shared/data/cma.ts)', url: 'https://fortune.com/article/best-savings-account-rates-11-21-2025', asOf: '2025-11', verified: false },
      { text: 'Rule of thumb: keep one month of expenses in checking as a buffer and everything else that you will need within three years in the HYSA. Money needed in 3-10 years can go to a conservative taxable portfolio; longer than that belongs in retirement accounts.' },
    ],
    trigger: 'Always shown in the first-job stage; highlighted when balanceSheet.cash < one month of livingExpenses.',
  },
  {
    key: 'first-credit-card',
    title: 'First credit card and building credit',
    stage: 'first-job',
    area: 'credit',
    summary: 'A credit card is a credit-building tool, not a loan. Use it for a few recurring charges, pay the statement balance in full every month, and never carry a balance to "build credit" - that is a myth.',
    items: [
      { text: 'Features to look for: no annual fee, a reported-to-all-three-bureaus card (so it builds history), a grace period on purchases, and a path to a credit-limit increase after 6-12 months of on-time payments. If you cannot get approved, a secured card (deposit = limit) or becoming an authorized user on a parent\'s long-standing card both work.' },
      { text: 'Scores reward: paying on time every month (the largest factor, about 35% of a FICO score), low utilization (under 30%, ideally under 10% of your limit, about 30%), long average account age (about 15%), a mix of account types (10%) and few new applications (10%).', source: 'FICO score factor weights (myFICO "What\'s in my FICO Scores")', asOf: '2026-11', verified: false },
      { text: 'Cost of carrying a balance: card APRs above 20% are common; a $4,000 balance at 24% costs about $960 a year in interest. The engine treats any balance above 10% APR as high-interest debt to pay first.', source: 'Persona example; APR is illustrative', asOf: '2026-11', verified: false },
      { text: 'You are entitled to free weekly credit reports from each bureau at annualcreditreport.com; check them for errors in your first year of work.', source: 'Fair Credit Reporting Act §612; the bureaus made weekly free reports permanent in 2023', asOf: '2026-11', verified: false },
    ],
    trigger: 'Shown when the client has no credit-card debt and age <= 25; alert when any credit_card debt rate > 0.10.',
  },
  {
    key: 'emergency-fund',
    title: 'Emergency fund: how much and where',
    stage: 'first-job',
    area: 'banking',
    summary: 'Hold 3-6 months of essential expenses in cash before investing beyond the employer match. The engine raises the target to 9-12 months for single-income households, volatile industries, commission-heavy pay or no disability coverage.',
    items: [
      { text: 'Essential expenses = rent, utilities, groceries, insurance premiums, minimum debt payments and transportation; not discretionary spending. The supplement questions (industry stability, variable pay, disability coverage, second income) set the month target.', source: 'Base Case engine rule (shared/lib); see questionnaire.ts SUPPLEMENT' },
      { text: 'Build it in stages: a $1,000-$2,000 starter fund first, then capture the full employer 401(k) match, then finish the fund before adding IRA and taxable investing (order of operations used by the action list).' },
      { text: 'Where: a HYSA or a money-market fund inside a brokerage account. Not in stocks, not in a CD with early-withdrawal penalties, and not in the checking account where it blends into spending.' },
    ],
    trigger: 'Alert when emergency.monthsCovered < emergency.monthsTarget.',
  },
  {
    key: '401k-match-vesting',
    title: '401(k) match and vesting',
    stage: 'first-job',
    area: 'retirement',
    summary: 'The employer match is an immediate 50-100% return; always defer at least enough to capture all of it. Then understand the vesting schedule before you job-hop.',
    items: [
      { text: '2026 limits: employee deferrals $24,500; total employee + employer additions $72,000 (§415(c)); compensation counted for the match capped at $360,000 (§401(a)(17)).', source: N67, url: N67_URL, asOf: '2025-11', verified: true },
      { text: 'Vesting: your own deferrals are always 100% yours. Employer money can vest immediately, on a cliff (100% after up to 3 years) or graded (at least 20% per year from year 2, fully vested by year 6). Leaving before vesting forfeits the unvested match, so check the schedule when timing a job change.', source: 'IRC §411(a)(2)(B) vesting standards for defined-contribution plans', asOf: '2026-11', verified: false },
      { text: 'Auto-enrollment: new 401(k) plans established after 2022 must auto-enroll employees at 3-10% with annual increases to at least 10% (SECURE 2.0 §101). Check your rate rather than assuming the default captures the full match.', source: 'SECURE 2.0 Act §101', asOf: '2026-11', verified: false },
      { text: 'Catch-ups (for later): $8,000 at 50+, $11,250 at ages 60-63; from 2026, catch-ups must be Roth if your prior-year wages from that employer exceeded $150,000.', source: N67, url: N67_URL, asOf: '2025-11', verified: true },
    ],
    trigger: 'Alert when savings.deferralPct < benefits.matchCapPct and matchRate > 0.',
  },
  {
    key: 'roth-vs-pretax',
    title: 'Roth vs pre-tax for a low-bracket graduate',
    stage: 'first-job',
    area: 'retirement',
    summary: 'In the 10-12% federal brackets, Roth contributions usually win: you pay a low rate now and never pay tax on the growth. Switch toward pre-tax as you climb into the 22-24% brackets or move to a high-tax state.',
    items: [
      { text: '2026 single brackets: 10% to $12,400, 12% to $50,400, 22% to $105,700, 24% to $201,775 of taxable income (after the $16,100 standard deduction). A $60,000 salary lands in the 12% bracket; a $130,000 salary is in the 22-24% range.', source: RP32, url: RP32_URL, asOf: '2025-10', verified: true },
      { text: 'Rule of thumb used by the engine: Roth when the marginal federal rate is 12% or lower, split at 22%, pre-tax at 24% and above or when state tax exceeds 6%. The deferralType "split" option lets you hedge.' },
      { text: 'Employer matching contributions are pre-tax regardless of your choice (unless your plan offers Roth matching under SECURE 2.0 §604), so a Roth saver still ends up with some tax-deferred money.', source: 'SECURE 2.0 Act §604', asOf: '2026-11', verified: false },
    ],
    trigger: 'Advisory when deferralType is pretax and marginal federal rate <= 12%.',
  },
  {
    key: 'hsa',
    title: 'HSA: the triple tax advantage',
    stage: 'first-job',
    area: 'tax',
    summary: 'If you are on a high-deductible health plan, the HSA is the only account that is tax-free going in, growing and coming out (for medical costs). Fund it before the IRA if you can pay routine medical bills from cash flow.',
    items: [
      { text: '2026 HSA limits: $4,400 self-only, $8,750 family; HDHP minimum deductible $1,700 / $3,400. 2027 limits already published: $4,500 / $9,000.', source: 'Rev. Proc. 2025-19 and Rev. Proc. 2026-24 (shared/data/irs2026.ts)', asOf: '2026-05', verified: true },
      { text: 'Payroll HSA contributions also avoid the 7.65% FICA tax, which a traditional IRA cannot do. Employer seed money counts toward the limit.' },
      { text: 'Invest the balance above a cash cushion (say $2,000), keep receipts, and let it grow: after age 65 withdrawals for any purpose are taxed like a traditional IRA, with no penalty.', source: 'IRC §223(f)(4)(C)', asOf: '2026-11', verified: false },
    ],
    trigger: 'Action when benefits.hsaEligible and savings.hsaContribution < limit.',
  },
  {
    key: 'ira-basics',
    title: 'IRA basics, including the backdoor Roth',
    stage: 'first-job',
    area: 'retirement',
    summary: 'After the match (and the HSA), a Roth IRA is the most flexible next dollar: contributions can be withdrawn any time without tax or penalty, and the account is yours regardless of employer.',
    items: [
      { text: '2026 IRA limit $7,500 ($1,100 extra at 50+). Roth eligibility phases out between $153,000-$168,000 MAGI (single/HoH) and $242,000-$252,000 (married filing jointly). The traditional-IRA deduction phases out at $81,000-$91,000 (single) and $129,000-$149,000 (joint) when a workplace plan covers you.', source: N67, url: N67_URL, asOf: '2025-11', verified: true },
      { text: 'Deadline: you can contribute for a tax year until the following April filing deadline, so a January graduate can still fund the prior year.', source: 'IRC §219(f)(3)', asOf: '2026-11', verified: false },
      { text: 'Backdoor Roth (for incomes above the phase-out): contribute to a non-deductible traditional IRA, then convert to Roth. It only works cleanly if you hold no other pre-tax IRA balances (the pro-rata rule) - roll old pre-tax IRAs into your 401(k) first.', source: 'IRC §408(d)(2) pro-rata rule; conversions allowed regardless of income since 2010 (IRC §408A(c)(3)(B) as amended)', asOf: '2026-11', verified: false },
      { text: 'Saver\'s Match (from 2027 contributions): the government deposits 50% of up to $2,000 of IRA/401(k) contributions (max $1,000) into your retirement account if your MAGI is below $20,500 (single), $30,750 (HoH) or $41,000 (joint), phasing out by $35,500 / $53,250 / $71,000.', source: 'IRS Notice 2026-48 (Aug 2026) via Snell & Wilmer and Western CPE summaries', url: 'https://www.swlaw.com/publication/the-government-is-matching-retirement-contributions-heres-how-it-works/', asOf: '2026-08', verified: true },
    ],
    trigger: 'Action when savings.iraContribution < limit and emergency fund is funded; advisory when MAGI is inside the Roth phase-out.',
  },
  {
    key: 'student-loan-plans-2026',
    title: 'Student-loan plan choice after July 1, 2026',
    stage: 'first-job',
    area: 'education',
    summary: 'The One Big Beautiful Bill Act (P.L. 119-21) replaced SAVE/PAYE/ICR with the Repayment Assistance Plan (RAP) and a tiered standard plan. Borrowers with loans before July 1, 2026 keep the legacy standard plan and amended IBR; new borrowers choose only RAP or tiered standard.',
    items: [
      { text: 'RAP: payment is 1-10% of your whole AGI (tier by $10,000 of AGI), minus $50 per dependent, minimum $10/month; unpaid interest is waived and principal falls by at least $50/month; forgiveness after 360 qualifying payments.', source: '20 U.S.C. §1087e(e) as added by P.L. 119-21 §82001; StudentAid.gov RAP page (shared/data/loans.ts)', url: 'https://studentaid.gov/manage-loans/repayment/plans/repayment-assistance-plan', asOf: '2026-07', verified: true },
      { text: 'Tiered standard plan: fixed payments over 10 years if you borrowed under $25,000, 15 years for $25,000-$49,999, 20 years for $50,000-$99,999, 25 years for $100,000 or more; minimum payment $50/month; no forgiveness at the end.', source: 'P.L. 119-21 §82001 (HEA §455(d)(7)) via tateesq.com, The College Investor, Kiplinger', url: 'https://www.tateesq.com/learn/rap-vs-tiered-standard', asOf: '2026-07', verified: true },
      { text: 'Rule of thumb: if the standard payment is below about 8% of gross pay, pay it off on the standard plan and invest the difference; if it is above 10-12%, RAP\'s interest waiver and principal match make it the safer choice. Teachers and public-sector workers should check PSLF, which still counts RAP payments.' },
      { text: 'Employer help: up to $5,250 a year of employer educational assistance, including payments on your student loans, is excluded from your income (IRC §127, made permanent and indexed from 2027 by P.L. 119-21).', source: 'IRC §127 as amended by P.L. 119-21 §70412 (shared/data/irs2026.ts)', asOf: '2025-07', verified: true },
      { text: 'SECURE 2.0 §110: your employer can treat qualified student-loan payments as 401(k) deferrals and pay the match on them, so you need not choose between loans and the match. Ask HR whether the plan adopted it.', source: 'SECURE 2.0 Act §110 (shared/data/loans.ts STUDENT_LOAN_MATCH)', asOf: '2024-01', verified: true },
      { text: 'Student-loan interest deduction: up to $2,500 of interest, phasing out at $85,000-$100,000 MAGI (single/HoH) and $175,000-$205,000 (joint) for 2026; you do not need to itemize.', source: RP32, url: RP32_URL, asOf: '2025-10', verified: true },
    ],
    trigger: 'Shown whenever any federal_student debt exists; alert comparing RAP vs standard payment when both are available.',
  },
  {
    key: 'insurance-basics',
    title: 'Renters, disability and term life insurance',
    stage: 'first-job',
    area: 'insurance',
    summary: 'Insure the catastrophes you cannot absorb: your stuff and liability (renters), your income (long-term disability) and, only if someone depends on your income, your life (term).',
    items: [
      { text: 'Renters insurance covers your belongings, temporary housing after a fire and personal liability, and is usually one of the cheapest policies you will own (commonly $15-$30 a month). Landlords\' policies do not cover tenants\' property.', source: 'Typical premium range is an estimate from insurer and consumer-site summaries; not verified in this build', asOf: '2026-11', verified: false },
      { text: 'Long-term disability: a 25-year-old is far more likely to be disabled for 90+ days before retirement than to die. Employer group LTD typically replaces 50-60% of base pay; if the employer pays the premium, benefits are taxable, so a supplemental individual policy (own-occupation, 60-65% replacement) is worth pricing in a specialised field.', source: 'SSA disability statistics (about 1 in 4 of today\'s 20-year-olds become disabled before retirement) - commonly cited SSA figure, not re-verified in this build', asOf: '2026-11', verified: false },
      { text: 'Term life: skip it if no one depends on your income. If a partner, child or co-signed debt does, a 20-30 year level term policy of 10-12x income is cheap in your twenties; avoid whole/universal life as an investment.' },
      { text: 'Health: you can stay on a parent\'s plan until 26 (ACA §2714). Compare the parent plan, the employer plan and an HSA-eligible HDHP; the HSA option often wins for a healthy 22-year-old once the employer seed is counted.', source: 'Affordable Care Act §2714 (dependent coverage to age 26)', asOf: '2026-11', verified: false },
    ],
    trigger: 'Alerts: renters=false while renting; disability=false and no employer LTD; life=false with dependents > 0 or spouseIncome > 0.',
  },
  {
    key: 'first-job-taxes',
    title: 'Tax basics for the first job',
    stage: 'first-job',
    area: 'tax',
    summary: 'Fill out the W-4 correctly, understand the standard deduction and FICA, and expect a half-year quirk: graduating mid-year usually means a refund because withholding assumes a full year of pay.',
    items: [
      { text: '2026 standard deduction: $16,100 single, $32,200 married filing jointly, $24,150 head of household. Income below that owes no federal income tax (FICA still applies).', source: RP32, url: RP32_URL, asOf: '2025-10', verified: true },
      { text: 'FICA: 6.2% Social Security on wages up to $184,500 (2026; $192,300 in 2027) plus 1.45% Medicare on all wages; your employer pays the same again. Pre-tax 401(k) deferrals do not reduce FICA; HSA payroll contributions do.', source: 'SSA 2026 and 2027 COLA fact sheets (shared/data/tax2026.ts)', asOf: '2026-10', verified: true },
      { text: 'W-4: single with one job - fill in Step 1 and sign; add Step 4(c) extra withholding only if you have side income. Two jobs or a working spouse: use the multiple-jobs checkbox so both employers withhold enough.' },
      { text: 'Saver\'s Match replaces the Saver\'s Credit from 2027 contributions onward (claimed on the 2027 return filed in 2028). Low-income first-year graduates may qualify in the partial year.', source: 'IRS Notice 2026-48 (Aug 2026)', asOf: '2026-08', verified: true },
      { text: 'Long-term capital gains are taxed at 0% while taxable income stays under $49,450 (single) / $66,200 (HoH) / $98,900 (joint) in 2026 - a window a graduate with a half-year of income can use to reset cost basis.', source: RP32, url: 'https://taxstra.com/strategies/capital-gains-tax/', asOf: '2025-10', verified: true },
    ],
    trigger: 'Shown in the first-job stage; advisory when graduationYear === CURRENT_YEAR (half-year withholding).',
  },
  {
    key: 'rent-vs-buy',
    title: 'Rent vs buy and the first-home down payment',
    stage: 'early-career',
    area: 'housing',
    summary: 'Buying wins only if you stay 5+ years and total ownership cost (mortgage interest, taxes, insurance, maintenance, transaction costs) beats rent plus the return on the down payment you did not invest. Mobility in your first jobs usually favours renting.',
    items: [
      { text: 'Down payment: conventional loans allow as little as 3% down (with mortgage insurance until 20% equity) and FHA 3.5%; 20% avoids mortgage insurance and lowers the rate. Budget 2-5% of the price for closing costs on top.', source: 'Fannie Mae/Freddie Mac 97% LTV programs and FHA guidelines - standard figures, not re-verified in this build', asOf: '2026-11', verified: false },
      { text: 'Affordability rule the engine uses: housing cost (payment + taxes + insurance + HOA) at or below 28% of gross pay, and all debt payments below 36%. Goal funding assumes the down payment sits in cash/short bonds once the goal is within 3 years.' },
      { text: 'Roth IRA first-home exception: up to $10,000 of earnings (plus any contributions) can be withdrawn penalty-free for a first home after the account is 5 years old - but raiding retirement money for a house is a last resort.', source: 'IRC §72(t)(2)(F) / §408A(d)(5)', asOf: '2026-11', verified: false },
      { text: 'Maintenance: budget 1-2% of the home\'s value per year; the home goal\'s maintenancePct field feeds the rent-vs-buy comparison.' },
    ],
    trigger: 'Shown when a goal of kind "home" exists; alert when the home goal is under-funded for its target year.',
  },
  {
    key: 'grad-school-roi',
    title: 'Grad school: an ROI framework and the new loan caps',
    stage: 'early-career',
    area: 'education',
    summary: 'Treat a degree as an investment: compare lifetime earnings with and without it (the what-if does this), net of tuition, lost wages and interest, and remember that from July 2026 federal graduate borrowing is capped.',
    items: [
      { text: 'New federal limits for programs first disbursing on/after July 1, 2026: graduate $20,500 per year / $100,000 aggregate; professional (law, medicine, etc.) $50,000 per year / $200,000 aggregate; Parent PLUS $20,000 per year / $65,000 per student; Grad PLUS eliminated. Lifetime federal cap $257,500.', source: 'P.L. 119-21 §81001 (shared/data/loans.ts LOAN_LIMITS_2026)', asOf: '2026-07', verified: true },
      { text: '2026-27 Direct Loan rates: 6.52% undergraduate, 8.07% graduate, 9.07% PLUS (fixed for the life of the loan).', source: 'ED announcement June 2026 (shared/data/loans.ts FEDERAL_RATES)', asOf: '2026-06', verified: true },
      { text: 'Framework: (1) salary premium x remaining working years, discounted; (2) minus tuition, fees and the pay you give up while enrolled; (3) minus interest on financed costs; (4) stress-test with a 20% lower premium and a one-year delayed start. If payback exceeds 10 years, look for employer sponsorship or part-time study.' },
      { text: 'Employer tuition assistance of up to $5,250 a year is tax-free (IRC §127); many employers pay more with a service commitment.', source: 'IRC §127 (shared/data/irs2026.ts)', asOf: '2025-07', verified: true },
    ],
    trigger: 'Shown when whatIf.gradSchool.enabled or a goal of kind "gradschool" exists.',
  },
  {
    key: 'estate-basics',
    title: 'Estate basics at 22: beneficiaries, will, POA, health directive',
    stage: 'first-job',
    area: 'estate',
    summary: 'Four documents cover almost everything for a young adult, and the first one is free: beneficiary designations on every retirement account and life policy override your will, so set them the day you enroll.',
    items: [
      { text: 'Beneficiary designations: name a primary and contingent beneficiary on the 401(k), IRA, HSA and group life. Married? Federal law makes your spouse the 401(k) beneficiary unless they consent in writing otherwise.', source: 'ERISA §205 / IRC §417 spousal consent rules', asOf: '2026-11', verified: false },
      { text: 'Simple will: names who gets non-beneficiary assets and, if relevant, a guardian for children. Payable-on-death (POD) and transfer-on-death (TOD) registrations on bank and brokerage accounts keep them out of probate.' },
      { text: 'Durable financial power of attorney and a health-care proxy/advance directive let someone act for you if you are incapacitated; without them your family may need a court order. Most states offer statutory forms; your employer\'s legal-benefit plan often covers all four documents at no cost.' },
      { text: 'Estate tax is not a concern at this stage: the 2026 federal exclusion is $15 million per person and the annual gift exclusion is $19,000.', source: 'P.L. 119-21 §70106 and Rev. Proc. 2025-32 (shared/data/irs2026.ts)', asOf: '2025-10', verified: true },
    ],
    trigger: 'Advisory when any retirement balance > 0 and no beneficiary acknowledgement in notes; always listed under first-job.',
  },
  {
    key: 'investing-tools',
    title: 'Investing tools and brokerages: what to look for',
    stage: 'first-job',
    area: 'tools',
    summary: 'Any large, well-regulated brokerage will do; the features that matter are cost, simplicity and automation. The model portfolio in this app can be built with three or four low-cost index funds.',
    items: [
      { text: 'Look for: $0 commissions on stocks and ETFs, fractional shares, no account minimums or inactivity fees, automatic recurring investments, dividend reinvestment, SIPC membership (covers up to $500,000 of securities, including $250,000 cash, if the broker fails - not market losses), and two-factor authentication.', source: 'SIPC coverage limits (15 U.S.C. §78fff-3)', asOf: '2026-11', verified: false },
      { text: 'Funds: broad index funds or ETFs with expense ratios under 0.10% for U.S. and international stocks and under 0.10% for aggregate bonds. A single target-date fund (0.10-0.20%) is a fine default inside a 401(k).' },
      { text: 'Avoid: margin, options and crypto until the emergency fund and retirement accounts are funded; frequent trading (taxes and behaviour); and advisers paid by commission on the products they sell. Prefer fee-only fiduciaries (flat or hourly) if you want help.' },
      { text: 'Automation beats willpower: set payroll deferrals and a monthly transfer to the IRA/taxable account the day after payday, and rebalance once a year or when a sleeve drifts more than 5 points from target.' },
    ],
    trigger: 'Always listed; advisory when taxableContribution > 0 and balanceSheet.taxable === 0 (no account yet).',
  },
  {
    key: 'tax-loss-harvesting',
    title: 'Tax-loss harvesting and the wash-sale rule',
    stage: 'growing',
    area: 'tax',
    summary: 'In a taxable account you can sell a fund at a loss to offset gains (and up to $3,000 of ordinary income per year) and immediately buy a similar but not "substantially identical" fund. Not relevant inside IRAs or 401(k)s.',
    items: [
      { text: 'Capital losses offset capital gains without limit; any excess offsets up to $3,000 of ordinary income per year ($1,500 married filing separately) and carries forward indefinitely.', source: 'IRC §1211(b) and §1212(b)', asOf: '2026-11', verified: false },
      { text: 'Wash sale: a loss is disallowed if you buy the same or a substantially identical security within 30 days before or after the sale - including in your IRA or a spouse\'s account and via dividend reinvestment. Swap to a different index (e.g. total-market to S&P 500) to stay invested.', source: 'IRC §1091; IRS Publication 550', asOf: '2026-11', verified: false },
      { text: 'When it is worth it: taxable balances above roughly $50,000, a marginal rate of 22%+ and a market drop of 10% or more. At the 0% long-term gains rate (taxable income under $49,450 single in 2026) harvest GAINS instead to step up basis.', source: RP32, asOf: '2025-10', verified: true },
    ],
    trigger: 'Advisory when balanceSheet.taxable > 50000 and marginal federal rate >= 0.22.',
  },
  {
    key: 'equity-comp',
    title: 'Equity compensation basics: RSUs and ESPP',
    stage: 'first-job',
    area: 'investing',
    summary: 'RSUs are salary paid in stock: taxed as ordinary income when they vest, so treat vested shares like a cash bonus and diversify. An ESPP with a 15% discount is nearly free money if you sell promptly.',
    items: [
      { text: 'RSUs: the value at vest is W-2 wages (federal, state and FICA withheld, often at a flat 22% federal supplemental rate that under-withholds for higher earners). Your cost basis is the vest price; selling right away creates little extra tax. Holding concentrates your job and your savings in one company.', source: 'IRC §83 and supplemental wage withholding rules (Treas. Reg. §31.3402(g)-1)', asOf: '2026-11', verified: false },
      { text: 'ESPP (§423 plans): you buy at up to a 15% discount, often with a look-back to the lower of the start/end price; contributions are capped at $25,000 of stock value per year. A "quick sale" locks in the discount (taxed as ordinary income); a qualifying hold (2 years from grant, 1 from purchase) converts part of the gain to long-term capital gain.', source: 'IRC §423(b)(6) and (b)(8)', asOf: '2026-11', verified: false },
      { text: 'The engine adds annual RSU value to gross income, grows it with merit raises, and routes ESPP contributions through payroll; sold shares flow to the taxable account.' },
      { text: 'Watch the Roth IRA phase-out: RSU income counts toward MAGI, so a $130,000 salary plus $35,000 of vests sits close to the $153,000 single phase-out start for 2026 - the backdoor Roth may be needed within a few years.', source: N67, url: N67_URL, asOf: '2025-11', verified: true },
    ],
    trigger: 'Shown when benefits.equityComp.annualRsuValue > 0 or esppContribPct > 0.',
  },
  {
    key: 'public-pensions',
    title: 'Public pensions and the Social Security Fairness Act',
    stage: 'first-job',
    area: 'retirement',
    summary: 'Teachers, police and many state employees earn a defined-benefit pension instead of (or alongside) Social Security. Know your multiplier, vesting and whether your job is covered by Social Security - and that the WEP/GPO penalties were repealed in January 2025.',
    items: [
      { text: 'Benefit = multiplier x years of service x final average salary. A 2.3% multiplier after 30 years replaces 69% of final pay. Employee contributions (e.g. 8.25% of pay) are mandatory and pre-tax; vesting is typically 5-10 years, and leaving early usually returns only your contributions plus modest interest.', source: 'Persona example modelled on Texas TRS (2.3% multiplier, 8.25% employee contribution); plan details vary - confirm with the plan', asOf: '2026-11', verified: false },
      { text: 'Social Security coverage: about a quarter of state and local employees (including most Texas and California teachers and many police officers) are outside Social Security, so your own earnings record may be thin. The engine suppresses the Social Security estimate when coveredBySocialSecurity is false.' },
      { text: 'The Social Security Fairness Act (H.R. 82), signed January 5, 2025, repealed the Windfall Elimination Provision and Government Pension Offset for benefits payable from January 2024, so a non-covered pension no longer reduces your own or spousal/survivor Social Security benefits from other work.', source: 'Social Security Fairness Act, signed Jan 5, 2025 (Colorado PERA, Washington LEOFF, Chase and other summaries)', url: 'https://copera.org/pera-on-the-issues/president-biden-signs-wep-gpo-repeal-bill-into-law/', asOf: '2025-01', verified: true },
      { text: 'Supplement the pension: 403(b)/457(b) plans share the $24,500 deferral limit per plan type (a 457(b) is a separate limit), and 457(b) money can be withdrawn without the 10% penalty after separation at any age.', source: N67 + '; IRC §457(b) and §72(t)(2)', url: N67_URL, asOf: '2025-11', verified: false },
    ],
    trigger: 'Shown when benefits.pension.enabled; alert when coveredBySocialSecurity is false and savings.deferralPct < 0.05.',
  },
  {
    key: 'social-security-basics',
    title: 'How Social Security fits a 40-year plan',
    stage: 'all',
    area: 'retirement',
    summary: 'For a 22-year-old, Social Security is a real but uncertain floor. The engine estimates a benefit from your projected earnings with the 2027 bend points and lets the adviser apply a haircut for the projected trust-fund shortfall.',
    items: [
      { text: 'Benefit formula (PIA) for someone first eligible in 2027: 90% of the first $1,340 of average indexed monthly earnings, 32% up to $8,077, 15% above. 2026 bend points were $1,286 / $7,749.', source: 'SSA Office of the Chief Actuary bend points; Federal Register notice Oct 26, 2026 (shared/data/ss.ts)', url: 'https://www.ssa.gov/oact/cola/bendpoints.html', asOf: '2026-10', verified: true },
      { text: 'Full retirement age is 67 for anyone born 1960 or later; claiming at 62 cuts the benefit by 30%, waiting to 70 raises it by 24%. COLA for 2027 is 3.6%.', source: 'SSA (shared/data/ss.ts CLAIM_ADJUSTMENT and COLA)', asOf: '2026-10', verified: true },
      { text: 'Trust-fund context: the 2025 Trustees Report projects OASI depletion in 2033 with about 77% of scheduled benefits payable thereafter unless Congress acts. The advisor can model this with assumptions.ssHaircut.', source: '2025 OASDI Trustees Report (shared/data/ss.ts TRUST_FUND_NOTE)', asOf: '2025-06', verified: false },
    ],
    trigger: 'Always available; advisory when assumptions.ssHaircut === 0 for clients under 40.',
  },
];

export function playbookByArea(area: PlaybookTopic['area']): PlaybookTopic[] {
  return PLAYBOOK.filter((t) => t.area === area);
}

export function playbookByKey(key: string): PlaybookTopic | undefined {
  return PLAYBOOK.find((t) => t.key === key) ?? PILOT_PLAYBOOK.find((t) => t.key === key);
}

// ---------------------------------------------------------------------------------------------
// Flight Plan topics (airline pilots). Figures quote shared/data/airlines.ts with the same verification status.
// ---------------------------------------------------------------------------------------------

const A2Z_AA = AIRLINE_SOURCES.aaSalary;
const ENVOY = AIRLINE_SOURCES.envoy;
const FDX = AIRLINE_SOURCES.fdxCommentary;
const AA_MBCB = AIRLINE_SOURCES.aaMbcb;

export const PILOT_PLAYBOOK: PlaybookTopic[] = [
  {
    key: 'pilot-pay',
    title: 'How airline pay works: rate × credit hours',
    stage: 'first-job',
    area: 'career',
    products: ['flight-plan'],
    summary: 'Airline pilots are paid an hourly rate for credited flight time, not a salary. Annual pay in this plan is the contract rate for your seat and longevity year, times credit hours per month, times twelve, plus any profit sharing.',
    trigger: 'Always shown on Flight Plan; the Career screen shows the rate in use for every year.',
    items: [
      { text: 'Longevity steps: most scales step up each year to year 12, then stop. Switching airlines resets longevity to year 1 (seniority is per carrier), which is why a flow or early move is worth more than a late one.', source: 'Industry convention; scales in airlines.ts', asOf: AIRLINES_AS_OF, verified: true },
      { text: 'Credit hours: contractual minimum guarantees are typically 70–75 hours a month; 80 is a common planning figure for a line holder. Reserve, premium trips and overtime move actual pay above or below that.', source: 'Planning assumption (editable: credit hours per month)', asOf: AIRLINES_AS_OF, verified: false },
      { text: 'Southwest pays per Trip for Pay (TFP), not per hour; the credit-hours input is treated as TFP per month on Southwest paths.', source: 'Southwest pay structure (TFP)', asOf: '2026-08', verified: true },
      { text: `American's 2026 737 scale tops out at $${AIRLINES.american.narrowbody.fo[11].value}/hr for a 12-year FO and $${AIRLINES.american.narrowbody.ca[11].value}/hr for a 12-year captain; widebody captains top out higher.`, source: A2Z_AA.name, url: A2Z_AA.url, asOf: '2026-08', verified: true },
      { text: 'Per diem (tax-free expense allowance on trips) and premium pay are not modelled; they are upside to the projection, not part of it.', source: 'Model scope', asOf: AIRLINES_AS_OF, verified: true },
    ],
  },
  {
    key: 'loss-of-license',
    title: 'Loss-of-license coverage',
    stage: 'first-job',
    area: 'insurance',
    products: ['flight-plan'],
    summary: 'A pilot who loses the FAA medical certificate loses pilot income even when a general disability policy would not pay. Loss-of-license insurance (and own-occupation long-term disability) protects the asset the whole plan rests on: future flying pay.',
    trigger: 'insurance.lossOfLicense false -> loss-of-license alert (caution) and an insurance action item',
    items: [
      { text: 'Loss-of-license pays a lump sum or monthly benefit when a medical denial grounds you; union-negotiated group plans often provide a modest base benefit that can be topped up with an individual policy.', source: 'Product category description (no carrier endorsed)', asOf: AIRLINES_AS_OF, verified: false },
      { text: 'Own-occupation LTD pays when you cannot work as a pilot, even if you could do another job; "any-occupation" policies may not. Check the definition and the benefit cap against the pay projection.', source: 'Insurance convention', asOf: AIRLINES_AS_OF, verified: false },
      { text: 'Group plans usually end when you leave the carrier; individual coverage is portable across a flow or a job change.', source: 'Insurance convention', asOf: AIRLINES_AS_OF, verified: false },
    ],
  },
  {
    key: 's415c-spillover',
    title: '§415(c) spillover: when company contributions hit the cap',
    stage: 'growing',
    area: 'retirement',
    products: ['flight-plan'],
    summary: `Majors contribute 15–18% of pay to the 401(k) with no match required. Total annual additions (your deferrals plus company money) are capped at $${LIMITS_2026.annualAdditions415c.value.toLocaleString('en-US')} in 2026, so an 18% contribution plus a maximum deferral binds near $${Math.round((LIMITS_2026.annualAdditions415c.value - LIMITS_2026.electiveDeferral.value) / 0.18 / 1000)}k of pay. What happens to the excess depends on the contract.`,
    trigger: 'ledger usage.s415cSpill > 0 -> s415c-spill alert (caution) and a planning action',
    items: [
      { text: `2026 limits: $${LIMITS_2026.electiveDeferral.value.toLocaleString('en-US')} elective deferral; $${LIMITS_2026.annualAdditions415c.value.toLocaleString('en-US')} total annual additions; compensation counted up to $${LIMITS_2026.compensationCap401a17.value.toLocaleString('en-US')} (§401(a)(17)). Age-50 catch-ups sit outside the §415(c) cap.`, source: LIMITS_2026.annualAdditions415c.source, url: LIMITS_2026.annualAdditions415c.url, asOf: LIMITS_2026.annualAdditions415c.asOf, verified: LIMITS_2026.annualAdditions415c.verified },
      { text: 'Cash in lieu: some contracts pay the excess as taxable wages. The plan assumes you invest the after-tax amount in a taxable account rather than spend it.', source: 'Contract practice; airlines.ts excessHandling', asOf: AIRLINES_AS_OF, verified: false },
      { text: "Market-based cash balance plan (MBCB): American's 2023 agreement routes excess company contributions to a cash balance plan; Southwest adds a 2% MBCB credit on top of its 18%. These are employer-funded, pre-tax balances that the plan keeps with pre-tax savings.", source: AA_MBCB.name, url: AA_MBCB.url, asOf: '2023-08', verified: false },
      { text: 'Lowering your own deferral does not help: company money is non-elective and counts first in most plan designs, and the cap applies to the total. Use the excess-handling setting on the career path if your plan document differs.', source: 'Model rule (employer trimmed first in applySection415c)', asOf: AIRLINES_AS_OF, verified: true },
    ],
  },
  {
    key: 'fedex-election',
    title: 'FedEx retirement election: legacy pension vs MBCB',
    stage: 'growing',
    area: 'retirement',
    products: ['flight-plan'],
    summary: 'The 2026 FedEx CBA keeps the legacy defined-benefit pension for pilots hired before June 29, 2026 and opens a one-time, irrevocable election to switch to a market-based cash balance plan. Pilots hired later get the MBCB only.',
    trigger: 'profile.pilot.employer fedex and a cargo stage -> fedex-election alert (caution) and an action item',
    items: [
      { text: `Election window: ${AIRLINES.fedex.retirement.pension?.electionWindow.value}. Pension is the default.`, source: FDX.name, url: FDX.url, asOf: '2026-01', verified: false },
      { text: `Legacy pension modelled as ${AIRLINES.fedex.retirement.pension?.maxAnnualBenefit.value.toLocaleString('en-US')} maximum annual benefit × min(1, service years ÷ ${AIRLINES.fedex.retirement.pension?.fullServiceYears.value}) × min(1, final average earnings ÷ cap), nominal, no COLA.`, source: AIRLINES.fedex.retirement.pension?.maxAnnualBenefit.source ?? '', url: AIRLINES.fedex.retirement.pension?.maxAnnualBenefit.url, asOf: '2026-06', verified: false },
      { text: `MBCB alternative modelled as about ${AIRLINES.fedex.retirement.pension?.mbcbAltPct.value}% of pay through 2028 and 10% after, credited to a pre-tax cash balance; varies by fleet and seat.`, source: FDX.name, url: FDX.url, asOf: '2026-01', verified: false },
      { text: 'Compare the two with two "stay" paths on the Career screen (one per FedEx option). The pension favours long service and late retirement; the MBCB favours portability, early retirement and survivors.', source: 'Planning guidance', asOf: AIRLINES_AS_OF, verified: true },
    ],
  },
  {
    key: 'flow-and-premium',
    title: 'Flow-through agreements and premium pay',
    stage: 'student',
    area: 'career',
    products: ['flight-plan'],
    summary: 'A flow-through agreement guarantees a regional pilot a seat at the parent major after a set period, which removes the biggest uncertainty in the pay projection. Temporary premiums raise early pay but should not be projected past their end date.',
    trigger: 'Envoy on any path -> envoy-premium advisory',
    items: [
      { text: 'Envoy pilots have a guaranteed flow to American; the plan models the flow after the "years to major" milestone and keeps Envoy longevity separate from American longevity (year 1 at the major).', source: ENVOY.name, url: ENVOY.url, asOf: AIRLINES_AS_OF, verified: true },
      { text: `Envoy's 50% pilot-supply premium runs through ${AIRLINES.envoy.premium?.ends}; the plan uses base rates after that.`, source: ENVOY.name, url: ENVOY.url, asOf: AIRLINES_AS_OF, verified: true },
      { text: 'Envoy pays first officers at the captain rate after 750 hours (year 2 and later); switch the rule off on the career path if it no longer applies to your hire date.', source: ENVOY.name, url: ENVOY.url, asOf: AIRLINES_AS_OF, verified: true },
      { text: 'Without a flow, the "years to major" milestone is a guess about hiring cycles. Compare a slow and a fast version of the same path rather than trusting one date.', source: 'Planning guidance', asOf: AIRLINES_AS_OF, verified: true },
    ],
  },
  {
    key: 'furlough',
    title: 'Furlough planning',
    stage: 'early-career',
    area: 'banking',
    products: ['flight-plan'],
    summary: 'Junior pilots at a new carrier are the first out in a downturn. A furlough stops pay but keeps your seniority number; the plan models it as zero-pay years right after joining the major with longevity frozen, and sets a larger emergency fund when exposure is high.',
    trigger: 'whatIf.furloughYears > 0; supplement s1 = high exposure -> 9- or 12-month emergency fund',
    items: [
      { text: 'Emergency fund rule: 6 months by default; 9 months with a single income or high exposure; 12 months when single income, early career (student, CFI or regional) and high exposure all apply.', source: 'Flight Plan supplement rule (scoring.ts)', asOf: AIRLINES_AS_OF, verified: true },
      { text: 'Recall rights and furlough pay vary by contract; the model assumes no furlough pay and a recall to the same seat at the same longevity.', source: 'Model assumption', asOf: AIRLINES_AS_OF, verified: false },
      { text: 'Use the furlough what-if on the Career screen to see the hit to net worth at retirement; a one-year furlough early is usually recoverable, a two-year gap plus a lost upgrade is not.', source: 'Planning guidance', asOf: AIRLINES_AS_OF, verified: true },
    ],
  },
  {
    key: 'contract-cycles',
    title: 'Contract amendable dates and pay growth',
    stage: 'all',
    area: 'career',
    products: ['flight-plan'],
    summary: 'Airline contracts have an amendable date rather than an expiry. Pay beyond the dated raises in the current agreement is unknown, so the plan uses a pay-growth assumption (default 3%/yr) after the last listed raise.',
    trigger: 'Major or cargo carrier on a path with a dated amendable value -> amendable advisory',
    items: [
      { text: `American: amendable ${AIRLINES.american.amendable.value}; Southwest: ${AIRLINES.southwest.amendable.value}; FedEx: ${AIRLINES.fedex.amendable.value}.`, source: 'airlines.ts amendable dates (see sources.md)', asOf: AIRLINES_AS_OF, verified: true },
      { text: 'Negotiations often run years past the amendable date; retroactive pay is common but not guaranteed. Treat the pay-growth assumption as a planning placeholder, not a forecast.', source: 'Planning guidance', asOf: AIRLINES_AS_OF, verified: true },
    ],
  },
];

/** Playbook topics for a product: shared topics plus the product's own. */
export function playbookFor(product: ProductKey | string | undefined | null): PlaybookTopic[] {
  const all = [...PLAYBOOK, ...PILOT_PLAYBOOK];
  return all.filter((t) => !t.products || t.products.includes(product as ProductKey));
}
