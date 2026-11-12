/**
 * Sprout data: hourly wages for common student jobs and state minimum wages.
 *
 * Wages: BLS Occupational Employment and Wage Statistics (OEWS), May 2025 national hourly percentiles. Data pass
 * 2026-11-12: bls.gov tables could not be fetched directly in this build. A figure is verified:true only when it was
 * read from a BLS Occupational Outlook Handbook page or the O*NET national-wages row (which republishes OEWS);
 * figures taken from secondary aggregators that cite OEWS May 2025, or carried forward from an older release, are
 * verified:false and carry a VERIFY tag on the Data & sources page.
 *
 * Minimum wages: U.S. Department of Labor, Wage and Hour Division, "State Minimum Wage Laws" (updated January 1,
 * 2026), https://www.dol.gov/agencies/whd/minimum-wage/state. Only the rates corroborated by two independent
 * sources in this build are verified:true; the rest are the build's best knowledge of the January 2026 rate and are
 * flagged. Local (city) minimums are not modelled. States at or below the federal floor use $7.25 (FLSA).
 */
import { sourced, type Sourced } from '../lib/types';

export const STUDENT_WAGES_AS_OF = '2025-05';
export const STUDENT_WAGES_SOURCE = 'BLS OEWS May 2025 (national hourly percentiles), released 2026-05-15';
export const MIN_WAGE_AS_OF = '2026-01';
export const MIN_WAGE_SOURCE = 'U.S. Department of Labor, Wage and Hour Division, State Minimum Wage Laws (Jan 1, 2026)';
export const MIN_WAGE_URL = 'https://www.dol.gov/agencies/whd/minimum-wage/state';
export const FEDERAL_MINIMUM_WAGE = sourced(7.25, 'Fair Labor Standards Act federal minimum wage (29 U.S.C. §206)', MIN_WAGE_AS_OF, true, { url: MIN_WAGE_URL });

export type StudentJobKey = 'cashier' | 'food_prep' | 'retail_sales' | 'lifeguard' | 'tutor';

export interface StudentJob {
  key: StudentJobKey;
  /** SOC code */
  soc: string;
  title: string;
  /** Where a student usually finds this job */
  blurb: string;
  /** National median hourly wage (OEWS) */
  median: Sourced<number>;
  /** 10th and 90th percentile hourly wages when seen (context on the intake) */
  p10?: number;
  p90?: number;
  /** Typical hours: schoolyear / summer per week (planning assumption, editable) */
  typicalHours: { schoolYear: number; summer: number };
}

const OOH = (path: string) => `https://www.bls.gov/ooh/${path}`;

export const STUDENT_JOBS: Record<StudentJobKey, StudentJob> = {
  cashier: {
    key: 'cashier',
    soc: '41-2011',
    title: 'Cashier',
    blurb: 'Grocery, drugstore, fast food, campus store',
    median: sourced(15.81, 'BLS OEWS May 2025, SOC 41-2011 Cashiers, national median hourly wage (via BLS OOH)', STUDENT_WAGES_AS_OF, true, { url: OOH('sales/cashiers.htm'), note: 'OOH: 10th percentile $11.79, 90th percentile $19.43' }),
    p10: 11.79,
    p90: 19.43,
    typicalHours: { schoolYear: 12, summer: 25 },
  },
  food_prep: {
    key: 'food_prep',
    soc: '35-2021',
    title: 'Food prep / coffee shop',
    blurb: 'Kitchen prep, counter, barista',
    median: sourced(16.98, 'BLS OEWS May 2025, SOC 35-2021 Food Preparation Workers, national median hourly wage (via WageDex, secondary)', STUDENT_WAGES_AS_OF, false, { url: OOH('food-preparation-and-serving/food-preparation-workers.htm'), note: 'Single secondary source for May 2025 ($35,320/yr); the BLS OOH page still shows the May 2024 median of $16.45. Confirm on bls.gov/oes/2025/may.' }),
    typicalHours: { schoolYear: 12, summer: 25 },
  },
  retail_sales: {
    key: 'retail_sales',
    soc: '41-2031',
    title: 'Retail sales',
    blurb: 'Clothing, electronics, mall and big-box stores',
    median: sourced(17.03, 'BLS OEWS May 2025, SOC 41-2031 Retail Salespersons, national median hourly wage (via BLS OOH)', STUDENT_WAGES_AS_OF, true, { url: OOH('sales/retail-sales-workers.htm') }),
    typicalHours: { schoolYear: 15, summer: 30 },
  },
  lifeguard: {
    key: 'lifeguard',
    soc: '33-9092',
    title: 'Lifeguard',
    blurb: 'Pools, beaches, rec centers (often summer only)',
    median: sourced(16.14, 'BLS OEWS May 2025, SOC 33-9092 Lifeguards, Ski Patrol and Other Recreational Protective Service Workers, national median hourly wage (via O*NET national wages)', STUDENT_WAGES_AS_OF, true, { url: 'https://www.onetonline.org/link/localwages/33-9092.00', note: 'O*NET: 10th percentile $12.40, 90th percentile $21.14' }),
    p10: 12.4,
    p90: 21.14,
    typicalHours: { schoolYear: 6, summer: 35 },
  },
  tutor: {
    key: 'tutor',
    soc: '25-3041',
    title: 'Tutor',
    blurb: 'Peer tutoring, test prep, teaching centers',
    median: sourced(20.84, 'BLS OEWS May 2025, SOC 25-3041 Tutors, national median (secondary sources report $43,350/yr; ÷ 2,080 hours)', STUDENT_WAGES_AS_OF, false, { url: 'https://www.bls.gov/oes/current/oes253041.htm', note: 'Derived from an annual figure on aggregator sites; the last official table seen was May 2023 ($19.03/hr). Confirm on bls.gov/oes/2025/may.' }),
    typicalHours: { schoolYear: 6, summer: 10 },
  },
};

