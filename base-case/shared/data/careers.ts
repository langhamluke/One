/**
 * Occupations, career ladders and metro wage indexes.
 * Wage source: U.S. BLS Occupational Employment and Wage Statistics (OEWS), May 2025 (released May 15, 2026),
 * national cross-industry estimates: annual 10th/25th/50th/75th/90th percentile wages.
 *
 * HOW THE BANDS WERE VERIFIED (data pass 2026-11-03): bls.gov could not be fetched directly in this build, so every
 * percentile band was taken from web-search snippets of (a) O*NET OnLine "National/Local Wages" tables (U.S. Dept of
 * Labor, republishing the May 2025 OEWS national row), (b) the BLS Occupational Outlook Handbook (May 2025 median,
 * 10th and 90th percentiles), and (c) independent aggregators that cite OEWS May 2025 (tradecareerpath, resumevera,
 * hyring, wagedex). A band is verified:true only when O*NET/OOH or two independent secondary sources agree on it.
 * Employment and 2024-34 growth figures are flagged individually; several are estimates (verified:false, see notes).
 *
 * Ladder levels are DERIVED from the percentile distribution (entry ~p10-p25, mid ~p50, senior ~p75-p90) unless a
 * level-specific source is cited, and are therefore flagged verified: false ("Derived from OEWS percentiles").
 * Projections: BLS Employment Projections 2024-34 (percent change in employment), where found.
 * Full citation list: shared/data/sources.md.
 */
import type { LadderLevel, SalaryBand } from '../lib/inputs';
import { sourced, type Sourced } from '../lib/types';

export const WAGES_AS_OF = '2025-05';
export const WAGES_SOURCE = 'BLS OEWS May 2025 (national), released 2026-05-15';

/** National all-occupations mean wage, May 2025 (BLS OEWS "largest occupations" table). Hourly $33.54 x 2,080 = $69,770. */
export const NATIONAL_MEAN_WAGE_2025 = sourced(69770, 'BLS OEWS May 2025, all occupations, annual mean wage', WAGES_AS_OF, true, {
  url: 'https://www.bls.gov/oes/2025/may/largest2.htm',
  note: 'Hourly mean $33.54 (BLS metro news releases, May 2025). Metro indexes below are metro hourly mean / $33.54.',
});
const NATIONAL_MEAN_HOURLY_2025 = 33.54;

export type Education = 'none' | 'trade' | 'associate' | 'bachelor' | 'master' | 'professional' | 'doctoral';
export type LayoffRisk = 'low' | 'medium' | 'high';

export interface Occupation {
  /** Stable key, e.g. 'software_developer' */
  code: string;
  /** SOC code, e.g. '15-1252' */
  soc: string;
  title: string;
  industry: string;
  education: Education;
  /** National OEWS percentile band (annual $) */
  oews: Sourced<SalaryBand>;
  /** National employment (OEWS) */
  employment: Sourced<number>;
  /** Projected % employment change 2024-34 (BLS EP), as a fraction e.g. 0.15 */
  growth: Sourced<number>;
  layoffRisk: LayoffRisk;
  /** Typical bonus as a fraction of salary (assumption, flagged) */
  bonusTypical: Sourced<number>;
  /** Career ladder, entry level first */
  levels: LadderLevel[];
  /** Pension-typical (public sector), equity-typical (tech), etc. */
  tags: ('pension' | 'equity' | 'overtime' | 'commission' | 'licensure' | 'shift-differential' | 'union')[];
  notes?: string;
}

export interface Metro {
  key: string;
  name: string;
  state: string;
  /** All-occupations annual mean wage relative to national (1.0 = national) */
  index: Sourced<number>;
  /** Optional per-occupation overrides: occupation code -> ratio of metro median to national median */
  occupationIndex?: Record<string, Sourced<number>>;
}

// ---------------------------------------------------------------------------------------------
// Helpers for building sourced values compactly
// ---------------------------------------------------------------------------------------------

const ONET = (soc: string, suffix = '') => `https://www.onetonline.org/link/localwages/${soc}.00${suffix}`;

function band(p10: number, p25: number, p50: number, p75: number, p90: number): SalaryBand {
  return { p10, p25, p50, p75, p90 };
}

/** OEWS May 2025 national band. `via` names the sources that were actually seen in this build. */
function oews(soc: string, b: SalaryBand, verified: boolean, via: string, url: string, note?: string): Sourced<SalaryBand> {
  return sourced(b, `BLS OEWS May 2025, SOC ${soc}, national annual percentiles (via ${via})`, WAGES_AS_OF, verified, { url, note });
}

/** OEWS national employment. */
function emp(value: number, source: string, verified: boolean, extra: { url?: string; note?: string } = {}): Sourced<number> {
  return sourced(value, source, WAGES_AS_OF, verified, extra);
}

/** BLS Employment Projections 2024-34 percent change (fraction). */
function growth(value: number, source: string, verified: boolean, extra: { url?: string; note?: string } = {}): Sourced<number> {
  return sourced(value, source, '2025-08', verified, extra);
}

/** Bonus assumption: always flagged. */
function bonus(value: number, why: string): Sourced<number> {
  return sourced(value, 'Modelling assumption (not a dataset)', '2026-11', false, { note: `Assumption: ${why}. Override per path with bonusPctOverride.` });
}

const EP_TED_IT = 'https://www.bls.gov/opub/ted/2026/artificial-intelligence-information-technology-and-employment-2024-34.htm';
const EP_TED_ENG = 'https://www.bls.gov/opub/ted/2026/force-mass-mechanisms-and-vectors-employment-projections-and-wages-in-engineering.htm';
const EP_FOD_HEALTH = 'https://www.bls.gov/ooh/field-of-degree/healthcare-and-related/healthcare-and-related-field-of-degree.htm';
const EP_FOD_CIT = 'https://www.bls.gov/ooh/field-of-degree/computer-and-information/computer-and-information-technology-field-of-degree.htm';

export const OCCUPATIONS: Record<string, Occupation> = {};

function add(o: Occupation): void {
  OCCUPATIONS[o.code] = o;
}

// ---------------------------------------------------------------------------------------------
// Technology
// ---------------------------------------------------------------------------------------------

const SWE_OEWS = oews('15-1252', band(82460, 105210, 135980, 171980, 214670), true, 'O*NET national row; BLS OOH p10/p50/p90; hyring', ONET('15-1252', '?st=NE'));
add({
  code: 'software_developer',
  soc: '15-1252',
  title: 'Software Developer',
  industry: 'Technology',
  education: 'bachelor',
  oews: SWE_OEWS,
  employment: emp(1687890, 'OEWS May 2025 national employment, via hyring (single secondary source)', false, { note: 'Single aggregator figure; confirm on bls.gov/oes' }),
  growth: growth(0.158, 'BLS Employment Projections 2024-34 (TED, Feb 2026): +15.8%, +267,700 jobs', true, { url: EP_TED_IT }),
  layoffRisk: 'medium',
  bonusTypical: bonus(0.1, 'tech cash bonus targets of 5-15% are common; RSUs are modelled separately'),
  levels: ladderFromBand(SWE_OEWS, [
    { title: 'Software Engineer I', years: 2, center: 0.2, bonusPct: 0.05 },
    { title: 'Software Engineer II', years: 3, center: 0.4, bonusPct: 0.08 },
    { title: 'Senior Software Engineer', years: 5, center: 0.62, bonusPct: 0.1 },
    { title: 'Staff Engineer / Engineering Manager', years: 99, center: 0.8, bonusPct: 0.15 },
  ]),
  tags: ['equity'],
  notes: 'Layoff risk: judgment (2022-25 tech layoff cycles). OEWS excludes equity compensation.',
});

const DS_OEWS = oews('15-2051', band(67240, 85660, 120230, 158880, 199130), true, 'O*NET national row; wagedex; coderhouse', ONET('15-2051'));
add({
  code: 'data_scientist',
  soc: '15-2051',
  title: 'Data Scientist',
  industry: 'Technology',
  education: 'bachelor',
  oews: DS_OEWS,
  employment: emp(262440, 'OEWS May 2025 national employment, via wagedex (another aggregator reports 275,600)', false, { note: 'Sources disagree (262,440 vs 275,600); confirm on bls.gov/oes' }),
  growth: growth(0.335, 'BLS Employment Projections 2024-34 (TED, Feb 2026): +33.5%, +82,500 jobs', true, { url: EP_TED_IT }),
  layoffRisk: 'medium',
  bonusTypical: bonus(0.1, 'tech/finance analytics bonus targets'),
  levels: ladderFromBand(DS_OEWS, [
    { title: 'Data Scientist I', years: 2, center: 0.2, bonusPct: 0.05 },
    { title: 'Data Scientist II', years: 3, center: 0.4, bonusPct: 0.08 },
    { title: 'Senior Data Scientist', years: 5, center: 0.62, bonusPct: 0.1 },
    { title: 'Principal / Manager, Data Science', years: 99, center: 0.8, bonusPct: 0.15 },
  ]),
  tags: ['equity'],
});

