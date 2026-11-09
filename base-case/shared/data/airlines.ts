/**
 * Airline pay scales, retirement plans and career-path definitions for Flight Plan (airline-pilot plans).
 *
 * Ported from the Flight Plan single-file build (flight-plan.html, Oct 2026) with the same "no silent numbers" rule:
 *  - every rate is Sourced; pay scales are built from ANCHOR steps and the in-between longevity steps are filled by
 *    linear interpolation and marked verified:false ("Interpolated (AA FO yr 2→12)");
 *  - estimates that are not from a published scale are marked verified:false with a note;
 *  - United and Delta are REFERENCE paths that reuse American's scale and say PROXY in the source until a real scale
 *    is entered.
 * Rates are nominal contract rates. Dated contract raises apply first; after the last listed raise the engine applies
 * the path's pay-growth assumption (default 3%/yr). Nothing here is indexed by inflation.
 *
 * Verify before client use: the sources are secondary (aviation pay-tracking sites, union press releases, recruiting
 * pages). sources.md lists every URL. Refresh procedure: docs/DATA_UPDATES.md.
 */
import { sourced, type Sourced } from '../lib/types';

export const AIRLINES_AS_OF = '2026-10';
export const AIRLINES_SOURCE = 'Airline pay scales and retirement terms compiled Oct 2026 (secondary sources; see sources.md)';

export type AirlineId = 'cfi' | 'envoy' | 'regional' | 'american' | 'southwest' | 'fedex' | 'united' | 'delta';
export type AirlineKind = 'training' | 'regional' | 'major' | 'cargo';
export type Seat = 'FO' | 'CA';
export type Fleet = 'NB' | 'WB';
/** What happens to company contributions above the §415(c) limit */
export type ExcessHandling = 'cash' | 'mbcb' | 'forfeit';
export type PayUnit = 'hour' | 'TFP' | 'salary';

export interface PayScale {
  /** 12 longevity steps, index 0 = year 1 */
  fo: Sourced<number>[];
  ca: Sourced<number>[];
}

export interface ContractRaise {
  /** ISO date the raise takes effect (applied for the calendar year) */
  effective: string;
  /** Percent, e.g. 3 = 3% */
  pct: Sourced<number>;
}

export interface AirlinePension {
  /** Legacy defined-benefit cap (annual, today's dollars) */
  maxAnnualBenefit: Sourced<number>;
  /** Years of service for the full benefit */
  fullServiceYears: Sourced<number>;
  /** Final-average-earnings cap used in the benefit formula */
  faeCap: Sourced<number>;
  /** Alternative market-based cash balance credit, % of pay */
  mbcbAltPct: Sourced<number>;
  electionWindow: Sourced<string>;
}

export interface AirlineRetirement {
  planType: string;
  /** Non-elective company 401(k) contribution, % of pay */
  companyPct: Sourced<number>;
  /** Market-based cash balance credit, % of pay (in addition to companyPct) */
  mbcbPct?: Sourced<number>;
  excessHandling: Sourced<ExcessHandling>;
  pension?: AirlinePension;
}

export interface Airline {
  id: AirlineId;
  name: string;
  code: string;
  kind: AirlineKind;
  payUnit: PayUnit;
  narrowbody: PayScale;
  widebody?: PayScale;
  raises: ContractRaise[];
  retirement: AirlineRetirement;
  /** Contract amendable date (YYYY-MM or YYYY-MM-DD), or a note */
  amendable: Sourced<string>;
  /** Guaranteed flow-through to this major */
  flowTo?: AirlineId;
  /** First officers paid at the captain rate after 750 hours (Envoy) */
  foPaidCaRateAfter750?: Sourced<boolean>;
  /** Temporary pay premium not projected beyond its end date */
  premium?: { pct: Sourced<number>; ends: string };
  notes: string[];
}

// ---------------------------------------------------------------------------------------------
// Sources
// ---------------------------------------------------------------------------------------------

