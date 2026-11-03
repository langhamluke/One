/**
 * State income tax presets (tax year 2026). Flat-rate states carry the statutory rate; graduated states carry either a
 * bracket table (when corroborated) or an ESTIMATED effective-rate curve flagged verified:false. Local/city taxes excluded.
 *
 * Data pass 2026-11-03: rates were corroborated from web-search snippets (Tax Foundation "State Individual Income Tax
 * Rates and Brackets, 2026" and "2026 State Tax Changes", state revenue departments where surfaced, Bloomberg Tax,
 * Kiplinger, EY). Effective-rate curves were computed by this build from the best-known bracket tables and are
 * estimates (see shared/data/sources.md). Standard-deduction/exemption figures on flat states are plain numbers and
 * are the build's best knowledge; they are noted on the rate entry when not confirmed.
 */
import { sourced, type Sourced } from '../lib/types';

export const STATES_AS_OF = '2026-01';

const TF_2026 = 'https://taxfoundation.org/data/all/state/state-income-tax-rates-2026/';
const TF_CHANGES = 'https://taxfoundation.org/research/all/state/2026-state-tax-changes/';

export interface StateBracket {
  upTo: number;
  rate: number;
}

export type StateTax =
  | { type: 'none'; rate: Sourced<number> }
  | { type: 'flat'; rate: Sourced<number>; standardDeductionSingle?: number; standardDeductionMfj?: number }
  | { type: 'brackets'; single: Sourced<StateBracket[]>; mfj: Sourced<StateBracket[]>; standardDeductionSingle: number; standardDeductionMfj: number }
  | { type: 'effective'; curve: Sourced<{ income: number; rate: number }[]>; note: string };

export interface StatePreset {
  code: string;
  name: string;
  tax: StateTax;
}

const none = (code: string, name: string, note?: string): StatePreset => ({
  code,
  name,
  tax: { type: 'none', rate: sourced(0, 'No state individual income tax on wages (Tax Foundation 2026)', STATES_AS_OF, true, { url: TF_2026, note }) },
});

/** ESTIMATED effective-rate curve for a single filer (state tax / gross income) computed from the bracket table named in the note. */
const effective = (code: string, name: string, curve: { income: number; rate: number }[], basis: string, url?: string): StatePreset => ({
  code,
  name,
  tax: {
    type: 'effective',
    curve: sourced(curve, `ESTIMATE computed by this build from ${basis}`, STATES_AS_OF, false, { url, note: 'Single-filer effective rates; MFJ households will be over-taxed slightly. Replace with a bracket table once the 2026 tables are confirmed.' }),
    note: `Estimated curve (verified:false). Basis: ${basis}.`,
  },
});