const CSA_OEWS = oews('15-1211', band(67340, 82860, 105850, 134110, 167710), true, 'BLS OOH p10/p50/p90; O*NET national row p25/p75', ONET('15-1211', '?st=TX'));
add({
  code: 'computer_systems_analyst',
  soc: '15-1211',
  title: 'Computer Systems Analyst (IT)',
  industry: 'Technology',
  education: 'bachelor',
  oews: CSA_OEWS,
  employment: emp(498810, 'BLS OEWS national table of uncertain vintage (likely May 2024)', false, { note: 'The May 2025 employment figure was not found; this is from a cached bls.gov page (likely May 2024).' }),
  growth: growth(0.08, 'BLS OOH field-of-degree table: +8% projected 2025-35 (the 2024-34 figure was not found)', false, { url: EP_FOD_CIT, note: 'Period mismatch: 2025-35 projection used as a proxy for 2024-34.' }),
  layoffRisk: 'medium',
  bonusTypical: bonus(0.05, 'corporate IT bonus targets'),
  levels: ladderFromBand(CSA_OEWS, [
    { title: 'Systems Analyst I', years: 2, center: 0.2, bonusPct: 0.03 },
    { title: 'Systems Analyst II', years: 3, center: 0.4, bonusPct: 0.05 },
    { title: 'Senior Systems Analyst', years: 5, center: 0.62, bonusPct: 0.07 },
    { title: 'IT Manager', years: 99, center: 0.8, bonusPct: 0.1 },
  ]),
  tags: [],
});

const ISA_OEWS = oews('15-1212', band(75090, 97810, 129180, 163500, 199850), true, 'O*NET national row; resumevera; wagedex', ONET('15-1212', '?st='));
add({
  code: 'information_security_analyst',
  soc: '15-1212',
  title: 'Information Security Analyst',
  industry: 'Technology',
  education: 'bachelor',
  oews: ISA_OEWS,
  employment: emp(180000, 'ESTIMATE from the May 2024 OEWS figure as recalled (~180,700); May 2025 figure not found', false, { note: 'Estimate; confirm on bls.gov/oes.' }),
  growth: growth(0.285, 'BLS Employment Projections 2024-34 (TED, Feb 2026): +28.5%, +52,100 jobs', true, { url: EP_TED_IT }),
  layoffRisk: 'low',
  bonusTypical: bonus(0.08, 'security roles carry corporate bonus targets'),
  levels: ladderFromBand(ISA_OEWS, [
    { title: 'Security Analyst I', years: 2, center: 0.2, bonusPct: 0.05 },
    { title: 'Security Analyst II', years: 3, center: 0.4, bonusPct: 0.07 },
    { title: 'Senior Security Analyst', years: 5, center: 0.62, bonusPct: 0.1 },
    { title: 'Security Architect / Manager', years: 99, center: 0.8, bonusPct: 0.12 },
  ]),
  tags: ['equity'],
});

// ---------------------------------------------------------------------------------------------
// Healthcare
// ---------------------------------------------------------------------------------------------

const RN_OEWS = oews('29-1141', band(68940, 80330, 97550, 112350, 137470), true, 'O*NET national row; tradecareerpath; wagedex/hyring (median)', ONET('29-1141', '?zip='));
add({
  code: 'registered_nurse',
  soc: '29-1141',
  title: 'Registered Nurse',
  industry: 'Healthcare',
  education: 'bachelor',
  oews: RN_OEWS,
  employment: emp(3300000, 'ESTIMATE from the May 2024 OEWS figure as recalled (~3.3 million); May 2025 figure not found', false, { note: 'Estimate; confirm on bls.gov/oes.' }),
  growth: growth(0.05, 'BLS OOH field-of-degree table (2024-34): +5%', true, { url: EP_FOD_HEALTH }),
  layoffRisk: 'low',
  bonusTypical: bonus(0.02, 'sign-on/retention bonuses are common but small relative to base; shift differentials are not modelled as bonus'),
  levels: ladderFromBand(RN_OEWS, [
    { title: 'RN I', years: 2, center: 0.2 },
    { title: 'RN II', years: 4, center: 0.4 },
    { title: 'Charge Nurse', years: 6, center: 0.6 },
    { title: 'Nurse Manager', years: 99, center: 0.8, bonusPct: 0.03 },
  ]),
  tags: ['shift-differential', 'licensure', 'overtime'],
  notes: 'Hospital RNs commonly earn night/weekend differentials and overtime not captured in base bands.',
});

const NP_OEWS = oews('29-1171', band(101340, 117990, 132300, 156700, 174420), true, 'O*NET national row; BLS OOH median; hyring p25/p75/p90', ONET('29-1171', '?st=MD'));
add({
  code: 'nurse_practitioner',
  soc: '29-1171',
  title: 'Nurse Practitioner',
  industry: 'Healthcare',
  education: 'master',
  oews: NP_OEWS,
  employment: emp(323040, 'OEWS May 2025 national employment, via hyring (single secondary source)', false),
  growth: growth(0.4, 'BLS OOH field-of-degree table (2024-34): +40% (fastest-growing detailed occupation)', true, { url: EP_FOD_HEALTH }),
  layoffRisk: 'low',
  bonusTypical: bonus(0.03, 'productivity/quality bonuses in outpatient settings'),
  levels: ladderFromBand(NP_OEWS, [
    { title: 'Nurse Practitioner (new graduate)', years: 3, center: 0.2 },
    { title: 'Nurse Practitioner', years: 5, center: 0.42 },
    { title: 'Senior NP', years: 8, center: 0.62 },
    { title: 'Lead Advanced Practice Provider', years: 99, center: 0.8 },
  ]),
  tags: ['licensure', 'shift-differential'],
});

const PT_OEWS = oews('29-1123', band(77140, 86160, 102760, 121160, 135140), true, 'BLS OOH p10/p50/p90; O*NET national row', ONET('29-1123'));
add({
  code: 'physical_therapist',
  soc: '29-1123',
  title: 'Physical Therapist',
  industry: 'Healthcare',
  education: 'doctoral',
  oews: PT_OEWS,
  employment: emp(240000, 'ESTIMATE from the May 2024 OEWS figure as recalled (~240,000); May 2025 figure not found', false, { note: 'Estimate; confirm on bls.gov/oes.' }),
  growth: growth(0.11, 'BLS OOH field-of-degree table (2024-34): +11%', true, { url: EP_FOD_HEALTH }),
  layoffRisk: 'low',
  bonusTypical: bonus(0.02, 'small productivity bonuses'),
  levels: ladderFromBand(PT_OEWS, [
    { title: 'Staff Physical Therapist', years: 3, center: 0.2 },
    { title: 'Senior Physical Therapist', years: 5, center: 0.42 },
    { title: 'Clinical Specialist', years: 7, center: 0.62 },
    { title: 'Clinic Director', years: 99, center: 0.8 },
  ]),
  tags: ['licensure'],
  notes: 'Entry requires a DPT (3-year doctoral program); grad-school what-if applies.',
});

const PHARM_OEWS = oews('29-1051', band(99290, 129380, 140910, 161840, 174230), true, 'BLS OOH p10/p50/p90; O*NET national row; wagedex/resumevera', ONET('29-1051'));
add({
  code: 'pharmacist',
  soc: '29-1051',
  title: 'Pharmacist',
  industry: 'Healthcare',
  education: 'doctoral',
  oews: PHARM_OEWS,
  employment: emp(330000, 'ESTIMATE from the May 2024 OEWS figure as recalled (~330,000); May 2025 figure not found', false, { note: 'Estimate; confirm on bls.gov/oes.' }),
  growth: growth(0.05, 'BLS OOH field-of-degree table (2024-34): +5%', true, { url: EP_FOD_HEALTH }),
  layoffRisk: 'low',
  bonusTypical: bonus(0.03, 'retail/hospital pharmacy bonus targets'),
  levels: ladderFromBand(PHARM_OEWS, [
    { title: 'Staff Pharmacist', years: 3, center: 0.2 },
    { title: 'Pharmacist', years: 5, center: 0.42 },
    { title: 'Clinical Pharmacist / Lead', years: 7, center: 0.62 },
    { title: 'Pharmacy Manager', years: 99, center: 0.8, bonusPct: 0.05 },
  ]),
  tags: ['licensure'],
  notes: 'Entry requires a PharmD; the narrow p25-p90 spread reflects a compressed pay scale.',
});

const MHSM_OEWS = oews('11-9111', band(73390, 94700, 123860, 166100, 224340), true, 'BLS OOH median; O*NET national row; wagedex p10/p90; resumevera p25/p75', ONET('11-9111'));
add({
  code: 'medical_health_services_manager',
  soc: '11-9111',
  title: 'Medical & Health Services Manager',
  industry: 'Healthcare',
  education: 'bachelor',
  oews: MHSM_OEWS,
  employment: emp(560000, 'ESTIMATE from the May 2024 OEWS figure as recalled (~560,000); May 2025 figure not found', false, { note: 'Estimate; confirm on bls.gov/oes.' }),
  growth: growth(0.23, 'ESTIMATE: BLS OOH 2024-34 figure as recalled (~23%); not found in this build', false, { url: 'https://wagedex.com/outlook/medical-and-health-services-managers', note: 'Estimate; confirm on bls.gov/ooh.' }),
  layoffRisk: 'low',
  bonusTypical: bonus(0.08, 'management incentive plans'),
  levels: ladderFromBand(MHSM_OEWS, [
    { title: 'Healthcare Coordinator', years: 2, center: 0.2, bonusPct: 0.03 },
    { title: 'Practice / Department Manager', years: 4, center: 0.4, bonusPct: 0.05 },
    { title: 'Senior Manager', years: 6, center: 0.62, bonusPct: 0.08 },
    { title: 'Director of Operations', years: 99, center: 0.8, bonusPct: 0.12 },
  ]),
  tags: [],
});