export const AIRLINE_SOURCES = {
  aaSalary: { name: 'aviationa2z.com — "American Airlines Pilot Salary 2026"', url: 'https://www.aviationa2z.com/index.php/2026/08/american-airlines-pilot-salary/' },
  aa401k: { name: 'APA contract summary as reported by aviationa2z.com (Aug 2026)', url: 'https://www.aviationa2z.com/index.php/2026/08/american-airlines-pilot-salary/' },
  aaAmendable: { name: 'FlightGlobal / Nasdaq — 4-year APA pact ratified Aug 2023, amendable 1 Aug 2027', url: 'https://www.flightglobal.com/strategy/american-airlines-pilots-accept-new-deal-that-will-boost-pay-up-to-46/154644.article' },
  aaMbcb: { name: 'Airways Magazine — Summary of APA/American agreement (Market Based Cash Balance Plan for excess 401(k) contributions)', url: 'https://airwaysmag.com/summary-apa-american-agreement/' },
  bolt: { name: 'boltflight.com — "Top 5 Airlines … 2026"', url: 'https://boltflight.com/' },
  thrust: { name: 'thrustflight.com — American Airlines pilot pay (2024 scale)', url: 'https://thrustflight.com/american-airlines-pilot-salary/' },
  aero: { name: 'aerocorner.com — Southwest / major airline pilot pay', url: 'https://aerocorner.com/blog/southwest-airlines-pilot-salary/' },
  swaA2z: { name: 'aviationa2z.com — Southwest pilot pay & retirement (Aug 2026)', url: 'https://www.aviationa2z.com/' },
  swaRatify: { name: 'AP / AJOT — SWAPA 2024 contract ratification', url: 'https://www.ajot.com/news/southwest-airlines-pilots-ratify-new-contract' },
  fdxAlpa: { name: 'ALPA press release — FedEx pilots ratify new CBA (Jun 2026)', url: 'https://www.alpa.org/press-room/2026/06/fedex-pilots-ratify-new-collective-bargaining-agreement' },
  fdxDive: { name: 'Supply Chain Dive / FreightWaves — FedEx pilot contract coverage (2026)', url: undefined as string | undefined },
  fdxCommentary: { name: 'Advisor commentary on FedEx 2026 retirement changes (secondary; verify against CBA Section 28)', url: 'https://leadingedgeplanning.com/fedex-pilots-open-enrollment/' },
  envoy: { name: 'envoyair.com/pilots', url: 'https://www.envoyair.com/pilots/' },
  envoyPortfolio: { name: 'Envoy Pilot Portfolio (6/10/2026) — via search summary, not read first-hand', url: 'https://www.envoyair.com/wp-content/uploads/2026/06/Envoy-Pilot-Portfolio-6.10.2026.pdf' },
} as const;

type SourceRef = { name: string; url?: string };

function rate(value: number, src: SourceRef, asOf: string, verified: boolean, note?: string): Sourced<number> {
  return sourced(value, src.name, asOf, verified, { url: src.url, note });
}

/** A rate that is not from a published scale: always verified:false. */
export function estimate(value: number, note: string, asOf = AIRLINES_AS_OF): Sourced<number> {
  return sourced(value, 'Estimate — not from a published scale', asOf, false, { note });
}

/**
 * Build a 12-step pay scale from anchor steps. Missing steps are linearly interpolated between the nearest anchors (or
 * held flat beyond the last / before the first) and marked verified:false with an "Interpolated" source.
 */