export const STATES: Record<string, StatePreset> = {
  // ---- No wage income tax ----------------------------------------------------------------------
  TX: none('TX', 'Texas'),
  FL: none('FL', 'Florida'),
  NV: none('NV', 'Nevada'),
  TN: none('TN', 'Tennessee'),
  WA: none('WA', 'Washington', 'Washington taxes long-term capital gains above an indexed threshold (7%, plus a 2.9% surcharge over $1M since 2025) but has no tax on wages; the engine treats it as no-tax.'),

  // ---- Flat-rate states -------------------------------------------------------------------------
  AZ: {
    code: 'AZ',
    name: 'Arizona',
    tax: { type: 'flat', rate: sourced(0.025, 'Arizona flat 2.5% (Tax Foundation 2026; Kiplinger)', STATES_AS_OF, true, { url: TF_2026, note: 'AZ conforms to the federal standard deduction ($16,100 / $32,200 for 2026).' }), standardDeductionSingle: 16100, standardDeductionMfj: 32200 },
  },
  CO: {
    code: 'CO',
    name: 'Colorado',
    tax: { type: 'flat', rate: sourced(0.044, 'Colo. Rev. Stat. §39-22-104: 4.40% statutory (Tax Foundation 2026; paybrackets)', STATES_AS_OF, true, { url: TF_2026, note: 'TABOR surplus years can temporarily lower the rate (4.25% applied in some recent years); 4.40% is the 2026 statutory rate. CO conforms to the federal standard deduction.' }), standardDeductionSingle: 16100, standardDeductionMfj: 32200 },
  },
  GA: {
    code: 'GA',
    name: 'Georgia',
    tax: { type: 'flat', rate: sourced(0.0499, 'Georgia flat 4.99% for TY2026 (HB 463, signed May 2026, retroactive to Jan 1, 2026; reported by Vialto Partners, brackets.tax and others)', STATES_AS_OF, true, { url: 'https://vialtopartners.com/regional-alerts/united-states-global-equity-2026-state-tax-rate-table-and-q2-updates', note: 'Earlier 2026 tables show 5.09% (the pre-HB 463 schedule); 2025 was 5.19%. GA standard deduction $12,000 / $24,000 (2024 law, from memory - confirm).' }), standardDeductionSingle: 12000, standardDeductionMfj: 24000 },
  },
  IL: {
    code: 'IL',
    name: 'Illinois',
    tax: { type: 'flat', rate: sourced(0.0495, 'Illinois flat 4.95% (Tax Foundation 2026; ustax.tools)', STATES_AS_OF, true, { url: TF_2026, note: 'No standard deduction; $2,850 personal exemption per person entered as the deduction (from memory - confirm the 2026 amount).' }), standardDeductionSingle: 2850, standardDeductionMfj: 5700 },
  },
  IN: {
    code: 'IN',
    name: 'Indiana',
    tax: { type: 'flat', rate: sourced(0.0295, 'Indiana flat 2.95% for 2026, down from 3.00% (Tax Foundation 2026 state tax changes)', STATES_AS_OF, true, { url: TF_CHANGES, note: 'County income taxes (roughly 0.5-3%) are excluded. $1,000 personal exemption used as the deduction.' }), standardDeductionSingle: 1000, standardDeductionMfj: 2000 },
  },
  MA: {
    code: 'MA',
    name: 'Massachusetts',
    tax: { type: 'flat', rate: sourced(0.05, 'Massachusetts flat 5% on wages (M.G.L. c.62 §4); corroborated in this build only by secondary calculator sites', STATES_AS_OF, false, { url: TF_2026, note: 'A 4% surtax applies to taxable income above roughly $1.08 million (2026 indexed threshold) - note only, not modelled. Personal exemption $4,400 / $8,800 used as the deduction.' }), standardDeductionSingle: 4400, standardDeductionMfj: 8800 },
  },
  MI: {
    code: 'MI',
    name: 'Michigan',
    tax: { type: 'flat', rate: sourced(0.0425, 'Michigan flat 4.25% for TY2026 (Michigan Treasurer determination, April 2026; rate-cut trigger not met)', STATES_AS_OF, true, { url: 'https://www.miningjournal.net/news/local/2026/04/state-individual-income-tax-rate-for-2026-tax-year-determined/', note: 'City income taxes (e.g. Detroit 2.4%) excluded. Personal exemption ~$5,800 per person used as the deduction (from memory - confirm the 2026 amount).' }), standardDeductionSingle: 5800, standardDeductionMfj: 11600 },
  },
  NC: {
    code: 'NC',
    name: 'North Carolina',
    tax: { type: 'flat', rate: sourced(0.0399, 'North Carolina flat 3.99% for 2026, down from 4.25% (NC DOR 2026 withholding methods via Bloomberg Tax; Tax Foundation 2026)', STATES_AS_OF, true, { url: 'https://news.bloombergtax.com/payroll/north-carolina-to-decrease-income-tax-rate-for-2026', note: 'Further cuts (3.49% in 2027) depend on revenue triggers. NC standard deduction $12,750 / $25,500 (from memory - confirm).' }), standardDeductionSingle: 12750, standardDeductionMfj: 25500 },
  },
  PA: {
    code: 'PA',
    name: 'Pennsylvania',
    tax: { type: 'flat', rate: sourced(0.0307, 'Pennsylvania flat 3.07% (Tax Foundation 2026; unchanged)', STATES_AS_OF, true, { url: TF_2026, note: 'No standard deduction or personal exemption. Local earned-income taxes (typically 1-3.9%) excluded.' }) },
  },
  UT: {
    code: 'UT',
    name: 'Utah',
    tax: { type: 'flat', rate: sourced(0.0445, 'Utah flat 4.45% for TY2026 per SB 60 (March 2026), reported by one secondary source; others still show 4.50%', STATES_AS_OF, false, { url: TF_2026, note: 'Use 4.50% if SB 60 is not confirmed. Utah uses a taxpayer credit instead of a standard deduction; no deduction modelled.' }) },
  },
  OH: {
    code: 'OH',
    name: 'Ohio',
    tax: { type: 'flat', rate: sourced(0.0275, 'Ohio flat 2.75% on nonbusiness income above $26,050 from TY2026 (HB 96, signed June 30, 2025; EY Tax News 2025-1744; Plante Moran)', STATES_AS_OF, true, { url: 'https://taxnews.ey.com/news/2025-1744-ohio-legislation-lowers-top-personal-tax-rate-retroactive-to-january-1-2025-implements-flat-tax-in-2026', note: 'The $26,050 zero bracket is modelled as the deduction for every filing status. Municipal income taxes (up to ~3%) excluded.' }), standardDeductionSingle: 26050, standardDeductionMfj: 26050 },
  },
  KY: {
    code: 'KY',
    name: 'Kentucky',
    tax: { type: 'flat', rate: sourced(0.035, 'Kentucky flat 3.50% for 2026, down from 4.00% (Tax Foundation 2026 state tax changes)', STATES_AS_OF, true, { url: TF_CHANGES, note: 'KY standard deduction ~$3,270 (from memory - confirm). Local occupational taxes excluded.' }), standardDeductionSingle: 3270, standardDeductionMfj: 6540 },
  },
  IA: {
    code: 'IA',
    name: 'Iowa',
    tax: { type: 'flat', rate: sourced(0.038, 'Iowa flat 3.8% (2024 law, in effect from TY2025; most 2026 sources agree, one older guide shows 3.9%)', STATES_AS_OF, true, { url: 'https://www.aol.com/iowas-income-tax-rate-dropping-104546981.html', note: 'Iowa conforms to the federal standard deduction.' }), standardDeductionSingle: 16100, standardDeductionMfj: 32200 },
  },
  LA: {
    code: 'LA',
    name: 'Louisiana',
    tax: { type: 'flat', rate: sourced(0.03, 'Louisiana flat 3.0% (2024 overhaul effective TY2025; two secondary sources)', STATES_AS_OF, true, { url: 'https://ustax.tools/tax-insights/states-that-changed-tax-rates-2026/', note: 'Standard deduction roughly doubled to $12,500 / $25,000 by the same law (from memory - confirm).' }), standardDeductionSingle: 12500, standardDeductionMfj: 25000 },
  },
  MS: {
    code: 'MS',
    name: 'Mississippi',
    tax: { type: 'flat', rate: sourced(0.04, 'Mississippi 4.00% for 2026, down from 4.40% (Tax Foundation 2026 state tax changes)', STATES_AS_OF, true, { url: TF_CHANGES, note: 'The first $10,000 of taxable income is exempt (0% bracket) and is modelled as the deduction; MS standard deduction/exemptions excluded.' }), standardDeductionSingle: 10000, standardDeductionMfj: 20000 },
  },

  // ---- Graduated states with corroborated 2026 tables -------------------------------------------
  VA: {
    code: 'VA',
    name: 'Virginia',
    tax: {
      type: 'brackets',
      single: sourced(
        [
          { upTo: 3000, rate: 0.02 },
          { upTo: 5000, rate: 0.03 },
          { upTo: 17000, rate: 0.05 },
          { upTo: Infinity, rate: 0.0575 },
        ],
        'Va. Code §58.1-320 (brackets unchanged; same for all filing statuses) - corroborated by ustax.tools, prosalarytax, joingerald',
        STATES_AS_OF,
        true,
        { url: 'https://ustax.tools/virginia-tax-brackets-2026/' },
      ),
      mfj: sourced(
        [
          { upTo: 3000, rate: 0.02 },
          { upTo: 5000, rate: 0.03 },
          { upTo: 17000, rate: 0.05 },
          { upTo: Infinity, rate: 0.0575 },
        ],
        'Va. Code §58.1-320 (Virginia does not widen brackets for joint filers)',
        STATES_AS_OF,
        true,
        { url: 'https://ustax.tools/virginia-tax-brackets-2026/', note: 'Standard deduction $8,750 single / $17,500 joint through TY2026 (SB 7 would make these permanent); $930 personal exemption not modelled.' },
      ),
      standardDeductionSingle: 8750,
      standardDeductionMfj: 17500,
    },
  },
  NJ: {
    code: 'NJ',
    name: 'New Jersey',
    tax: {
      type: 'brackets',
      single: sourced(
        [
          { upTo: 20000, rate: 0.014 },
          { upTo: 35000, rate: 0.0175 },
          { upTo: 40000, rate: 0.035 },
          { upTo: 75000, rate: 0.05525 },
          { upTo: 500000, rate: 0.0637 },
          { upTo: 1000000, rate: 0.0897 },
          { upTo: Infinity, rate: 0.1075 },
        ],
        'N.J.S.A. 54A:2-1 single/separate schedule (not indexed; unchanged for 2026) - corroborated by ustax.tools, TaxAct, Taxstra',
        STATES_AS_OF,
        true,
        { url: 'https://ustax.tools/new-jersey-tax-brackets-2026/' },
      ),
      mfj: sourced(
        [
          { upTo: 20000, rate: 0.014 },
          { upTo: 50000, rate: 0.0175 },
          { upTo: 70000, rate: 0.0245 },
          { upTo: 80000, rate: 0.035 },
          { upTo: 150000, rate: 0.05525 },
          { upTo: 500000, rate: 0.0637 },
          { upTo: 1000000, rate: 0.0897 },
          { upTo: Infinity, rate: 0.1075 },
        ],
        'N.J.S.A. 54A:2-1 joint/HoH schedule as recalled; secondary sources disagree on the 2.45%/3.5% cut-offs',
        STATES_AS_OF,
        false,
        { url: 'https://blog.taxact.com/what-is-new-jersey-state-income-tax/', note: 'Confirm the joint schedule on nj.gov/treasury/taxation. NJ has no standard deduction; the $1,000 personal exemption per filer is entered as the deduction.' },
      ),
      standardDeductionSingle: 1000,
      standardDeductionMfj: 2000,
    },
  },
  NY: {
    code: 'NY',
    name: 'New York',
    tax: {
      type: 'brackets',
      single: sourced(
        [
          { upTo: 8500, rate: 0.039 },
          { upTo: 11700, rate: 0.044 },
          { upTo: 13900, rate: 0.0515 },
          { upTo: 80650, rate: 0.054 },
          { upTo: 215400, rate: 0.059 },
          { upTo: 1077550, rate: 0.0685 },
          { upTo: 5000000, rate: 0.0965 },
          { upTo: 25000000, rate: 0.103 },
          { upTo: Infinity, rate: 0.109 },
        ],
        'NY Tax Law §601 as amended by the FY2026 budget: lowest five rates cut 0.1 point for TY2026 (3.9%-10.9%), thresholds unchanged - several secondary sources; intermediate rates inferred',
        STATES_AS_OF,
        false,
        { url: 'https://ustax.tools/new-york-tax-brackets-2026/', note: 'Rates 4.4/5.15/5.4/5.9% are the 2025 rates minus 0.1 point; confirm on tax.ny.gov (some sources still show 4%-10.9%). NYC resident tax (3.078-3.876%) excluded.' },
      ),
      mfj: sourced(
        [
          { upTo: 17150, rate: 0.039 },
          { upTo: 23600, rate: 0.044 },
          { upTo: 27900, rate: 0.0515 },
          { upTo: 161550, rate: 0.054 },
          { upTo: 323200, rate: 0.059 },
          { upTo: 2155350, rate: 0.0685 },
          { upTo: 5000000, rate: 0.0965 },
          { upTo: 25000000, rate: 0.103 },
          { upTo: Infinity, rate: 0.109 },
        ],
        'NY Tax Law §601 joint schedule (thresholds unchanged from 2025; rates as above)',
        STATES_AS_OF,
        false,
        { url: 'https://ustax.tools/new-york-tax-brackets-2026/', note: 'Standard deduction $8,000 single / $16,050 joint (corroborated by several sources).' },
      ),
      standardDeductionSingle: 8000,
      standardDeductionMfj: 16050,
    },
  },
  SC: {
    code: 'SC',
    name: 'South Carolina',
    tax: {
      type: 'brackets',
      single: sourced(
        [
          { upTo: 30000, rate: 0.0199 },
          { upTo: Infinity, rate: 0.0521 },
        ],
        'SC Act 110 of 2026 (signed March 30, 2026; SCDOR IL26-20): two brackets from TY2026 - 1.99% on the first $30,000 and 5.21% above (rates from prosalarytax/Keka; SCDOR letter confirms the structure)',
        STATES_AS_OF,
        false,
        { url: 'https://dor.sc.gov/sites/dor/files/policies/IL26-20.pdf', note: 'The 5.21% top rate was seen in a single secondary source; confirm in the SC1040 2026 instructions.' },
      ),
      mfj: sourced(
        [
          { upTo: 30000, rate: 0.0199 },
          { upTo: Infinity, rate: 0.0521 },
        ],
        'SC Act 110 of 2026 (same brackets for all statuses, as reported)',
        STATES_AS_OF,
        false,
        { url: 'https://dor.sc.gov/sites/dor/files/policies/IL26-20.pdf', note: 'New "SC Income Adjusted Deduction" of $15,000 single / $30,000 joint replaces federal conformity and phases out at higher incomes (phase-out not modelled).' },
      ),
      standardDeductionSingle: 15000,
      standardDeductionMfj: 30000,
    },
  },
  MO: {
    code: 'MO',
    name: 'Missouri',
    tax: {
      type: 'brackets',
      single: sourced(
        [
          { upTo: 1348, rate: 0 },
          { upTo: 2696, rate: 0.02 },
          { upTo: 4044, rate: 0.025 },
          { upTo: 5392, rate: 0.03 },
          { upTo: 6740, rate: 0.035 },
          { upTo: 8088, rate: 0.04 },
          { upTo: 9436, rate: 0.045 },
          { upTo: Infinity, rate: 0.047 },
        ],
        'Missouri 2026 brackets (top rate 4.7% above $9,436) per calculover; MO DOR confirms the 4.7% top rate above $9,191 for 2025',
        STATES_AS_OF,
        false,
        { url: 'https://dor.mo.gov/personal/whatsnew/', note: '2026 thresholds from a single calculator site (indexed from the 2025 DOR table); confirm on dor.mo.gov. Missouri uses the federal standard deduction ($16,100 / $32,200).' },
      ),
      mfj: sourced(
        [
          { upTo: 1348, rate: 0 },
          { upTo: 2696, rate: 0.02 },
          { upTo: 4044, rate: 0.025 },
          { upTo: 5392, rate: 0.03 },
          { upTo: 6740, rate: 0.035 },
          { upTo: 8088, rate: 0.04 },
          { upTo: 9436, rate: 0.045 },
          { upTo: Infinity, rate: 0.047 },
        ],
        'Missouri applies the same brackets to joint filers',
        STATES_AS_OF,
        false,
        { url: 'https://dor.mo.gov/personal/whatsnew/' },
      ),
      standardDeductionSingle: 16100,
      standardDeductionMfj: 32200,
    },
  },

  // ---- Graduated states: ESTIMATED effective curves (2026 tables not corroborated) ----------------
  CA: effective(
    'CA',
    'California',
    [
      { income: 40000, rate: 0.019 },
      { income: 80000, rate: 0.0433 },
      { income: 150000, rate: 0.0665 },
      { income: 300000, rate: 0.0798 },
    ],
    'the TY2025 FTB single schedule (1%-12.3%, nine brackets to $721,314) and the $5,540 standard deduction; 2026 figures are indexed ~3.4% (FTB Tax News, Oct 2026) but could not be confirmed',
    'https://ustax.tools/california-tax-brackets-2026/',
  ),
  OR: effective(
    'OR',
    'Oregon',
    [
      { income: 40000, rate: 0.0734 },
      { income: 80000, rate: 0.0805 },
      { income: 150000, rate: 0.0854 },
      { income: 300000, rate: 0.0922 },
    ],
    'rates 4.75/6.75/8.75/9.9% (corroborated) with TY2025 single thresholds $4,400/$11,050/$125,000 and the 2026 standard deduction $2,910 (OR DOR withholding tables via one source)',
    'https://ustax.tools/oregon-tax-brackets-2026/',
  ),
  MN: effective(
    'MN',
    'Minnesota',
    [
      { income: 40000, rate: 0.033 },
      { income: 80000, rate: 0.049 },
      { income: 150000, rate: 0.0596 },
      { income: 300000, rate: 0.0745 },
    ],
    'rates 5.35/6.80/7.85/9.85% (MN DOR), 2026 single thresholds $33,310 (DOR) / $109,430 (third party) / ~$203,340 (2025 x 1.02369), and the DOR 2026 standard deduction $15,300 single / $30,600 joint',
    'https://www.revenue.state.mn.us/press-release/2025-12-16/minnesota-income-tax-brackets-standard-deduction-and-dependent-exemption',
  ),
  WI: effective(
    'WI',
    'Wisconsin',
    [
      { income: 40000, rate: 0.028 },
      { income: 80000, rate: 0.0436 },
      { income: 150000, rate: 0.0504 },
      { income: 300000, rate: 0.0517 },
    ],
    'rates 3.5/4.4/5.3/7.65% (corroborated) with TY2025 single thresholds $14,680/$29,370/$323,290 and the sliding standard deduction ($13,930 less 12% of income over $20,090)',
    'https://ustax.tools/wisconsin-tax-brackets-2026/',
  ),
  MD: effective(
    'MD',
    'Maryland',
    [
      { income: 40000, rate: 0.0384 },
      { income: 80000, rate: 0.043 },
      { income: 150000, rate: 0.0467 },
      { income: 300000, rate: 0.0515 },
    ],
    'the 10-bracket single schedule (2%-6.5%; 6.25%/6.5% brackets above $500k/$1M added by the 2025 BRFA), the $3,350 standard deduction and $3,200 personal exemption (phasing out above $100k). County piggyback taxes (2.25%-3.2%) are EXCLUDED',
    'https://ustax.tools/maryland-tax-brackets-2026/',
  ),
  CT: effective(
    'CT',
    'Connecticut',
    [
      { income: 40000, rate: 0.0331 },
      { income: 80000, rate: 0.0456 },
      { income: 150000, rate: 0.0517 },
      { income: 300000, rate: 0.0582 },
    ],
    'the single schedule 2/4.5/5.5/6/6.5/6.9/6.99% at $10k/$50k/$100k/$200k/$250k/$500k and the $15,000 personal exemption phasing out from $30k AGI; CT benefit-recapture and the 3%-rate phase-out for higher incomes are ignored',
    'https://taxbracketcalc.com/income-tax/connecticut-income-tax-calculator/',
  ),
};

export function listStates(): StatePreset[] {
  return Object.values(STATES).sort((a, b) => a.name.localeCompare(b.name));
}