const PA_OEWS = oews('29-1071', band(99380, 120670, 135880, 163980, 190280), true, 'O*NET national row (2025 data); wagedex median/p90', ONET('29-1071', '?st=TX'));
add({
  code: 'physician_assistant',
  soc: '29-1071',
  title: 'Physician Assistant',
  industry: 'Healthcare',
  education: 'master',
  oews: PA_OEWS,
  employment: emp(162150, 'OEWS May 2025 national employment, via wagedex (single secondary source)', false),
  growth: growth(0.204, 'BLS Employment Projections 2024-34 via wagedex (+20.4%); BLS names PAs among the fastest-growing occupations', false, { url: 'https://wagedex.com/jobs/physician-assistants', note: 'Secondary source only; confirm on bls.gov/ooh.' }),
  layoffRisk: 'low',
  bonusTypical: bonus(0.04, 'productivity bonuses'),
  levels: ladderFromBand(PA_OEWS, [
    { title: 'Physician Assistant (new graduate)', years: 3, center: 0.2 },
    { title: 'Physician Assistant', years: 5, center: 0.42 },
    { title: 'Senior PA', years: 8, center: 0.62 },
    { title: 'Lead Advanced Practice Provider', years: 99, center: 0.8 },
  ]),
  tags: ['licensure', 'shift-differential'],
});

const DH_OEWS = oews('29-1292', band(74880, 83570, 98100, 108480, 126050), true, 'O*NET national row (2025 data); hyring; cs-recruiters', ONET('29-1292', '?st=FL'));
add({
  code: 'dental_hygienist',
  soc: '29-1292',
  title: 'Dental Hygienist',
  industry: 'Healthcare',
  education: 'associate',
  oews: DH_OEWS,
  employment: emp(222740, 'OEWS May 2025 national employment, via gotu.com and hyring (two secondary sources agree)', true, { url: 'https://hyring.com/jobseeker-toolkit/salary/dental-hygienist-salary-in-usa' }),
  growth: growth(0.07, 'BLS projection ~7% (period reported inconsistently as 2023-33 / 2024-34 by secondary sources)', false, { url: 'https://wagedex.com/jobs/dental-hygienists', note: 'Confirm the 2024-34 figure on bls.gov/ooh.' }),
  layoffRisk: 'low',
  bonusTypical: bonus(0.02, 'small production bonuses'),
  levels: ladderFromBand(DH_OEWS, [
    { title: 'Dental Hygienist', years: 3, center: 0.2 },
    { title: 'Dental Hygienist (experienced)', years: 5, center: 0.42 },
    { title: 'Senior Hygienist', years: 8, center: 0.62 },
    { title: 'Lead Hygienist', years: 99, center: 0.8 },
  ]),
  tags: ['licensure'],
  notes: 'Many hygienists work part-time or hourly; annual figures assume full-time.',
});

// ---------------------------------------------------------------------------------------------
// Business & finance
// ---------------------------------------------------------------------------------------------

const ACCT_OEWS = oews('13-2011', band(56020, 67020, 83680, 109810, 144090), true, 'O*NET national row (BLS 2025 data); hyring; wagedex', ONET('13-2011', '?st=MN'));
add({
  code: 'accountant',
  soc: '13-2011',
  title: 'Accountant / Auditor',
  industry: 'Business & Finance',
  education: 'bachelor',
  oews: ACCT_OEWS,
  employment: emp(1449500, 'OEWS May 2025 national employment, via hyring (single secondary source)', false),
  growth: growth(0.05, 'BLS OOH Accountants and Auditors (2024-34 edition): +5%, +72,800 jobs', true, { url: 'https://www.bls.gov/ooh/business-and-financial/' }),
  layoffRisk: 'low',
  bonusTypical: bonus(0.05, 'public accounting and corporate bonus targets'),
  levels: ladderFromBand(ACCT_OEWS, [
    { title: 'Staff Accountant', years: 2, center: 0.2, bonusPct: 0.03 },
    { title: 'Senior Accountant', years: 3, center: 0.4, bonusPct: 0.05 },
    { title: 'Accounting Manager', years: 5, center: 0.62, bonusPct: 0.08 },
    { title: 'Senior Manager / Controller', years: 99, center: 0.8, bonusPct: 0.12 },
  ]),
  tags: ['licensure'],
  notes: 'CPA licensure typically lifts pay and promotion speed; not modelled separately.',
});

const FA_OEWS = oews('13-2051', band(63720, 79290, 102740, 133340, 180860), true, 'O*NET national row; wagedex; hyring', ONET('13-2051'));
add({
  code: 'financial_analyst',
  soc: '13-2051',
  title: 'Financial Analyst',
  industry: 'Business & Finance',
  education: 'bachelor',
  oews: FA_OEWS,
  employment: emp(361980, 'OEWS May 2025 national employment, via wagedex (single secondary source)', false),
  growth: growth(0.06, 'BLS OOH Financial Analysts (2024-34 edition): +6%, +25,100 jobs', true, { url: 'https://www.bls.gov/ooh/business-and-financial/financial-analysts.htm' }),
  layoffRisk: 'medium',
  bonusTypical: bonus(0.15, 'corporate FP&A targets 10%; banking/asset management bonuses far higher'),
  levels: ladderFromBand(FA_OEWS, [
    { title: 'Financial Analyst', years: 2, center: 0.2, bonusPct: 0.08 },
    { title: 'Senior Financial Analyst', years: 3, center: 0.4, bonusPct: 0.1 },
    { title: 'Associate / Finance Manager', years: 5, center: 0.62, bonusPct: 0.15 },
    { title: 'VP / Director of Finance', years: 99, center: 0.8, bonusPct: 0.25 },
  ]),
  tags: [],
});

const PFA_OEWS = oews('13-2052', band(50190, 72440, 105070, 176790, 357020), true, 'BLS OOH p10/p50/p90; O*NET national row p25/p75', ONET('13-2052'));
add({
  code: 'personal_financial_advisor',
  soc: '13-2052',
  title: 'Personal Financial Advisor',
  industry: 'Business & Finance',
  education: 'bachelor',
  oews: PFA_OEWS,
  employment: emp(270000, 'ESTIMATE from the May 2024 OEWS figure as recalled (~270,000); May 2025 figure not found', false, { note: 'Estimate; confirm on bls.gov/oes.' }),
  growth: growth(0.1, 'BLS OOH Personal Financial Advisors (2024-34 edition): +10%, +31,200 jobs', true, { url: 'https://www.bls.gov/ooh/business-and-financial/personal-financial-advisors.htm' }),
  layoffRisk: 'medium',
  bonusTypical: bonus(0.2, 'much of advisor pay is variable (commission/AUM-based); the p90 reflects this'),
  levels: ladderFromBand(PFA_OEWS, [
    { title: 'Associate Advisor / Paraplanner', years: 3, center: 0.18, bonusPct: 0.05 },
    { title: 'Financial Advisor', years: 5, center: 0.4, bonusPct: 0.15 },
    { title: 'Senior Advisor', years: 7, center: 0.6, bonusPct: 0.2 },
    { title: 'Lead Advisor / Partner', years: 99, center: 0.78, bonusPct: 0.25 },
  ]),
  tags: ['commission', 'licensure'],
});

const MA_OEWS = oews('13-1111', band(60640, 77950, 101860, 133370, 171640), true, 'O*NET national row; resumevera; wagedex (median/p90)', ONET('13-1111'));
add({
  code: 'management_analyst',
  soc: '13-1111',
  title: 'Management Analyst / Consultant',
  industry: 'Business & Finance',
  education: 'bachelor',
  oews: MA_OEWS,
  employment: emp(860000, 'ESTIMATE from the May 2024 OEWS figure as recalled (~860,000); May 2025 figure not found', false, { note: 'Estimate; confirm on bls.gov/oes.' }),
  growth: growth(0.1, 'BLS OOH Management Analysts: +10% projected 2025-35 (2024-34 figure not found; 2023-33 was +11%)', false, { url: 'https://www.bls.gov/ooh/business-and-financial/management-analysts.htm', note: 'Period mismatch: 2025-35 used as proxy.' }),
  layoffRisk: 'medium',
  bonusTypical: bonus(0.12, 'consulting performance bonuses'),
  levels: ladderFromBand(MA_OEWS, [
    { title: 'Analyst', years: 2, center: 0.2, bonusPct: 0.08 },
    { title: 'Consultant', years: 3, center: 0.4, bonusPct: 0.1 },
    { title: 'Senior Consultant / Manager', years: 4, center: 0.62, bonusPct: 0.15 },
    { title: 'Principal / Partner', years: 99, center: 0.82, bonusPct: 0.25 },
  ]),
  tags: [],
  notes: 'Post-MBA consulting entry is typically level 1 (Consultant); used by the grad-school what-if.',
});