export function scale(anchors: Record<number, Sourced<number>>, label: string): Sourced<number>[] {
  const keys = Object.keys(anchors).map(Number).sort((a, b) => a - b);
  if (keys.length === 0) throw new Error(`scale(${label}): no anchors`);
  const out: Sourced<number>[] = [];
  for (let step = 1; step <= 12; step++) {
    const hit = anchors[step];
    if (hit) {
      out.push(hit);
      continue;
    }
    const lo = [...keys].reverse().find((k) => k < step);
    const hi = keys.find((k) => k > step);
    let value: number;
    let source: string;
    if (lo !== undefined && hi !== undefined) {
      const a = anchors[lo].value;
      const b = anchors[hi].value;
      value = a + ((b - a) * (step - lo)) / (hi - lo);
      source = `Interpolated (${label} yr ${lo}→${hi})`;
    } else {
      const k = (lo ?? hi) as number;
      value = anchors[k].value;
      source = `Held flat from ${label} yr ${k}`;
    }
    out.push(sourced(Math.round(value * 100) / 100, source, anchors[keys[0]].asOf, false));
  }
  return out;
}

/** Typical post-probation step: year-2 FO ≈ 72% of the 12-year FO rate. */
function year2Fo(top: Sourced<number>, label: string): Sourced<number> {
  return estimate(Math.round(top.value * 0.72 * 100) / 100, `${label}: year-2 FO ≈ 72% of 12-yr FO (typical post-probation step)`);
}
/** Typical compression: year-1 CA ≈ 93% of the 12-year CA rate. */
function year1Ca(top: Sourced<number>, label: string): Sourced<number> {
  return estimate(Math.round(top.value * 0.93 * 100) / 100, `${label}: year-1 CA ≈ 93% of 12-yr CA (typical compression)`);
}

const S = AIRLINE_SOURCES;
const AA_FO_12 = rate(266.58, S.aaSalary, '2026-08', true, '737 12-yr FO, 2026');
const AA_CA_12 = rate(402.01, S.aaSalary, '2026-08', true, '737 12-yr CA, 2026');
const AA_WB_CA_12 = rate(483.74, S.bolt, '2026-01', true, 'Widebody 12-yr CA, 2026; → $498.25 on 1/1/2027');
const AA_WB_FO_12 = rate(330.44, S.bolt, '2026-01', true, 'Widebody 12-yr FO, 2026');
const AA_FO_1 = rate(113, S.thrust, '2024-01', false, '≈$113/hr is the 2024 1st-yr narrowbody FO rate — verify 2026 scale');
const SWA_FO_12 = rate(240.2, S.swaA2z, '2026-08', true, '12-yr FO, per TFP');
const SWA_CA_12 = rate(343.14, S.swaA2z, '2026-08', true, '12-yr CA, per TFP');
const FDX_FO_12 = rate(332.49, S.bolt, '2026-01', true, 'Top widebody FO');
const FDX_CA_12 = rate(469, S.bolt, '2026-01', true, 'Top widebody CA');

const DEFAULT_EXCESS: Sourced<ExcessHandling> = sourced<ExcessHandling>('cash', 'Default assumption', AIRLINES_AS_OF, false, { note: 'Excess company contributions above §415(c) paid as taxable cash unless the plan says otherwise' });

function proxyMajor(id: 'united' | 'delta', name: string, code: string): Airline {
  return {
    id,
    name: `${name} (reference)`,
    code,
    kind: 'major',
    payUnit: 'hour',
    narrowbody: {
      fo: scale({ 1: sourced(113, 'PROXY: American 2024 yr-1 FO', '2024-01', false), 2: year2Fo(AA_FO_12, `${code} proxy`), 12: sourced(266.58, `PROXY: American 737 12-yr FO — ${code} scale not seeded`, '2026-08', false) }, `${code} FO`),
      ca: scale({ 1: year1Ca(AA_CA_12, `${code} proxy`), 12: sourced(402.01, `PROXY: American 737 12-yr CA — ${code} scale not seeded`, '2026-08', false) }, `${code} CA`),
    },
    raises: [],
    retirement: {
      planType: 'DC',
      companyPct: sourced(18, `${S.aero.name}; ${S.bolt.name}`, '2026-01', true, { url: S.aero.url }),
      excessHandling: DEFAULT_EXCESS,
    },
    amendable: sourced('Not seeded', 'Not in seed data', AIRLINES_AS_OF, false),
    notes: [`Reference path. Pay scale is an American proxy until a ${code} scale is entered.`],
  };
}