export const STUDENT_JOB_KEYS = Object.keys(STUDENT_JOBS) as StudentJobKey[];

export function listStudentJobs(): StudentJob[] {
  return STUDENT_JOB_KEYS.map((k) => STUDENT_JOBS[k]);
}

/** School-year and summer lengths used to turn weekly hours into a year of pay (planning assumption). */
export const STUDENT_WEEKS = {
  schoolYear: sourced(36, 'Planning assumption: a 36-week school year', '2026-11', false, { note: 'Most U.S. districts run 175-180 instructional days; semester colleges about 30 weeks in class. Editable per plan.' }),
  summer: sourced(12, 'Planning assumption: a 12-week summer', '2026-11', false, { note: 'Editable per plan.' }),
};

/**
 * Practice paycheck: a student without a job can still build a real budget. The amount is a realistic part-time
 * pattern (cashier wage floored at the state minimum, 10 hours a week in the school year, 20 in summer) and is
 * labelled as practice everywhere it appears. Asked for by a Texas personal-finance teacher (interview, 2026).
 */
export const PRACTICE_PAYCHECK = {
  job: 'cashier' as StudentJobKey,
  hoursSchoolYear: 10,
  hoursSummer: 20,
  source: sourced('practice', 'Sprout practice paycheck (not real income): cashier median wage floored at the state minimum, 10 hrs/wk in school, 20 hrs/wk in summer', '2026-11', false, { note: 'Turn it off on the You screen once you have a real job or allowance to plan with.' }),
};

const dol = (value: number, verified: boolean, note?: string): Sourced<number> => sourced(value, MIN_WAGE_SOURCE, MIN_WAGE_AS_OF, verified, { url: MIN_WAGE_URL, note });
const federal = (): Sourced<number> => sourced(7.25, 'Federal minimum wage applies (no higher state rate), FLSA', MIN_WAGE_AS_OF, true, { url: MIN_WAGE_URL });

/** State minimum wage per hour as of January 1, 2026 (two-letter code). */
export const STATE_MINIMUM_WAGE: Record<string, Sourced<number>> = {
  AL: federal(), AK: dol(13.0, false, 'Rises to $14.00 on July 1, 2026'), AZ: dol(15.15, true, 'Some sources print $15.16; confirm with the Industrial Commission of Arizona'), AR: dol(11.0, false),
  CA: dol(16.9, true), CO: dol(15.16, true, 'Denver and Boulder set higher local rates'), CT: dol(16.94, true), DE: dol(15.0, false), DC: dol(17.95, false, 'Rises mid-2026; sources disagree ($17.95 vs $18.40)'),
  FL: dol(14.0, false, 'Rises to $15.00 on September 30, 2026'), GA: federal(), HI: dol(16.0, false), ID: federal(), IL: dol(15.0, true, 'Chicago is higher'), IN: federal(), IA: federal(), KS: federal(), KY: federal(), LA: federal(),
  ME: dol(15.1, false), MD: dol(15.0, true), MA: dol(15.0, true), MI: dol(13.73, false), MN: dol(11.41, false), MS: federal(), MO: dol(15.0, true), MT: dol(10.85, false), NE: dol(15.0, true), NV: dol(12.0, false),
  NH: federal(), NJ: dol(15.92, true), NM: dol(12.0, false), NY: dol(16.0, true, 'Statewide rate; $17.00 in New York City, Long Island and Westchester'), NC: federal(), ND: federal(), OH: dol(11.0, false), OK: federal(), OR: dol(15.05, false, 'Standard rate; Portland metro higher, non-urban lower; adjusts July 1, 2026'), PA: federal(),
  RI: dol(16.0, false), SC: federal(), SD: dol(11.8, false), TN: federal(), TX: federal(), UT: federal(), VT: dol(14.42, false), VA: dol(12.77, false), WA: dol(17.13, true), WV: dol(8.75, false), WI: federal(), WY: federal(),
};

/** Minimum wage for a state code; the federal floor when the state is unknown or has no higher rate. */
export function minimumWageFor(stateCode: string | undefined | null): Sourced<number> {
  const s = stateCode ? STATE_MINIMUM_WAGE[stateCode.toUpperCase()] : undefined;
  return s ?? FEDERAL_MINIMUM_WAGE;
}

/** Default hourly wage for a student job in a state: the OEWS median floored at the state minimum. */
export function defaultStudentWage(job: StudentJobKey, stateCode: string | undefined | null): { wage: number; floored: boolean; median: Sourced<number>; minimum: Sourced<number> } {
  const median = STUDENT_JOBS[job].median;
  const minimum = minimumWageFor(stateCode);
  const floored = minimum.value > median.value;
  return { wage: floored ? minimum.value : median.value, floored, median, minimum };
}