const MRA_OEWS = oews('13-1161', band(43390, 58350, 78760, 108310, 155480), true, 'O*NET national row; wagedex', ONET('13-1161'));
add({
  code: 'market_research_analyst',
  soc: '13-1161',
  title: 'Market Research Analyst / Marketing Specialist',
  industry: 'Business & Finance',
  education: 'bachelor',
  oews: MRA_OEWS,
  employment: emp(899580, 'OEWS May 2025 national employment, via a single aggregator', false),
  growth: growth(0.08, 'ESTIMATE: BLS OOH 2024-34 figure as recalled (~8%); not found in this build', false, { note: 'Estimate; confirm on bls.gov/ooh.' }),
  layoffRisk: 'medium',
  bonusTypical: bonus(0.05, 'marketing bonus targets'),
  levels: ladderFromBand(MRA_OEWS, [
    { title: 'Marketing Analyst', years: 2, center: 0.2, bonusPct: 0.03 },
    { title: 'Marketing Specialist', years: 3, center: 0.4, bonusPct: 0.05 },
    { title: 'Senior Marketing Manager', years: 5, center: 0.62, bonusPct: 0.08 },
    { title: 'Director of Marketing', years: 99, center: 0.8, bonusPct: 0.12 },
  ]),
  tags: [],
});

const HR_OEWS = oews('13-1071', band(47180, 58610, 75940, 99380, 128720), true, 'O*NET national row (2025 data); hyring median/p75/p90', ONET('13-1071', '?st=TX'));
add({
  code: 'hr_specialist',
  soc: '13-1071',
  title: 'Human Resources Specialist',
  industry: 'Business & Finance',
  education: 'bachelor',
  oews: HR_OEWS,
  employment: emp(939700, 'BLS OOH: "held about 939,700 jobs in 2025" (Employment Projections base, not OEWS)', true, { url: 'https://www.bls.gov/ooh/business-and-financial/human-resources-specialists.htm', note: 'OOH/EP employment, which differs slightly from OEWS counts.' }),
  growth: growth(0.06, 'BLS OOH Human Resources Specialists (2024-34): +6%, +58,400 jobs', true, { url: 'https://www.bls.gov/ooh/business-and-financial/human-resources-specialists.htm' }),
  layoffRisk: 'medium',
  bonusTypical: bonus(0.05, 'corporate bonus targets'),
  levels: ladderFromBand(HR_OEWS, [
    { title: 'HR Coordinator', years: 2, center: 0.2, bonusPct: 0.03 },
    { title: 'HR Generalist', years: 3, center: 0.4, bonusPct: 0.05 },
    { title: 'Senior HR Specialist / HRBP', years: 5, center: 0.62, bonusPct: 0.07 },
    { title: 'HR Manager', years: 99, center: 0.8, bonusPct: 0.1 },
  ]),
  tags: [],
});

const SALES_OEWS = oews('41-4012', band(39090, 50470, 72080, 99640, 137550), true, 'O*NET national row (BLS 2025 data); wagedex', ONET('41-4012'));
add({
  code: 'sales_representative',
  soc: '41-4012',
  title: 'Sales Representative (wholesale & manufacturing)',
  industry: 'Sales',
  education: 'bachelor',
  oews: SALES_OEWS,
  employment: emp(1200000, 'ESTIMATE from the May 2024 OEWS figure as recalled (~1.2 million); May 2025 figure not found', false, { note: 'Estimate; confirm on bls.gov/oes.' }),
  growth: growth(0.01, 'ESTIMATE: BLS OOH 2024-34 figure as recalled (roughly flat, ~1%); not found in this build', false, { note: 'Estimate; confirm on bls.gov/ooh.' }),
  layoffRisk: 'high',
  bonusTypical: bonus(0.25, 'commission-heavy pay; OEWS wages include commissions but not equity'),
  levels: ladderFromBand(SALES_OEWS, [
    { title: 'Sales Associate / SDR', years: 2, center: 0.2, bonusPct: 0.15 },
    { title: 'Account Executive', years: 3, center: 0.42, bonusPct: 0.25 },
    { title: 'Senior Account Executive', years: 5, center: 0.62, bonusPct: 0.3 },
    { title: 'Sales Manager', years: 99, center: 0.8, bonusPct: 0.3 },
  ]),
  tags: ['commission'],
  notes: 'SOC 41-4012 (except technical/scientific products). Technical sales (41-4011) pays more.',
});

const LOG_OEWS = oews('13-1081', band(50890, 64440, 82320, 106190, 133160), true, 'tradecareerpath and a second aggregator (identical tables); BLS OOH May 2024 median $80,880 for context', 'https://tradecareerpath.com/trades/logistician/salary/');
add({
  code: 'logistician',
  soc: '13-1081',
  title: 'Logistician / Supply Chain Analyst',
  industry: 'Operations',
  education: 'bachelor',
  oews: LOG_OEWS,
  employment: emp(241000, 'BLS Employment Projections 2024 base-year employment (241,000), via secondary sources', false, { note: 'EP base-year employment, not the OEWS count.' }),
  growth: growth(0.167, 'BLS Employment Projections via secondary sources: +16.7% (period reported as 2024-34 by one and 2023-33 by another; OOH 2023-33 was +19%)', false, { url: 'https://wagedex.com/jobs/logisticians', note: 'Confirm on bls.gov/ooh.' }),
  layoffRisk: 'medium',
  bonusTypical: bonus(0.05, 'operations bonus targets'),
  levels: ladderFromBand(LOG_OEWS, [
    { title: 'Logistics Coordinator', years: 2, center: 0.2, bonusPct: 0.03 },
    { title: 'Logistician', years: 3, center: 0.4, bonusPct: 0.05 },
    { title: 'Senior Supply Chain Analyst', years: 5, center: 0.62, bonusPct: 0.07 },
    { title: 'Logistics Manager', years: 99, center: 0.8, bonusPct: 0.1 },
  ]),
  tags: [],
});

// ---------------------------------------------------------------------------------------------
// Education & public service
// ---------------------------------------------------------------------------------------------

const ELEM_OEWS = oews('25-2021', band(47960, 57710, 63970, 81450, 104340), true, 'O*NET national row (BLS 2025 data); resumevera', ONET('25-2021'));
add({
  code: 'elementary_teacher',
  soc: '25-2021',
  title: 'Elementary School Teacher',
  industry: 'Education',
  education: 'bachelor',
  oews: ELEM_OEWS,
  employment: emp(1388390, 'OEWS May 2025 national employment, via resumevera/wagedex', false, { note: 'Aggregator figure; confirm on bls.gov/oes.' }),
  growth: growth(-0.02, 'Secondary source reports about -2% (projection period labelled inconsistently); BLS 2024-34 projects ~91,000 openings/yr from replacement needs', false, { note: 'Confirm the 2024-34 figure on bls.gov/ooh.' }),
  layoffRisk: 'low',
  bonusTypical: bonus(0, 'salary-schedule pay; stipends for extra duties are small'),
  levels: ladderFromBand(ELEM_OEWS, [
    { title: 'Teacher, Steps 1-3', years: 3, center: 0.15, spread: 0.08 },
    { title: 'Teacher, Steps 4-10', years: 7, center: 0.4, spread: 0.1 },
    { title: 'Teacher, Step 11+', years: 10, center: 0.62, spread: 0.1 },
    { title: 'Department lead / Instructional coach', years: 99, center: 0.78, spread: 0.1 },
  ]),
  tags: ['pension', 'union'],
  notes: 'Public-school teachers typically have a defined-benefit pension; in some states (e.g. TX) they are outside Social Security.',
});

const SEC_OEWS = oews('25-2031', band(48780, 59980, 72040, 92570, 107600), false, 'O*NET (South Dakota page national row labelled 2025 data; O*NET details page lists the 2025 median $72,040)', ONET('25-2031', '?st=SD'), 'Single source (O*NET) and a large jump vs the prior-year national row ($64,580 median); confirm on bls.gov/oes before relying on it.');
add({
  code: 'secondary_teacher',
  soc: '25-2031',
  title: 'Secondary School Teacher',
  industry: 'Education',
  education: 'bachelor',
  oews: SEC_OEWS,
  employment: emp(1045170, 'BLS OEWS national table (cached page, likely May 2023/2024)', false, { note: 'May 2025 figure not found.' }),
  growth: growth(-0.02, 'ESTIMATE: assumed similar to elementary teachers (~-2%); 2024-34 figure not found', false, { note: 'Estimate; confirm on bls.gov/ooh.' }),
  layoffRisk: 'low',
  bonusTypical: bonus(0, 'salary-schedule pay; coaching/club stipends are small'),
  levels: ladderFromBand(SEC_OEWS, [
    { title: 'Teacher, Steps 1-3', years: 3, center: 0.15, spread: 0.08 },
    { title: 'Teacher, Steps 4-10', years: 7, center: 0.4, spread: 0.1 },
    { title: 'Teacher, Step 11+', years: 10, center: 0.62, spread: 0.1 },
    { title: 'Department lead', years: 99, center: 0.78, spread: 0.1 },
  ]),
  tags: ['pension', 'union'],
  notes: 'Public-school teachers typically have a defined-benefit pension; in some states (e.g. TX) they are outside Social Security.',
});