export const AIRLINES: Record<AirlineId, Airline> = {
  cfi: {
    id: 'cfi',
    name: 'Flight Instructor (time-building)',
    code: 'CFI',
    kind: 'training',
    payUnit: 'salary',
    narrowbody: {
      fo: scale({ 1: estimate(45000, 'Typical full-time CFI annual comp $35k–$60k (2026); edit to actual') }, 'CFI'),
      ca: scale({ 1: estimate(45000, 'Same as FO for CFI') }, 'CFI'),
    },
    raises: [],
    retirement: {
      planType: 'DC',
      companyPct: estimate(0, 'Most flight schools offer little or no retirement contribution'),
      excessHandling: sourced<ExcessHandling>('cash', 'n/a', AIRLINES_AS_OF, false),
    },
    amendable: sourced('n/a', 'n/a', AIRLINES_AS_OF, true),
    notes: ['Time-building to 1,500 hrs ATP (or R-ATP 1,000/1,250 hrs).'],
  },
  envoy: {
    id: 'envoy',
    name: 'Envoy Air',
    code: 'ENVOY',
    kind: 'regional',
    payUnit: 'hour',
    narrowbody: {
      fo: scale(
        {
          1: rate(90, { name: `${S.envoy.name} (new-hire FO “> $90/hr”)`, url: S.envoy.url }, AIRLINES_AS_OF, true, 'Floor used conservatively. Envoy Pilot Portfolio (6/10/2026) lists $102/hr year-1 — verify whether that includes the 2026 premium.'),
          2: estimate(105, 'Envoy FO year-2 base (only used if the 750-hr captain-rate rule is switched off)'),
          12: estimate(130, 'Envoy FO top-step estimate'),
        },
        'Envoy FO',
      ),
      ca: scale(
        {
          1: rate(165, S.envoyPortfolio, '2026-06', false, 'Year-2 step shown at captain rate; used for CA yr 1–2'),
          2: rate(165, S.envoyPortfolio, '2026-06', false),
          3: rate(168.75, S.envoyPortfolio, '2026-06', false),
          4: rate(172.5, S.envoyPortfolio, '2026-06', false),
          5: rate(176.25, S.envoyPortfolio, '2026-06', false),
          6: rate(225, S.envoyPortfolio, '2026-06', false),
          12: estimate(245, 'Envoy CA top-step estimate'),
        },
        'Envoy CA',
      ),
    },
    raises: [],
    retirement: {
      planType: 'DC',
      companyPct: estimate(7, 'Regional 401(k) match placeholder — verify Envoy plan document'),
      excessHandling: DEFAULT_EXCESS,
    },
    amendable: sourced('Not seeded', 'Not in seed data', AIRLINES_AS_OF, false),
    flowTo: 'american',
    foPaidCaRateAfter750: sourced(true, S.envoy.name, AIRLINES_AS_OF, true, { url: S.envoy.url, note: 'Envoy recruiting page ties this to new FOs “through 12/31/2026” — verify it still applies to FOs hired later.' }),
    premium: { pct: rate(50, S.envoy, AIRLINES_AS_OF, true, '50% “pilot supply premium” on hourly rates'), ends: '2026-12-31' },
    notes: ['AA wholly owned regional with guaranteed flow to American.', '50% pilot supply premium through 12/31/2026 (not projected beyond).'],
  },
  regional: {
    id: 'regional',
    name: 'Regional (typical)',
    code: 'RGNL',
    kind: 'regional',
    payUnit: 'hour',
    narrowbody: {
      fo: scale({ 1: estimate(100, 'Industry-typical 2026 regional FO yr-1; replace with employer scale'), 12: estimate(130, 'Regional FO top-step estimate') }, 'Regional FO'),
      ca: scale({ 1: estimate(155, 'Industry-typical 2026 regional CA yr-1'), 12: estimate(225, 'Regional CA top-step estimate') }, 'Regional CA'),
    },
    raises: [],
    retirement: {
      planType: 'DC',
      companyPct: estimate(6, 'Regional 401(k) match placeholder'),
      excessHandling: DEFAULT_EXCESS,
    },
    amendable: sourced('Varies', 'Generic', AIRLINES_AS_OF, false),
    notes: ['Generic regional used when the pilot is not at a branded-flow regional. Replace with the actual employer scale.'],
  },
  american: {
    id: 'american',
    name: 'American Airlines',
    code: 'AA',
    kind: 'major',
    payUnit: 'hour',
    narrowbody: {
      fo: scale({ 1: AA_FO_1, 2: year2Fo(AA_FO_12, 'AA'), 12: AA_FO_12 }, 'AA 737 FO'),
      ca: scale({ 1: year1Ca(AA_CA_12, 'AA'), 12: AA_CA_12 }, 'AA 737 CA'),
    },
    widebody: {
      fo: scale({ 1: AA_FO_1, 2: year2Fo(AA_WB_FO_12, 'AA WB'), 12: AA_WB_FO_12 }, 'AA WB FO'),
      ca: scale({ 1: year1Ca(AA_WB_CA_12, 'AA WB'), 12: AA_WB_CA_12 }, 'AA WB CA'),
    },
    raises: [{ effective: '2027-01-01', pct: rate(3, { name: `${S.bolt.name} (WB CA $483.74 → $498.25)`, url: S.bolt.url }, '2026-01', true, 'Derived: 498.25 / 483.74 − 1 = 3.0%') }],
    retirement: {
      planType: 'DC',
      companyPct: rate(18, S.aa401k, '2026-08', true, '17% from May 2024; 18% from May 2026'),
      excessHandling: sourced<ExcessHandling>('mbcb', S.aaMbcb.name, '2023-08', false, { url: S.aaMbcb.url, note: '2023 APA deal establishes a Market Based Cash Balance Plan for excess 401(k) contributions — verify plan mechanics.' }),
    },
    amendable: sourced('2027-08-01', S.aaAmendable.name, '2023-08', true, { url: S.aaAmendable.url, note: 'APA has sought early negotiations (opener as early as Nov 2026).' }),
    notes: ['Envoy pilots have guaranteed flow to American.'],
  },
  southwest: {
    id: 'southwest',
    name: 'Southwest Airlines',
    code: 'SWA',
    kind: 'major',
    payUnit: 'TFP',
    narrowbody: {
      fo: scale({ 1: rate(125.9, S.aero, '2026-01', true, '1st-yr FO, per TFP'), 2: year2Fo(SWA_FO_12, 'SWA'), 12: SWA_FO_12 }, 'SWA FO'),
      ca: scale({ 1: year1Ca(SWA_CA_12, 'SWA'), 12: SWA_CA_12 }, 'SWA CA'),
    },
    raises: [
      { effective: '2027-01-01', pct: rate(4, S.swaRatify, '2024-01', true) },
      { effective: '2028-01-01', pct: rate(3.25, S.swaRatify, '2024-01', true) },
    ],
    retirement: {
      planType: 'DC + MBCB',
      companyPct: rate(18, S.swaA2z, '2026-08', true, '18% non-elective'),
      mbcbPct: rate(2, S.swaA2z, '2026-08', true, '2% market-based cash balance plan (2026)'),
      excessHandling: DEFAULT_EXCESS,
    },
    amendable: sourced('2029-01', S.swaA2z.name, '2026-08', true, { url: S.swaA2z.url }),
    notes: ['Pay is per Trip for Pay (TFP), not per hour. “Credit hours” input is treated as TFP/month.', 'All-737 fleet: no widebody step.'],
  },
  fedex: {
    id: 'fedex',
    name: 'FedEx Express',
    code: 'FDX',
    kind: 'cargo',
    payUnit: 'hour',
    narrowbody: {
      fo: scale({ 1: estimate(125, 'FedEx yr-1 FO under 2026 CBA not seeded'), 12: FDX_FO_12 }, 'FDX FO'),
      ca: scale({ 1: year1Ca(FDX_CA_12, 'FDX'), 12: FDX_CA_12 }, 'FDX CA'),
    },
    raises: [
      { effective: '2028-01-01', pct: rate(3, { name: `${S.fdxAlpa.name}; ${S.fdxDive.name}`, url: S.fdxAlpa.url }, '2026-06', true, '+3%/yr 2028–2030') },
      { effective: '2029-01-01', pct: rate(3, S.fdxAlpa, '2026-06', true) },
      { effective: '2030-01-01', pct: rate(3, S.fdxAlpa, '2026-06', true) },
    ],
    retirement: {
      planType: 'DB pension / MBCB',
      companyPct: estimate(0, 'No company DC contribution seeded — FedEx’s primary company benefit is the DB pension / MBCB. Verify Pilot Savings Plan terms.'),
      mbcbPct: sourced(0, 'Legacy pension elected (default)', '2026-06', false, { note: 'Set by pension election' }),
      excessHandling: DEFAULT_EXCESS,
      pension: {
        maxAnnualBenefit: rate(169000, S.fdxAlpa, '2026-06', false, 'Derived: historical $130k cap × 1.30 (“30% increase to legacy pension”, ALPA summary)'),
        fullServiceYears: estimate(25, 'Assumed service years for full legacy benefit', '2026-06'),
        faeCap: rate(340000, S.fdxCommentary, '2026-01', false, '$290k cap applies to pilots who switch to MBCB'),
        mbcbAltPct: rate(9, S.fdxCommentary, '2026-01', false, '≈9% of pay through 2028, ≈10% after; varies by fleet/seat'),
        electionWindow: sourced('Apr 2027 – May 30, 2027 (effective 1/1/2028)', S.fdxCommentary.name, '2026-01', false, { url: S.fdxCommentary.url, note: 'One-time, irrevocable. Pension default; closed to pilots hired on/after 6/29/2026.' }),
      },
    },
    amendable: sourced('2030-12', S.fdxAlpa.name, '2026-06', true, { url: S.fdxAlpa.url }),
    notes: ['CBA effective 6/29/2026; ~40% raise in 2026; +3%/yr 2028–2030.', 'Legacy pension + new Market Based Cash Balance plan (MBCB floor = total company credits).'],
  },
  united: proxyMajor('united', 'United Airlines', 'UAL'),
  delta: proxyMajor('delta', 'Delta Air Lines', 'DAL'),
};

export const AIRLINE_IDS = Object.keys(AIRLINES) as AirlineId[];

// ---------------------------------------------------------------------------------------------
// Career paths (regional → major) and milestones
// ---------------------------------------------------------------------------------------------

export type AirlinePathId = 'envoy-aa' | 'regional-swa' | 'regional-fdx' | 'regional-ual' | 'regional-dal';
/** 'stay' = remain at the current employer */
export type AirlinePathChoice = AirlinePathId | 'stay';

export interface Milestones {
  /** Years from now until the first regional job (students / CFIs) */
  toRegional: number;
  /** Years at the regional before captain upgrade */
  regionalCaUpgrade: number;
  /** Years at the regional before the major hires (or flow) */
  toMajor: number;
  /** Years at the major before captain upgrade */
  majorCaUpgrade: number;
  /** Years after the major CA upgrade before a widebody seat (0 = never) */
  widebody: number;
}

export interface AirlinePathDef {
  id: AirlinePathId;
  label: string;
  regional: AirlineId | null;
  major: AirlineId | null;
  /** Reference path (proxy pay scale) */
  reference?: boolean;
  defaults: Milestones;
}

export const AIRLINE_PATHS: Record<AirlinePathId, AirlinePathDef> = {
  'envoy-aa': { id: 'envoy-aa', label: 'Envoy → American', regional: 'envoy', major: 'american', defaults: { toRegional: 1, regionalCaUpgrade: 2, toMajor: 4, majorCaUpgrade: 8, widebody: 6 } },
  'regional-swa': { id: 'regional-swa', label: 'Regional → Southwest', regional: 'regional', major: 'southwest', defaults: { toRegional: 1, regionalCaUpgrade: 3, toMajor: 4, majorCaUpgrade: 7, widebody: 0 } },
  'regional-fdx': { id: 'regional-fdx', label: 'Regional → FedEx', regional: 'regional', major: 'fedex', defaults: { toRegional: 1, regionalCaUpgrade: 3, toMajor: 5, majorCaUpgrade: 9, widebody: 0 } },
  'regional-ual': { id: 'regional-ual', label: 'Regional → United (ref)', regional: 'regional', major: 'united', reference: true, defaults: { toRegional: 1, regionalCaUpgrade: 3, toMajor: 4, majorCaUpgrade: 8, widebody: 6 } },
  'regional-dal': { id: 'regional-dal', label: 'Regional → Delta (ref)', regional: 'regional', major: 'delta', reference: true, defaults: { toRegional: 1, regionalCaUpgrade: 3, toMajor: 4, majorCaUpgrade: 8, widebody: 6 } },
};