const SW_OEWS = oews('21-1021', band(42280, 48270, 59550, 76070, 95530), true, 'O*NET national row (BLS 2025 data); wagedex', ONET('21-1021'));
add({
  code: 'social_worker',
  soc: '21-1021',
  title: 'Social Worker (child, family & school)',
  industry: 'Public service',
  education: 'bachelor',
  oews: SW_OEWS,
  employment: emp(340000, 'ESTIMATE from the May 2024 OEWS figure as recalled (~340,000); May 2025 figure not found', false, { note: 'Estimate; confirm on bls.gov/oes.' }),
  growth: growth(0.05, 'ESTIMATE: BLS projects community & social service occupations +6.6% (2024-34); the detailed 21-1021 figure was not found', false, { url: 'https://www.bls.gov/opub/mlr/2026/article/industry-and-occupational-employment-projections-overview.htm', note: 'Estimate from the occupational-group figure.' }),
  layoffRisk: 'low',
  bonusTypical: bonus(0, 'public/non-profit pay scales'),
  levels: ladderFromBand(SW_OEWS, [
    { title: 'Case Worker', years: 3, center: 0.18 },
    { title: 'Social Worker (LCSW track)', years: 4, center: 0.4 },
    { title: 'Senior Social Worker', years: 6, center: 0.62 },
    { title: 'Program Supervisor', years: 99, center: 0.8 },
  ]),
  tags: ['pension', 'licensure'],
  notes: 'Clinical licensure (LCSW) usually requires an MSW; public employers often provide a pension.',
});

const POL_OEWS = oews('33-3051', band(47510, 59290, 76210, 97600, 115120), true, 'O*NET national row (newer set, matches O*NET 2025 median); wagedex median/p90', ONET('33-3051', '?st=AZ'));
add({
  code: 'police_officer',
  soc: '33-3051',
  title: 'Police / Sheriff\'s Patrol Officer',
  industry: 'Public service',
  education: 'associate',
  oews: POL_OEWS,
  employment: emp(660000, 'ESTIMATE from the May 2024 OEWS figure as recalled (~660,000); May 2025 figure not found', false, { note: 'Estimate; confirm on bls.gov/oes.' }),
  growth: growth(0.03, 'ESTIMATE: BLS OOH 2024-34 figure as recalled (~3%, about average); not found in this build', false, { note: 'Estimate; confirm on bls.gov/ooh.' }),
  layoffRisk: 'low',
  bonusTypical: bonus(0, 'overtime, not bonus, drives variable pay'),
  levels: ladderFromBand(POL_OEWS, [
    { title: 'Recruit / Officer', years: 3, center: 0.18 },
    { title: 'Police Officer', years: 5, center: 0.42 },
    { title: 'Senior Officer / Detective', years: 8, center: 0.62 },
    { title: 'Sergeant', years: 99, center: 0.8 },
  ]),
  tags: ['pension', 'overtime', 'union'],
  notes: 'Many departments are outside Social Security and have 20-25 year pensions (see playbook: public pensions).',
});

// ---------------------------------------------------------------------------------------------
// Engineering & architecture
// ---------------------------------------------------------------------------------------------

const CIV_OEWS = oews('17-2051', band(68240, 79930, 100840, 129680, 163220), true, 'O*NET national row; tradecareerpath; wagedex/hyring (median)', ONET('17-2051'));
add({
  code: 'civil_engineer',
  soc: '17-2051',
  title: 'Civil Engineer',
  industry: 'Engineering',
  education: 'bachelor',
  oews: CIV_OEWS,
  employment: emp(367840, 'OEWS May 2025 national employment, via a single aggregator dataset', false),
  growth: growth(0.05, 'BLS Employment Projections 2024-34 (TED, engineering, 2026): +5.0%, +18,500 jobs', true, { url: EP_TED_ENG }),
  layoffRisk: 'low',
  bonusTypical: bonus(0.05, 'consulting-firm profit sharing'),
  levels: ladderFromBand(CIV_OEWS, [
    { title: 'Engineer in Training (EIT)', years: 4, center: 0.18, bonusPct: 0.03 },
    { title: 'Professional Engineer (PE)', years: 4, center: 0.42, bonusPct: 0.05 },
    { title: 'Senior / Project Engineer', years: 6, center: 0.62, bonusPct: 0.07 },
    { title: 'Principal Engineer', years: 99, center: 0.8, bonusPct: 0.1 },
  ]),
  tags: ['licensure'],
});

const MECH_OEWS = oews('17-2141', band(73990, 84130, 104110, 132590, 164340), true, 'tradecareerpath; O*NET (17-2141.xx pages) p10/p90; hyring', 'https://tradecareerpath.com/trades/mechanical-engineer/salary/');
add({
  code: 'mechanical_engineer',
  soc: '17-2141',
  title: 'Mechanical Engineer',
  industry: 'Engineering',
  education: 'bachelor',
  oews: MECH_OEWS,
  employment: emp(293100, 'BLS Employment Projections 2024 base-year employment (293,100), via secondary source', false, { note: 'EP base-year employment, not the OEWS count.' }),
  growth: growth(0.091, 'BLS Employment Projections 2024-34 (TED, engineering, 2026): +9.1%, +26,500 jobs', true, { url: EP_TED_ENG }),
  layoffRisk: 'medium',
  bonusTypical: bonus(0.05, 'manufacturing bonus targets'),
  levels: ladderFromBand(MECH_OEWS, [
    { title: 'Mechanical Engineer I', years: 2, center: 0.2, bonusPct: 0.03 },
    { title: 'Mechanical Engineer II', years: 3, center: 0.4, bonusPct: 0.05 },
    { title: 'Senior Mechanical Engineer', years: 5, center: 0.62, bonusPct: 0.07 },
    { title: 'Principal Engineer / Engineering Manager', years: 99, center: 0.8, bonusPct: 0.1 },
  ]),
  tags: [],
});

const EE_OEWS = oews('17-2071', band(76550, 92830, 120630, 152950, 184300), true, 'tradecareerpath; resumevera (p25/p75 confirmed)', 'https://tradecareerpath.com/trades/electrical-engineer/salary/');
add({
  code: 'electrical_engineer',
  soc: '17-2071',
  title: 'Electrical Engineer',
  industry: 'Engineering',
  education: 'bachelor',
  oews: EE_OEWS,
  employment: emp(190000, 'ESTIMATE from the May 2024 OEWS figure as recalled (~190,000); May 2025 figure not found', false, { note: 'Estimate; confirm on bls.gov/oes.' }),
  growth: growth(0.069, 'BLS Employment Projections 2024-34 (TED, engineering, 2026): electrical and electronics engineers +6.9%, +19,700 jobs', true, { url: EP_TED_ENG, note: 'Combined electrical + electronics figure; a secondary source reports +7.2% for 17-2071 alone.' }),
  layoffRisk: 'medium',
  bonusTypical: bonus(0.06, 'semiconductor/utility bonus targets'),
  levels: ladderFromBand(EE_OEWS, [
    { title: 'Electrical Engineer I', years: 2, center: 0.2, bonusPct: 0.03 },
    { title: 'Electrical Engineer II', years: 3, center: 0.4, bonusPct: 0.05 },
    { title: 'Senior Electrical Engineer', years: 5, center: 0.62, bonusPct: 0.08 },
    { title: 'Principal Engineer / Engineering Manager', years: 99, center: 0.8, bonusPct: 0.1 },
  ]),
  tags: ['equity'],
});

const IE_OEWS = oews('17-2112', band(74370, 83600, 102440, 129250, 159860), true, 'tradecareerpath; wagedex (identical tables)', 'https://tradecareerpath.com/trades/industrial-engineer/salary/');
add({
  code: 'industrial_engineer',
  soc: '17-2112',
  title: 'Industrial Engineer',
  industry: 'Engineering',
  education: 'bachelor',
  oews: IE_OEWS,
  employment: emp(340000, 'ESTIMATE from the May 2024 OEWS figure as recalled (~340,000); May 2025 figure not found', false, { note: 'Estimate; confirm on bls.gov/oes.' }),
  growth: growth(0.11, 'BLS Employment Projections 2024-34 (TED, engineering, 2026): +11.0%, +38,500 jobs', true, { url: EP_TED_ENG }),
  layoffRisk: 'medium',
  bonusTypical: bonus(0.05, 'manufacturing/logistics bonus targets'),
  levels: ladderFromBand(IE_OEWS, [
    { title: 'Industrial Engineer I', years: 2, center: 0.2, bonusPct: 0.03 },
    { title: 'Industrial Engineer II', years: 3, center: 0.4, bonusPct: 0.05 },
    { title: 'Senior Industrial Engineer', years: 5, center: 0.62, bonusPct: 0.07 },
    { title: 'Engineering Manager / Plant Manager', years: 99, center: 0.8, bonusPct: 0.1 },
  ]),
  tags: [],
});

const ARCH_OEWS = oews('17-1011', band(62300, 77960, 99280, 126550, 161420), true, 'O*NET national row (BLS 2025 data); wagedex', ONET('17-1011'));
add({
  code: 'architect',
  soc: '17-1011',
  title: 'Architect',
  industry: 'Engineering',
  education: 'master',
  oews: ARCH_OEWS,
  employment: emp(115000, 'ESTIMATE from the May 2024 OEWS figure as recalled (~115,000); May 2025 figure not found', false, { note: 'Estimate; confirm on bls.gov/oes.' }),
  growth: growth(0.05, 'ESTIMATE: BLS OOH 2024-34 figure as recalled (~5%); not found in this build', false, { note: 'Estimate; confirm on bls.gov/ooh.' }),
  layoffRisk: 'high',
  bonusTypical: bonus(0.03, 'small firm bonuses; highly cyclical'),
  levels: ladderFromBand(ARCH_OEWS, [
    { title: 'Architectural Designer (pre-licensure)', years: 3, center: 0.18 },
    { title: 'Architect (licensed)', years: 4, center: 0.4 },
    { title: 'Project Architect', years: 6, center: 0.62, bonusPct: 0.05 },
    { title: 'Principal', years: 99, center: 0.8, bonusPct: 0.1 },
  ]),
  tags: ['licensure'],
  notes: 'Licensure requires a NAAB degree (often M.Arch), AXP hours and the ARE; construction-cycle sensitive.',
});