export const AIRLINE_PATH_IDS = Object.keys(AIRLINE_PATHS) as AirlinePathId[];

/** Milestone defaults when the pilot stays at the current employer */
export const STAY_DEFAULTS: Milestones = { toRegional: 1, regionalCaUpgrade: 3, toMajor: 0, majorCaUpgrade: 8, widebody: 6 };

export type PilotStage = 'student' | 'cfi' | 'regional_fo' | 'regional_ca' | 'major_fo' | 'major_ca' | 'cargo_fo' | 'cargo_ca';

export const PILOT_STAGES: { value: PilotStage; label: string }[] = [
  { value: 'student', label: 'Student pilot' },
  { value: 'cfi', label: 'CFI / time-building' },
  { value: 'regional_fo', label: 'Regional first officer' },
  { value: 'regional_ca', label: 'Regional captain' },
  { value: 'major_fo', label: 'Major first officer' },
  { value: 'major_ca', label: 'Major captain' },
  { value: 'cargo_fo', label: 'Cargo first officer' },
  { value: 'cargo_ca', label: 'Cargo captain' },
];

export const isRegionalStage = (s: PilotStage): boolean => s === 'regional_fo' || s === 'regional_ca';
export const isMajorStage = (s: PilotStage): boolean => s === 'major_fo' || s === 'major_ca' || s === 'cargo_fo' || s === 'cargo_ca';
export const isCaptainStage = (s: PilotStage): boolean => s.endsWith('_ca');
export const isEarlyCareerStage = (s: PilotStage): boolean => s === 'student' || s === 'cfi' || isRegionalStage(s);

/** Employers a pilot can currently be at ('none' for students / CFIs) */
export type EmployerChoice = AirlineId | 'none';

/** Milestones for a path: path defaults (or stay defaults) overlaid with the client's edits. */
export function milestonesFor(choice: AirlinePathChoice, overrides: Partial<Milestones> | undefined): Milestones {
  const base = choice === 'stay' ? STAY_DEFAULTS : AIRLINE_PATHS[choice]?.defaults ?? STAY_DEFAULTS;
  const out: Milestones = { ...base };
  for (const k of Object.keys(base) as (keyof Milestones)[]) {
    const v = overrides?.[k];
    if (typeof v === 'number' && Number.isFinite(v)) out[k] = Math.max(0, v);
  }
  return out;
}

/**
 * Which regional and major a path runs through, given where the pilot is today.
 *  - already at a major/cargo carrier: stay there (no regional leg) regardless of the path chosen;
 *  - 'stay': the current employer (a regional or a major), or the generic regional for students/CFIs;
 *  - otherwise the path's regional/major, except that a pilot already at a regional keeps that regional.
 */
export function resolveAirlines(choice: AirlinePathChoice, stage: PilotStage, employer: EmployerChoice): { regional: AirlineId | null; major: AirlineId | null } {
  const emp = employer !== 'none' && AIRLINES[employer] ? employer : 'none';
  if (isMajorStage(stage) && emp !== 'none') return { regional: null, major: emp };
  if (choice === 'stay') {
    const a: AirlineId = emp === 'none' ? 'regional' : emp;
    return AIRLINES[a].kind === 'regional' || AIRLINES[a].kind === 'training' ? { regional: a === 'cfi' ? 'regional' : a, major: null } : { regional: null, major: a };
  }
  const def = AIRLINE_PATHS[choice];
  const regional = isRegionalStage(stage) && emp !== 'none' && AIRLINES[emp].kind === 'regional' ? emp : def.regional;
  return { regional, major: def.major };
}