const CM_OEWS = oews('11-9021', band(69690, 88550, 114990, 151640, 189440), true, 'O*NET national row (2025 data); wagedex median/p10/p90', ONET('11-9021', '?st=MN'));
add({
  code: 'construction_manager',
  soc: '11-9021',
  title: 'Construction Manager',
  industry: 'Construction',
  education: 'bachelor',
  oews: CM_OEWS,
  employment: emp(380360, 'OEWS May 2025 national employment, via a single aggregator', false),
  growth: growth(0.087, 'BLS Employment Projections 2024-34 via wagedex (+8.7%)', false, { url: 'https://wagedex.com/jobs/construction-managers', note: 'Secondary source only; confirm on bls.gov/ooh.' }),
  layoffRisk: 'medium',
  bonusTypical: bonus(0.08, 'project completion bonuses'),
  levels: ladderFromBand(CM_OEWS, [
    { title: 'Project Engineer', years: 3, center: 0.18, bonusPct: 0.05 },
    { title: 'Assistant Project Manager', years: 3, center: 0.4, bonusPct: 0.07 },
    { title: 'Project Manager', years: 6, center: 0.62, bonusPct: 0.1 },
    { title: 'Senior PM / Director of Construction', years: 99, center: 0.8, bonusPct: 0.12 },
  ]),
  tags: [],
});

// ---------------------------------------------------------------------------------------------
// Legal
// ---------------------------------------------------------------------------------------------

const LAW_OEWS = oews('23-1011', band(78360, 102990, 159670, 221370, 351600), true, 'O*NET national row (BLS 2025 data); wagedex median/p75/p90', ONET('23-1011', '?st=WA'));
add({
  code: 'lawyer',
  soc: '23-1011',
  title: 'Lawyer',
  industry: 'Legal',
  education: 'professional',
  oews: LAW_OEWS,
  employment: emp(750000, 'ESTIMATE from the May 2024 OEWS figure as recalled (~750,000); May 2025 figure not found', false, { note: 'Estimate; confirm on bls.gov/oes.' }),
  growth: growth(0.04, 'BLS OOH Lawyers (2024-34 edition): +4%, about 31,500 openings/yr', true, { url: 'https://www.bls.gov/ooh/legal/lawyers.htm' }),
  layoffRisk: 'medium',
  bonusTypical: bonus(0.1, 'large-firm associate bonuses; public-interest and small-firm bonuses are small'),
  levels: ladderFromBand(LAW_OEWS, [
    { title: 'Associate', years: 4, center: 0.22, bonusPct: 0.05 },
    { title: 'Senior Associate', years: 4, center: 0.45, bonusPct: 0.1 },
    { title: 'Counsel', years: 4, center: 0.62, bonusPct: 0.1 },
    { title: 'Partner', years: 99, center: 0.82, bonusPct: 0.2 },
  ]),
  tags: ['licensure'],
  notes: 'Bimodal market: large-firm first-year pay far exceeds the p75. Requires a JD (3 years) and bar admission; the new $50k/yr professional-degree loan cap applies.',
});

const PARA_OEWS = oews('23-2011', band(44740, 50340, 62890, 80080, 101500), true, 'O*NET national row (BLS 2025 data); wagedex p10/p90', ONET('23-2011'));
add({
  code: 'paralegal',
  soc: '23-2011',
  title: 'Paralegal / Legal Assistant',
  industry: 'Legal',
  education: 'associate',
  oews: PARA_OEWS,
  employment: emp(360000, 'ESTIMATE from the May 2024 OEWS figure as recalled (~360,000); May 2025 figure not found', false, { note: 'Estimate; confirm on bls.gov/oes.' }),
  growth: growth(0.01, 'ESTIMATE: BLS OOH 2024-34 figure as recalled (~1%); legal occupations group -1% (BLS)', false, { note: 'Estimate; confirm on bls.gov/ooh.' }),
  layoffRisk: 'medium',
  bonusTypical: bonus(0.03, 'year-end firm bonuses'),
  levels: ladderFromBand(PARA_OEWS, [
    { title: 'Paralegal', years: 3, center: 0.2 },
    { title: 'Senior Paralegal', years: 5, center: 0.42 },
    { title: 'Litigation / Corporate Paralegal', years: 7, center: 0.62 },
    { title: 'Paralegal Manager', years: 99, center: 0.8 },
  ]),
  tags: [],
});

// ---------------------------------------------------------------------------------------------
// Creative & communications
// ---------------------------------------------------------------------------------------------

const GD_OEWS = oews('27-1024', band(39520, 49040, 62960, 81830, 104910), true, 'O*NET national row (2025 data); wagedex median/p90', ONET('27-1024', '?st=TX'));
add({
  code: 'graphic_designer',
  soc: '27-1024',
  title: 'Graphic Designer',
  industry: 'Creative',
  education: 'bachelor',
  oews: GD_OEWS,
  employment: emp(200000, 'ESTIMATE from the May 2024 OEWS figure as recalled (~200,000); May 2025 figure not found', false, { note: 'Estimate; confirm on bls.gov/oes.' }),
  growth: growth(0.021, 'BLS Employment Projections 2024-34 via wagedex (+2.1%, slower than average)', false, { url: 'https://wagedex.com/jobs/graphic-designers', note: 'Secondary source only; confirm on bls.gov/ooh.' }),
  layoffRisk: 'high',
  bonusTypical: bonus(0.02, 'agency bonuses are small'),
  levels: ladderFromBand(GD_OEWS, [
    { title: 'Junior Designer', years: 2, center: 0.2 },
    { title: 'Designer', years: 3, center: 0.4 },
    { title: 'Senior Designer', years: 5, center: 0.62 },
    { title: 'Art Director', years: 99, center: 0.8, bonusPct: 0.05 },
  ]),
  tags: [],
  notes: 'Generative-AI exposure is high; freelance income common.',
});

const PR_OEWS = oews('27-3031', band(44110, 56260, 74750, 100370, 135150), true, 'O*NET national row (BLS 2025 data); wagedex p90; everything-pr median', ONET('27-3031'));
add({
  code: 'pr_specialist',
  soc: '27-3031',
  title: 'Public Relations Specialist',
  industry: 'Communications',
  education: 'bachelor',
  oews: PR_OEWS,
  employment: emp(314500, 'O*NET: employment 314,500 in 2025 (Employment Projections base)', true, { url: ONET('27-3031'), note: 'EP base-year employment, not the OEWS count.' }),
  growth: growth(0.02, 'O*NET/BLS: ~1-2% projected 2025-35 (2024-34 figure not found)', false, { url: ONET('27-3031'), note: 'Period mismatch; confirm on bls.gov/ooh.' }),
  layoffRisk: 'medium',
  bonusTypical: bonus(0.05, 'agency/corporate bonus targets'),
  levels: ladderFromBand(PR_OEWS, [
    { title: 'PR Coordinator', years: 2, center: 0.2, bonusPct: 0.02 },
    { title: 'PR Specialist', years: 3, center: 0.4, bonusPct: 0.04 },
    { title: 'Senior Specialist / Account Manager', years: 5, center: 0.62, bonusPct: 0.06 },
    { title: 'PR Director', years: 99, center: 0.8, bonusPct: 0.1 },
  ]),
  tags: [],
});

// ---------------------------------------------------------------------------------------------
// Skilled trades
// ---------------------------------------------------------------------------------------------

const ELEC_OEWS = oews('47-2111', band(42640, 49430, 63190, 83940, 108510), true, 'O*NET national row (newer set); wagedex p10/median/p90; cs-recruiters p25/p75', ONET('47-2111', '?st='));
add({
  code: 'electrician',
  soc: '47-2111',
  title: 'Electrician',
  industry: 'Skilled trades',
  education: 'trade',
  oews: ELEC_OEWS,
  employment: emp(730000, 'ESTIMATE from the May 2024 OEWS figure as recalled (~730,000); May 2025 figure not found', false, { note: 'Estimate; confirm on bls.gov/oes.' }),
  growth: growth(0.095, 'Secondary source: +9.5% (2024-34); BLS OOH now shows +9% for 2025-35', false, { url: 'https://www.bls.gov/ooh/construction-and-extraction/electricians.htm', note: 'Confirm the 2024-34 figure on bls.gov/ooh (archived edition).' }),
  layoffRisk: 'medium',
  bonusTypical: bonus(0, 'overtime, not bonus, drives variable pay'),
  levels: ladderFromBand(ELEC_OEWS, [
    { title: 'Apprentice Electrician', years: 4, center: 0.15, spread: 0.08 },
    { title: 'Journeyman Electrician', years: 6, center: 0.45 },
    { title: 'Master Electrician', years: 8, center: 0.65 },
    { title: 'Foreman / Contractor', years: 99, center: 0.85, spread: 0.08 },
  ]),
  tags: ['union', 'overtime', 'licensure', 'pension'],
  notes: 'Union (IBEW) apprenticeships pay a rising percentage of journeyman scale over 4-5 years and include pension/annuity funds.',
});

const PLUMB_OEWS = oews('47-2152', band(44150, 50190, 63800, 85110, 108420), true, 'O*NET national row (2025 data); wagedex median', ONET('47-2152', '?st=NY'));
add({
  code: 'plumber',
  soc: '47-2152',
  title: 'Plumber / Pipefitter / Steamfitter',
  industry: 'Skilled trades',
  education: 'trade',
  oews: PLUMB_OEWS,
  employment: emp(470000, 'ESTIMATE from the May 2024 OEWS figure as recalled (~470,000); May 2025 figure not found', false, { note: 'Estimate; confirm on bls.gov/oes.' }),
  growth: growth(0.07, 'BLS OOH: +7% projected 2025-35 (2024-34 figure not found)', false, { url: 'https://www.bls.gov/ooh/construction-and-extraction/plumbers-pipefitters-and-steamfitters.htm', note: 'Period mismatch; confirm on bls.gov/ooh.' }),
  layoffRisk: 'medium',
  bonusTypical: bonus(0, 'overtime, not bonus, drives variable pay'),
  levels: ladderFromBand(PLUMB_OEWS, [
    { title: 'Apprentice Plumber', years: 4, center: 0.15, spread: 0.08 },
    { title: 'Journeyman Plumber', years: 6, center: 0.45 },
    { title: 'Master Plumber', years: 8, center: 0.65 },
    { title: 'Foreman / Contractor', years: 99, center: 0.85, spread: 0.08 },
  ]),
  tags: ['union', 'overtime', 'licensure', 'pension'],
});

const HVAC_OEWS = oews('49-9021', band(40050, 48360, 61010, 77060, 95210), true, 'O*NET national row; hyring; tradecareerpath', ONET('49-9021', '?st=NY'));
add({
  code: 'hvac_mechanic',
  soc: '49-9021',
  title: 'HVAC Mechanic / Installer',
  industry: 'Skilled trades',
  education: 'trade',
  oews: HVAC_OEWS,
  employment: emp(400000, 'ESTIMATE from the May 2024 OEWS figure as recalled (~400,000); May 2025 figure not found', false, { note: 'Estimate; confirm on bls.gov/oes.' }),
  growth: growth(0.11, 'BLS OOH: +11% projected 2025-35 (2024-34 figure not found)', false, { url: 'https://www.bls.gov/ooh/installation-maintenance-and-repair/heating-air-conditioning-and-refrigeration-mechanics-and-installers.htm', note: 'Period mismatch; confirm on bls.gov/ooh.' }),
  layoffRisk: 'low',
  bonusTypical: bonus(0.03, 'service-sales spiffs'),
  levels: ladderFromBand(HVAC_OEWS, [
    { title: 'Apprentice / Installer', years: 3, center: 0.15, spread: 0.08 },
    { title: 'HVAC Technician', years: 5, center: 0.42 },
    { title: 'Senior Technician', years: 7, center: 0.62 },
    { title: 'Service Manager', years: 99, center: 0.82, spread: 0.08 },
  ]),
  tags: ['overtime', 'licensure'],
  notes: 'EPA Section 608 certification required for refrigerants.',
});

// ---------------------------------------------------------------------------------------------
// Transportation
// ---------------------------------------------------------------------------------------------

const PILOT_OEWS = oews('53-2011', band(106710, 182280, 232140, 384440, 463830), true, 'O*NET national row (BLS 2025 data); wagedex p10/median/p90', ONET('53-2011'));
add({
  code: 'airline_pilot',
  soc: '53-2011',
  title: 'Airline Pilot / Copilot',
  industry: 'Transportation',
  education: 'bachelor',
  oews: PILOT_OEWS,
  employment: emp(104600, 'O*NET: employment 104,600 in 2025 (Employment Projections base)', true, { url: ONET('53-2011'), note: 'EP base-year employment, not the OEWS count.' }),
  growth: growth(0.05, 'ESTIMATE: BLS OOH 2024-34 figure as recalled (~5%); not found in this build', false, { url: 'https://wagedex.com/outlook/airline-pilots-copilots-and-flight-engineers', note: 'Estimate; confirm on bls.gov/ooh.' }),
  layoffRisk: 'medium',
  bonusTypical: bonus(0.03, 'profit sharing at major carriers'),
  levels: ladderFromBand(PILOT_OEWS, [
    { title: 'First Officer (regional)', years: 3, center: 0.12, spread: 0.06 },
    { title: 'First Officer (major)', years: 5, center: 0.35, spread: 0.1 },
    { title: 'Captain (narrowbody)', years: 8, center: 0.6, spread: 0.1 },
    { title: 'Captain (widebody)', years: 99, center: 0.85, spread: 0.06 },
  ]),
  tags: ['union', 'pension'],
  notes: 'Kept for continuity with Flight Plan. Pay is seniority-driven; regional first-officer pay sits near p10. Training debt (ATP, 1,500 hours) is substantial.',
});

// ---------------------------------------------------------------------------------------------
// Metros: all-occupations mean wage relative to national (May 2025). BLS regional releases report hourly means;
// BLS annualises by x 2,080, so hourly ratios equal annual ratios. National hourly mean = $33.54.
// ---------------------------------------------------------------------------------------------

function metroIndex(hourly: number, name: string, url: string, note?: string): Sourced<number> {
  return sourced(Math.round((hourly / NATIONAL_MEAN_HOURLY_2025) * 1000) / 1000, `BLS OEWS May 2025: ${name} all-occupations mean hourly wage $${hourly.toFixed(2)} / national $33.54`, WAGES_AS_OF, true, { url, note });
}

function occIdx(metroMedian: number, nationalMedian: number, source: string, verified: boolean, url?: string, note?: string): Sourced<number> {
  return sourced(Math.round((metroMedian / nationalMedian) * 1000) / 1000, `${source}: metro median $${metroMedian.toLocaleString('en-US')} / national $${nationalMedian.toLocaleString('en-US')}`, WAGES_AS_OF, verified, { url, note });
}