export function airlinePathCode(choice: AirlinePathChoice, stage: PilotStage, employer: EmployerChoice): string {
  const { regional, major } = resolveAirlines(choice, stage, employer);
  if (major) return regional ? `${AIRLINES[regional].code} → ${AIRLINES[major].code}` : AIRLINES[major].code;
  return AIRLINES[regional ?? 'regional'].code;
}

export function airlinePathName(choice: AirlinePathChoice, stage: PilotStage, employer: EmployerChoice): string {
  const { regional, major } = resolveAirlines(choice, stage, employer);
  if (major) return regional ? `${AIRLINES[regional].name} → ${AIRLINES[major].name}` : `Career at ${AIRLINES[major].name}`;
  return `Stay at ${AIRLINES[regional ?? 'regional'].name}`;
}

/** Hourly (or TFP, or annual for CFI) rate for a seat, fleet and longevity year (clamped to 1..12). */
export function rateFor(airline: Airline, seat: Seat, fleet: Fleet, longevity: number): Sourced<number> {
  const s = fleet === 'WB' && airline.widebody ? airline.widebody : airline.narrowbody;
  const steps = seat === 'CA' ? s.ca : s.fo;
  const idx = Math.min(Math.max(Math.floor(longevity), 1), 12) - 1;
  return steps[idx];
}

/**
 * Cumulative pay multiplier for a calendar year: dated contract raises apply in their year; after the last listed raise
 * the pay-growth assumption applies each year. Base year 2026 = 1.
 */
export function contractMultiplier(airline: Airline, year: number, growthAfterContract: number, baseYear = 2026): number {
  const raiseYears = airline.raises.map((r) => Number(r.effective.slice(0, 4)));
  const lastRaise = Math.max(baseYear, ...raiseYears);
  let mult = 1;
  for (let y = baseYear + 1; y <= year; y++) {
    const raise = airline.raises.find((r) => Number(r.effective.slice(0, 4)) === y);
    if (raise) mult *= 1 + raise.pct.value / 100;
    else if (y > lastRaise) mult *= 1 + growthAfterContract;
  }
  return mult;
}

/** Pay at which a company contribution rate hits the §415(c) cap alongside a maximum deferral (2026 dollars). */
export function bindingPay415c(companyPct: number, electiveDeferral: number, annualAdditions: number): number {
  return companyPct <= 0 ? Infinity : (annualAdditions - electiveDeferral) / companyPct;
}

export function listAirlines(): Airline[] {
  return AIRLINE_IDS.map((id) => AIRLINES[id]);
}

export function listAirlinePaths(): AirlinePathDef[] {
  return AIRLINE_PATH_IDS.map((id) => AIRLINE_PATHS[id]);
}