export const METROS: Record<string, Metro> = {
  national: { key: 'national', name: 'National average', state: '', index: sourced(1, 'By definition', WAGES_AS_OF, true) },
  denver: {
    key: 'denver',
    name: 'Denver-Aurora-Centennial, CO',
    state: 'CO',
    index: metroIndex(39.28, 'Denver-Aurora-Centennial', 'https://www.bls.gov/regions/mountain-plains/news-release/2026/occupationalemploymentandwages_denver_20260805.htm', 'MSA renamed from Denver-Aurora-Lakewood in the 2025 OEWS delineations.'),
    occupationIndex: {
      software_developer: occIdx(137610, 135980, 'OEWS May 2025 via hyring/wagedex (two aggregators)', true, 'https://hyring.com/jobseeker-toolkit/salary/software-developer-salary-in-denver'),
      registered_nurse: occIdx(101130, 97550, 'OEWS May 2025 via wagedex (single aggregator)', false, 'https://wagedex.com/jobs/registered-nurses/metro/denver-aurora-centennial-co', 'Single secondary source; confirm on bls.gov/oes.'),
    },
  },
  nyc: {
    key: 'nyc',
    name: 'New York-Newark-Jersey City, NY-NJ',
    state: 'NY',
    index: metroIndex(41.5, 'New York-Newark-Jersey City', 'https://www.bls.gov/regions/northeast/news-release/2026/occupationalemploymentandwages_newyork_20260605.htm'),
    occupationIndex: {
      software_developer: occIdx(166830, 135980, 'OEWS May 2025 via hyring/resumevera', false, 'https://hyring.com/jobseeker-toolkit/salary/software-developer-salary-in-new-york', 'Aggregator pages do not state whether the figure is the full MSA; confirm on bls.gov/oes.'),
      registered_nurse: occIdx(119720, 97550, 'OEWS May 2025 via wagedex (single aggregator)', false, 'https://wagedex.com/jobs/registered-nurses/metro/new-york-newark-jersey-city-ny-nj', 'Single secondary source; confirm on bls.gov/oes.'),
    },
  },
  sf: {
    key: 'sf',
    name: 'San Francisco-Oakland-Fremont, CA',
    state: 'CA',
    index: metroIndex(48.19, 'San Francisco-Oakland-Fremont', 'https://www.bls.gov/regions/west/news-release/2026/occupationalemploymentandwages_sanfrancisco_20260709.htm', 'MSA renamed from San Francisco-Oakland-Berkeley in the 2025 OEWS delineations.'),
    occupationIndex: {
      software_developer: occIdx(186640, 135980, 'OEWS May 2025 via hyring/wagedex/resumevera (several aggregators agree)', true, 'https://hyring.com/jobseeker-toolkit/salary/software-developer-salary-in-san-francisco'),
    },
  },
  sanjose: {
    key: 'sanjose',
    name: 'San Jose-Sunnyvale-Santa Clara, CA',
    state: 'CA',
    index: metroIndex(57.32, 'San Jose-Sunnyvale-Santa Clara', 'https://www.bls.gov/regions/west/news-release/2026/occupationalemploymentandwages_sanjose_20260709.htm'),
    occupationIndex: {
      software_developer: occIdx(213110, 135980, 'OEWS May 2025 via several aggregators (statranker, tradecareerpath, resumevera)', true, 'https://statranker.org/economy/highest-paying-u-s-metro-areas-for-software-developers-2026-top-100-by-median-annual-wage/'),
      registered_nurse: occIdx(216740, 97550, 'OEWS May 2025 via wagedex and a second aggregator', true, 'https://wagedex.com/jobs/registered-nurses/metro/san-jose-sunnyvale-santa-clara-ca'),
    },
  },
  seattle: {
    key: 'seattle',
    name: 'Seattle-Tacoma-Bellevue, WA',
    state: 'WA',
    index: metroIndex(44.13, 'Seattle-Tacoma-Bellevue', 'https://www.bls.gov/regions/west/news-release/2026/occupationalemploymentandwages_seattle_20260630.htm'),
    occupationIndex: {
      software_developer: occIdx(167280, 135980, 'OEWS May 2025 via hyring/resumevera/statranker (several aggregators agree)', true, 'https://hyring.com/jobseeker-toolkit/salary/software-developer-salary-in-seattle'),
      registered_nurse: occIdx(128260, 97550, 'OEWS May 2025 via hyring and others (other pages report $120,400)', false, 'https://hyring.com/jobseeker-toolkit/salary/registered-nurse-salary-in-seattle', 'Sources disagree ($128,260 vs $120,400); confirm on bls.gov/oes.'),
    },
  },
  la: {
    key: 'la',
    name: 'Los Angeles-Long Beach-Anaheim, CA',
    state: 'CA',
    index: metroIndex(37.15, 'Los Angeles-Long Beach-Anaheim', 'https://www.bls.gov/regions/west/news-release/occupationalemploymentandwages_losangeles.htm'),
  },
  chicago: {
    key: 'chicago',
    name: 'Chicago-Naperville-Elgin, IL-IN',
    state: 'IL',
    index: metroIndex(35.28, 'Chicago-Naperville-Elgin', 'https://www.bls.gov/regions/midwest/news-release/occupationalemploymentandwages_chicago.htm'),
  },
  dallas: {
    key: 'dallas',
    name: 'Dallas-Fort Worth-Arlington, TX',
    state: 'TX',
    index: metroIndex(33.96, 'Dallas-Fort Worth-Arlington', 'https://www.bls.gov/regions/southwest/news-release/occupationalemploymentandwages_dallasfortworth.htm'),
  },
  houston: {
    key: 'houston',
    name: 'Houston-Pasadena-The Woodlands, TX',
    state: 'TX',
    index: metroIndex(32.51, 'Houston-Pasadena-The Woodlands', 'https://www.bls.gov/regions/southwest/news-release/occupationalemploymentandwages_houston.htm'),
  },
  austin: {
    key: 'austin',
    name: 'Austin-Round Rock-San Marcos, TX',
    state: 'TX',
    index: metroIndex(35.85, 'Austin-Round Rock-San Marcos', 'https://www.bls.gov/regions/southwest/news-release/OccupationalEmploymentandWages_Austin.htm'),
  },
  atlanta: {
    key: 'atlanta',
    name: 'Atlanta-Sandy Springs-Roswell, GA',
    state: 'GA',
    index: metroIndex(34.57, 'Atlanta-Sandy Springs-Roswell', 'https://www.bls.gov/regions/southeast/news-release/occupationalemploymentandwages_atlanta.htm'),
  },
  boston: {
    key: 'boston',
    name: 'Boston-Cambridge-Newton, MA-NH',
    state: 'MA',
    index: metroIndex(43.09, 'Boston-Cambridge-Newton', 'https://www.bls.gov/regions/northeast/news-release/occupationalemploymentandwages_boston.htm'),
  },
  dc: {
    key: 'dc',
    name: 'Washington-Arlington-Alexandria, DC-VA-MD-WV',
    state: 'VA',
    index: metroIndex(44.2, 'Washington-Arlington-Alexandria', 'https://www.bls.gov/regions/mid-atlantic/news-release/occupationalemploymentandwages_washingtondc.htm', 'State tax depends on residence (DC, VA or MD); VA is the default.'),
  },
  phoenix: {
    key: 'phoenix',
    name: 'Phoenix-Mesa-Chandler, AZ',
    state: 'AZ',
    index: metroIndex(33.48, 'Phoenix-Mesa-Chandler', 'https://www.bls.gov/regions/west/news-release/occupationalemploymentandwages_phoenix.htm'),
  },
  minneapolis: {
    key: 'minneapolis',
    name: 'Minneapolis-St. Paul-Bloomington, MN-WI',
    state: 'MN',
    index: metroIndex(35.86, 'Minneapolis-St. Paul-Bloomington', 'https://www.bls.gov/regions/midwest/news-release/occupationalemploymentandwages_minneapolis.htm'),
  },
  slc: {
    key: 'slc',
    name: 'Salt Lake City-Murray, UT',
    state: 'UT',
    index: metroIndex(34.45, 'Salt Lake City-Murray', 'https://www.bls.gov/regions/mountain-plains/news-release/2026/occupationalemploymentandwages_saltlakecity_20260813.htm'),
  },
  nashville: {
    key: 'nashville',
    name: 'Nashville-Davidson-Murfreesboro-Franklin, TN',
    state: 'TN',
    index: metroIndex(31.92, 'Nashville-Davidson--Murfreesboro--Franklin', 'https://www.bls.gov/regions/southeast/news-release/occupationalemploymentandwages_nashville.htm'),
  },
  charlotte: {
    key: 'charlotte',
    name: 'Charlotte-Concord-Gastonia, NC-SC',
    state: 'NC',
    index: metroIndex(33.13, 'Charlotte-Concord-Gastonia', 'https://www.bls.gov/regions/southeast/news-release/occupationalemploymentandwages_charlotte.htm'),
  },
  raleigh: {
    key: 'raleigh',
    name: 'Raleigh-Cary, NC',
    state: 'NC',
    index: metroIndex(34.01, 'Raleigh-Cary', 'https://www.bls.gov/regions/southeast/news-release/2026/occupationalemploymentandwages_raleigh_20260708.htm'),
  },
  miami: {
    key: 'miami',
    name: 'Miami-Fort Lauderdale-West Palm Beach, FL',
    state: 'FL',
    index: metroIndex(32.3, 'Miami-Fort Lauderdale-West Palm Beach', 'https://www.bls.gov/regions/southeast/news-release/occupationalemploymentandwages_miami.htm'),
  },
};

export function listOccupations(): Occupation[] {
  return Object.values(OCCUPATIONS).sort((a, b) => a.title.localeCompare(b.title));
}

export function listMetros(): Metro[] {
  return Object.values(METROS).sort((a, b) => (a.key === 'national' ? -1 : b.key === 'national' ? 1 : a.name.localeCompare(b.name)));
}

/** Metro multiplier for an occupation: occupation-specific ratio when available, else the all-occupations index. */
export function metroMultiplier(metroKey: string, occupationCode: string): Sourced<number> {
  const m = METROS[metroKey] ?? METROS.national;
  return m.occupationIndex?.[occupationCode] ?? m.index;
}

/** Linear interpolation inside a band for a position 0..1 across [p10, p25, p50, p75, p90]. */
export function bandAt(band: SalaryBand, position: number): number {
  const pts = [band.p10, band.p25, band.p50, band.p75, band.p90];
  const knots = [0.1, 0.25, 0.5, 0.75, 0.9];
  const p = Math.min(0.9, Math.max(0.1, position));
  for (let i = 0; i < knots.length - 1; i++) {
    if (p <= knots[i + 1]) {
      const t = (p - knots[i]) / (knots[i + 1] - knots[i]);
      return pts[i] + t * (pts[i + 1] - pts[i]);
    }
  }
  return band.p90;
}

/**
 * Derive a ladder from a national percentile band.
 * Each level gets its own band centred on a percentile position so that track low/mid/high (p25/p50/p75 within the
 * level band) still moves the whole ladder. Flagged verified:false because the level mapping is an assumption.
 */
export function ladderFromBand(
  oews: Sourced<SalaryBand>,
  spec: { title: string; years: number; center: number; spread?: number; bonusPct?: number }[],
): LadderLevel[] {
  return spec.map((lvl) => {
    const spread = lvl.spread ?? 0.12;
    const b: SalaryBand = {
      p10: bandAt(oews.value, lvl.center - spread * 1.5),
      p25: bandAt(oews.value, lvl.center - spread),
      p50: bandAt(oews.value, lvl.center),
      p75: bandAt(oews.value, lvl.center + spread),
      p90: bandAt(oews.value, lvl.center + spread * 1.5),
    };
    return {
      title: lvl.title,
      years: lvl.years,
      bonusPct: lvl.bonusPct ?? 0,
      band: {
        value: b,
        source: `Derived from OEWS percentiles (${oews.source})`,
        url: oews.url,
        asOf: oews.asOf,
        verified: false,
        note: `Level centred at the p${Math.round(lvl.center * 100)} of the national distribution; mapping is an assumption`,
      },
    };
  });
}

/** Standard 4-level ladder spec used for most bachelor's-level occupations. */
export const STANDARD_LADDER = [
  { title: 'Entry', years: 2, center: 0.2 },
  { title: 'Mid-level', years: 3, center: 0.4 },
  { title: 'Senior', years: 5, center: 0.62 },
  { title: 'Lead / Manager', years: 99, center: 0.8 },
];
