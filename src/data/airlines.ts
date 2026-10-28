import type { ExcessHandling, Sourced } from '../lib/types';

/**
 * Airline pay & benefit data. EVERY number carries a source and asOf date.
 * - verified: true  → figure reported by the cited source.
 * - verified: false → interpolated, estimated, or proxy. Shown with an amber VERIFY tag in Advisor Mode.
 *
 * Pay scales are 2026 base rates for longevity years 1–12. Rates are hourly
 * (or per Trip-for-Pay for Southwest). Contract raises after 2026 are listed in `raises`.
 *
 * HOW TO UPDATE: replace anchor values in `scale(...)` calls (and asOf/source),
 * add new dated entries to `raises`, then run `npm test` and `npm run build`.
 */

export type AirlineId = 'cfi' | 'envoy' | 'regional' | 'american' | 'southwest' | 'fedex' | 'united' | 'delta';
export type AirlineKind = 'training' | 'regional' | 'major' | 'cargo';
export type PlanType = 'DC' | 'DC + MBCB' | 'DB pension / MBCB';

export interface PayScale {
  fo: Sourced[]; // index 0 = longevity year 1 … index 11 = year 12+
  ca: Sourced[];
}

export interface Raise { effective: string; pct: Sourced }

export interface Airline {
  id: AirlineId;
  name: string;
  /** Short ND-style identifier */
  code: string;
  kind: AirlineKind;
  payUnit: 'hour' | 'TFP' | 'salary';
  narrowbody: PayScale;
  widebody?: PayScale;
  raises: Raise[];
  retirement: {
    planType: PlanType;
    /** Non-elective company DC contribution, % of eligible pay */
    companyPct: Sourced;
    /** Market-based cash balance pay credit (a DB plan; outside §415(c) DC limit), % of pay */
    mbcbPct?: Sourced;
    /** What happens to company DC money above §415(c) */
    excessHandling: Sourced<ExcessHandling>;
    pension?: {
      /** Max annual legacy pension benefit at full service */
      maxAnnualBenefit: Sourced;
      /** Years of service for the full benefit (assumption) */
      fullServiceYears: Sourced;
      /** Final-average-earnings cap */
      faeCap: Sourced;
      /** MBCB credit if the pilot elects out of the legacy pension */
      mbcbAltPct: Sourced;
      electionWindow: Sourced<string>;
    };
  };
  amendable: Sourced<string>;
  /** Guaranteed / contractual flow to a mainline partner */
  flowTo?: AirlineId;
  /** Envoy: FOs paid captain rates once they reach 750 Part 121 hours */
  foPaidCaRateAfter750?: Sourced<boolean>;
  premium?: { pct: Sourced; ends: string };
  notes: string[];
}

// ---------------------------------------------------------------- helpers

const S = (value: number, source: string, asOf: string, verified: boolean, url?: string, note?: string): Sourced => ({
  value, source, asOf, verified, url, note,
});

/** Build a 12-step scale from anchors; non-anchor steps are interpolated and flagged verified:false. */
function scale(anchors: Partial<Record<number, Sourced>>, label: string): Sourced[] {
  const keys = Object.keys(anchors).map(Number).sort((a, b) => a - b);
  const out: Sourced[] = [];
  for (let y = 1; y <= 12; y++) {
    const exact = anchors[y];
    if (exact) { out.push(exact); continue; }
    const lo = [...keys].reverse().find((k) => k < y);
    const hi = keys.find((k) => k > y);
    let v: number;
    let src: string;
    if (lo !== undefined && hi !== undefined) {
      const a = anchors[lo]!.value, b = anchors[hi]!.value;
      v = a + ((b - a) * (y - lo)) / (hi - lo);
      src = `Interpolated (${label} yr ${lo}→${hi})`;
    } else {
      const k = (lo ?? hi)!;
      v = anchors[k]!.value;
      src = `Held flat from ${label} yr ${k}`;
    }
    out.push(S(Math.round(v * 100) / 100, src, anchors[keys[0]]!.asOf, false));
  }
  return out;
}

const est = (value: number, note: string, asOf = '2026-10') =>
  S(value, 'Estimate — not from a published scale', asOf, false, undefined, note);

// ---------------------------------------------------------------- sources

export const SRC = {
  aaSalary: { name: 'aviationa2z.com — "American Airlines Pilot Salary 2026"', url: 'https://www.aviationa2z.com/index.php/2026/08/american-airlines-pilot-salary/' },
  aa401k: { name: 'APA contract summary as reported by aviationa2z.com (Aug 2026)', url: 'https://www.aviationa2z.com/index.php/2026/08/american-airlines-pilot-salary/' },
  aaAmendable: { name: 'FlightGlobal / Nasdaq — 4-year APA pact ratified Aug 2023, amendable 1 Aug 2027', url: 'https://www.flightglobal.com/strategy/american-airlines-pilots-accept-new-deal-that-will-boost-pay-up-to-46/154644.article' },
  aaMbcb: { name: 'Airways Magazine — Summary of APA/American agreement (Market Based Cash Balance Plan for excess 401(k) contributions)', url: 'https://airwaysmag.com/summary-apa-american-agreement/' },
  bolt: { name: 'boltflight.com — "Top 5 Airlines … 2026"', url: 'https://boltflight.com/' },
  thrust: { name: 'thrustflight.com — American Airlines pilot pay (2024 scale)', url: 'https://thrustflight.com/american-airlines-pilot-salary/' },
  aero: { name: 'aerocorner.com — Southwest / major airline pilot pay', url: 'https://aerocorner.com/blog/southwest-airlines-pilot-salary/' },
  swaA2z: { name: 'aviationa2z.com — Southwest pilot pay & retirement (Aug 2026)', url: 'https://www.aviationa2z.com/' },
  swaRatify: { name: 'AP / AJOT — SWAPA 2024 contract ratification', url: 'https://www.ajot.com/news/southwest-airlines-pilots-ratify-new-contract' },
  tfp: { name: 'airlinegeeks.com — Southwest pays per Trip for Pay (TFP)', url: 'https://airlinegeeks.com/' },
  fdxAlpa: { name: 'ALPA press release — FedEx pilots ratify new CBA (Jun 2026)', url: 'https://www.alpa.org/press-room/2026/06/fedex-pilots-ratify-new-collective-bargaining-agreement' },
  fdxDive: { name: 'Supply Chain Dive / FreightWaves — FedEx pilot contract coverage (2026)', url: 'https://www.supplychaindive.com/' },
  fdxMbcb: { name: 'FDX MEC — 2026 MBCBP education: comparison of cash balance plans', url: 'https://fdx.alpa.org/Portals/7/Documents/communications/public/2026/03/2026-mbcbp-education-comparison-of-cash-balance-plans.pdf' },
  fdxCommentary: { name: 'Advisor commentary on FedEx 2026 retirement changes (secondary; verify against CBA Section 28)', url: 'https://leadingedgeplanning.com/fedex-pilots-open-enrollment/' },
  envoy: { name: 'envoyair.com/pilots', url: 'https://www.envoyair.com/pilots/' },
  envoyPortfolio: { name: 'Envoy Pilot Portfolio (6/10/2026) — via search summary, not read first-hand', url: 'https://www.envoyair.com/wp-content/uploads/2026/06/Envoy-Pilot-Portfolio-6.10.2026.pdf' },
  faa65: { name: 'FAA Part 121 age-65 rule; APA opposes raising to 67 (Jefferies, Jun 2026)', url: 'https://www.faa.gov/' },
} as const;

// ---------------------------------------------------------------- airlines

const AA_NB_FO12 = S(266.58, SRC.aaSalary.name, '2026-08', true, SRC.aaSalary.url, '737 12-yr FO, 2026');
const AA_NB_CA12 = S(402.01, SRC.aaSalary.name, '2026-08', true, SRC.aaSalary.url, '737 12-yr CA, 2026');
const AA_WB_CA12 = S(483.74, SRC.bolt.name, '2026', true, SRC.bolt.url, 'Widebody 12-yr CA, 2026; → $498.25 on 1/1/2027');
const AA_WB_FO12 = S(330.44, SRC.bolt.name, '2026', true, SRC.bolt.url, 'Widebody 12-yr FO, 2026');
const AA_FO1 = S(113, SRC.thrust.name, '2024', false, SRC.thrust.url, '≈$113/hr is the 2024 1st-yr narrowbody FO rate — verify 2026 scale');

/** Year-2 FO typically jumps off probation pay to ~72% of the 12-yr FO rate (estimate). */
const yr2 = (fo12: Sourced, label: string) => est(Math.round(fo12.value * 0.72 * 100) / 100, `${label}: year-2 FO ≈ 72% of 12-yr FO (typical post-probation step)`);
/** Captain longevity steps are compressed; year-1 CA ≈ 93% of 12-yr CA (estimate). */
const ca1 = (ca12: Sourced, label: string) => est(Math.round(ca12.value * 0.93 * 100) / 100, `${label}: year-1 CA ≈ 93% of 12-yr CA (typical compression)`);

export const AIRLINES: Record<AirlineId, Airline> = {
  cfi: {
    id: 'cfi',
    name: 'Flight Instructor (time-building)',
    code: 'CFI',
    kind: 'training',
    payUnit: 'salary',
    narrowbody: {
      // CFI comp expressed as an annual figure in year 1; app treats payUnit 'salary' as annual.
      fo: scale({ 1: est(45_000, 'Typical full-time CFI annual comp $35k–$60k (2026); edit to actual') }, 'CFI'),
      ca: scale({ 1: est(45_000, 'Same as FO for CFI') }, 'CFI'),
    },
    raises: [],
    retirement: {
      planType: 'DC',
      companyPct: est(0, 'Most flight schools offer little or no retirement contribution'),
      excessHandling: { value: 'cash', source: 'n/a', asOf: '2026-10', verified: false },
    },
    amendable: { value: 'n/a', source: 'n/a', asOf: '2026-10', verified: true },
    notes: ['Time-building to 1,500 hrs ATP (or R-ATP 1,000/1,250 hrs).'],
  },

  envoy: {
    id: 'envoy',
    name: 'Envoy Air',
    code: 'ENVOY',
    kind: 'regional',
    payUnit: 'hour',
    narrowbody: {
      fo: scale({
        1: S(90, `${SRC.envoy.name} (new-hire FO “> $90/hr”)`, '2026-10', true, SRC.envoy.url,
          'Floor used conservatively. Envoy Pilot Portfolio (6/10/2026) lists $102/hr year-1 — verify whether that includes the 2026 premium.'),
        2: est(105, 'Envoy FO year-2 base (only used if the 750-hr captain-rate rule is switched off)'),
        12: est(130, 'Envoy FO top-step estimate'),
      }, 'Envoy FO'),
      ca: scale({
        1: S(165, SRC.envoyPortfolio.name, '2026-06', false, SRC.envoyPortfolio.url, 'Year-2 step shown at captain rate; used for CA yr 1–2'),
        2: S(165, SRC.envoyPortfolio.name, '2026-06', false, SRC.envoyPortfolio.url),
        3: S(168.75, SRC.envoyPortfolio.name, '2026-06', false, SRC.envoyPortfolio.url),
        4: S(172.5, SRC.envoyPortfolio.name, '2026-06', false, SRC.envoyPortfolio.url),
        5: S(176.25, SRC.envoyPortfolio.name, '2026-06', false, SRC.envoyPortfolio.url),
        6: S(225, SRC.envoyPortfolio.name, '2026-06', false, SRC.envoyPortfolio.url),
        12: est(245, 'Envoy CA top-step estimate'),
      }, 'Envoy CA'),
    },
    raises: [],
    retirement: {
      planType: 'DC',
      companyPct: est(7, 'Regional 401(k) match placeholder — verify Envoy plan document'),
      excessHandling: { value: 'cash', source: 'Default assumption', asOf: '2026-10', verified: false },
    },
    amendable: { value: 'Not seeded', source: 'Not in seed data', asOf: '2026-10', verified: false },
    flowTo: 'american',
    foPaidCaRateAfter750: { value: true, source: SRC.envoy.name, url: SRC.envoy.url, asOf: '2026-10', verified: true,
      note: 'Envoy recruiting page ties this to new FOs “through 12/31/2026” — verify it still applies to FOs hired later.' },
    premium: { pct: S(50, SRC.envoy.name, '2026-10', true, SRC.envoy.url, '50% “pilot supply premium” on hourly rates'), ends: '2026-12-31' },
    notes: ['AA wholly owned regional with guaranteed flow to American.', '50% pilot supply premium through 12/31/2026 (not projected beyond).'],
  },

  regional: {
    id: 'regional',
    name: 'Regional (typical)',
    code: 'RGNL',
    kind: 'regional',
    payUnit: 'hour',
    narrowbody: {
      fo: scale({ 1: est(100, 'Industry-typical 2026 regional FO yr-1; replace with employer scale'), 12: est(130, 'Regional FO top-step estimate') }, 'Regional FO'),
      ca: scale({ 1: est(155, 'Industry-typical 2026 regional CA yr-1'), 12: est(225, 'Regional CA top-step estimate') }, 'Regional CA'),
    },
    raises: [],
    retirement: {
      planType: 'DC',
      companyPct: est(6, 'Regional 401(k) match placeholder'),
      excessHandling: { value: 'cash', source: 'Default assumption', asOf: '2026-10', verified: false },
    },
    amendable: { value: 'Varies', source: 'Generic', asOf: '2026-10', verified: false },
    notes: ['Generic regional used when the pilot is not at a branded-flow regional. Replace with the actual employer scale.'],
  },

  american: {
    id: 'american',
    name: 'American Airlines',
    code: 'AA',
    kind: 'major',
    payUnit: 'hour',
    narrowbody: {
      fo: scale({ 1: AA_FO1, 2: yr2(AA_NB_FO12, 'AA'), 12: AA_NB_FO12 }, 'AA 737 FO'),
      ca: scale({ 1: ca1(AA_NB_CA12, 'AA'), 12: AA_NB_CA12 }, 'AA 737 CA'),
    },
    widebody: {
      fo: scale({ 1: AA_FO1, 2: yr2(AA_WB_FO12, 'AA WB'), 12: AA_WB_FO12 }, 'AA WB FO'),
      ca: scale({ 1: ca1(AA_WB_CA12, 'AA WB'), 12: AA_WB_CA12 }, 'AA WB CA'),
    },
    raises: [
      { effective: '2027-01-01', pct: S(3.0, `${SRC.bolt.name} (WB CA $483.74 → $498.25)`, '2026', true, SRC.bolt.url, 'Derived: 498.25 / 483.74 − 1 = 3.0%') },
    ],
    retirement: {
      planType: 'DC',
      companyPct: S(18, SRC.aa401k.name, '2026-08', true, SRC.aa401k.url, '17% from May 2024; 18% from May 2026'),
      excessHandling: { value: 'mbcb', source: SRC.aaMbcb.name, url: SRC.aaMbcb.url, asOf: '2023-08', verified: false,
        note: '2023 APA deal establishes a Market Based Cash Balance Plan for excess 401(k) contributions — verify plan mechanics.' },
    },
    amendable: { value: '2027-08-01', source: SRC.aaAmendable.name, url: SRC.aaAmendable.url, asOf: '2023-08', verified: true,
      note: 'APA has sought early negotiations (opener as early as Nov 2026).' },
    notes: ['Envoy pilots have guaranteed flow to American.'],
  },

  southwest: {
    id: 'southwest',
    name: 'Southwest Airlines',
    code: 'SWA',
    kind: 'major',
    payUnit: 'TFP',
    narrowbody: {
      fo: scale({
        1: S(125.9, SRC.aero.name, '2026', true, SRC.aero.url, '1st-yr FO, per TFP'),
        2: yr2(S(240.2, '', '2026', true), 'SWA'),
        12: S(240.2, SRC.swaA2z.name, '2026-08', true, SRC.swaA2z.url, '12-yr FO, per TFP'),
      }, 'SWA FO'),
      ca: scale({
        1: ca1(S(343.14, '', '2026', true), 'SWA'),
        12: S(343.14, SRC.swaA2z.name, '2026-08', true, SRC.swaA2z.url, '12-yr CA, per TFP'),
      }, 'SWA CA'),
    },
    raises: [
      { effective: '2027-01-01', pct: S(4.0, SRC.swaRatify.name, '2024', true, SRC.swaRatify.url) },
      { effective: '2028-01-01', pct: S(3.25, SRC.swaRatify.name, '2024', true, SRC.swaRatify.url) },
    ],
    retirement: {
      planType: 'DC + MBCB',
      companyPct: S(18, SRC.swaA2z.name, '2026-08', true, SRC.swaA2z.url, '18% non-elective'),
      mbcbPct: S(2, SRC.swaA2z.name, '2026-08', true, SRC.swaA2z.url, '2% market-based cash balance plan (2026)'),
      excessHandling: { value: 'cash', source: 'Default assumption', asOf: '2026-10', verified: false },
    },
    amendable: { value: '2029-01', source: SRC.swaA2z.name, url: SRC.swaA2z.url, asOf: '2026-08', verified: true },
    notes: ['Pay is per Trip for Pay (TFP), not per hour. “Credit hours” input is treated as TFP/month.', 'All-737 fleet: no widebody step.'],
  },

  fedex: {
    id: 'fedex',
    name: 'FedEx Express',
    code: 'FDX',
    kind: 'cargo',
    payUnit: 'hour',
    narrowbody: {
      fo: scale({ 1: est(125, 'FedEx yr-1 FO under 2026 CBA not seeded'), 12: S(332.49, SRC.bolt.name, '2026', true, SRC.bolt.url, 'Top widebody FO') }, 'FDX FO'),
      ca: scale({ 1: ca1(S(469, '', '2026', true), 'FDX'), 12: S(469, SRC.bolt.name, '2026', true, SRC.bolt.url, 'Top widebody CA') }, 'FDX CA'),
    },
    raises: [
      { effective: '2028-01-01', pct: S(3, `${SRC.fdxAlpa.name}; ${SRC.fdxDive.name}`, '2026-06', true, SRC.fdxAlpa.url, '+3%/yr 2028–2030') },
      { effective: '2029-01-01', pct: S(3, SRC.fdxAlpa.name, '2026-06', true, SRC.fdxAlpa.url) },
      { effective: '2030-01-01', pct: S(3, SRC.fdxAlpa.name, '2026-06', true, SRC.fdxAlpa.url) },
    ],
    retirement: {
      planType: 'DB pension / MBCB',
      companyPct: est(0, 'No company DC contribution seeded — FedEx’s primary company benefit is the DB pension / MBCB. Verify Pilot Savings Plan terms.'),
      mbcbPct: S(0, 'Legacy pension elected (default)', '2026-06', false, undefined, 'Set by pension election'),
      excessHandling: { value: 'cash', source: 'Default assumption', asOf: '2026-10', verified: false },
      pension: {
        maxAnnualBenefit: S(169_000, 'Derived: historical $130k cap × 1.30 (“30% increase to legacy pension”, ALPA summary)', '2026-06', false, SRC.fdxAlpa.url),
        fullServiceYears: est(25, 'Assumed service years for full legacy benefit'),
        faeCap: S(340_000, SRC.fdxCommentary.name, '2026', false, SRC.fdxCommentary.url, '$290k cap applies to pilots who switch to MBCB'),
        mbcbAltPct: S(9, SRC.fdxCommentary.name, '2026', false, SRC.fdxCommentary.url, '≈9% of pay through 2028, ≈10% after; varies by fleet/seat'),
        electionWindow: { value: 'Apr 2027 – May 30, 2027 (effective 1/1/2028)', source: SRC.fdxCommentary.name, url: SRC.fdxCommentary.url, asOf: '2026', verified: false,
          note: 'One-time, irrevocable. Pension default; closed to pilots hired on/after 6/29/2026.' },
      },
    },
    amendable: { value: '2030-12', source: SRC.fdxAlpa.name, url: SRC.fdxAlpa.url, asOf: '2026-06', verified: true },
    notes: ['CBA effective 6/29/2026; ~40% raise in 2026; +3%/yr 2028–2030.', 'Legacy pension + new Market Based Cash Balance plan (MBCB floor = total company credits).'],
  },

  united: {
    id: 'united',
    name: 'United Airlines (reference)',
    code: 'UAL',
    kind: 'major',
    payUnit: 'hour',
    narrowbody: {
      fo: scale({ 1: S(113, 'PROXY: American 2024 yr-1 FO', '2024', false), 2: yr2(AA_NB_FO12, 'UAL proxy'), 12: S(266.58, 'PROXY: American 737 12-yr FO — UAL scale not seeded', '2026', false) }, 'UAL FO'),
      ca: scale({ 1: ca1(AA_NB_CA12, 'UAL proxy'), 12: S(402.01, 'PROXY: American 737 12-yr CA — UAL scale not seeded', '2026', false) }, 'UAL CA'),
    },
    raises: [],
    retirement: {
      planType: 'DC',
      companyPct: S(18, `${SRC.aero.name}; ${SRC.bolt.name}`, '2026', true, SRC.aero.url),
      excessHandling: { value: 'cash', source: 'Default assumption', asOf: '2026-10', verified: false },
    },
    amendable: { value: 'Not seeded', source: 'Not in seed data', asOf: '2026-10', verified: false },
    notes: ['Reference path. Pay scale is an American proxy until a UAL scale is entered.'],
  },

  delta: {
    id: 'delta',
    name: 'Delta Air Lines (reference)',
    code: 'DAL',
    kind: 'major',
    payUnit: 'hour',
    narrowbody: {
      fo: scale({ 1: S(113, 'PROXY: American 2024 yr-1 FO', '2024', false), 2: yr2(AA_NB_FO12, 'DAL proxy'), 12: S(266.58, 'PROXY: American 737 12-yr FO — DAL scale not seeded', '2026', false) }, 'DAL FO'),
      ca: scale({ 1: ca1(AA_NB_CA12, 'DAL proxy'), 12: S(402.01, 'PROXY: American 737 12-yr CA — DAL scale not seeded', '2026', false) }, 'DAL CA'),
    },
    raises: [],
    retirement: {
      planType: 'DC',
      companyPct: S(18, `${SRC.aero.name}; ${SRC.bolt.name}`, '2026', true, SRC.aero.url),
      excessHandling: { value: 'cash', source: 'Default assumption', asOf: '2026-10', verified: false },
    },
    amendable: { value: 'Not seeded', source: 'Not in seed data', asOf: '2026-10', verified: false },
    notes: ['Reference path. Pay scale is an American proxy until a DAL scale is entered.'],
  },
};

export const FAA_MAX_AGE: Sourced = {
  value: 65,
  source: SRC.faa65.name,
  url: SRC.faa65.url,
  asOf: '2026-06',
  verified: true,
  note: 'Part 121 pilots may not serve past their 65th birthday.',
};

// ---------------------------------------------------------------- career path templates

export type PathId = 'envoy-aa' | 'regional-swa' | 'regional-fdx' | 'regional-ual' | 'regional-dal' | 'stay';

export interface PathTemplate {
  id: PathId;
  label: string;
  /** Regional leg (replaced with the pilot's current regional employer if they have one) */
  regional?: AirlineId;
  major: AirlineId;
  reference?: boolean;
  /** Default milestone years (editable) */
  defaults: { toRegional: number; regionalCaUpgrade: number; toMajor: number; majorCaUpgrade: number; widebody: number };
}

export const PATHS: Record<Exclude<PathId, 'stay'>, PathTemplate> = {
  'envoy-aa': {
    id: 'envoy-aa', label: 'Envoy → American', regional: 'envoy', major: 'american',
    defaults: { toRegional: 1, regionalCaUpgrade: 2, toMajor: 4, majorCaUpgrade: 8, widebody: 6 },
  },
  'regional-swa': {
    id: 'regional-swa', label: 'Regional → Southwest', regional: 'regional', major: 'southwest',
    defaults: { toRegional: 1, regionalCaUpgrade: 3, toMajor: 4, majorCaUpgrade: 7, widebody: 0 },
  },
  'regional-fdx': {
    id: 'regional-fdx', label: 'Regional → FedEx', regional: 'regional', major: 'fedex',
    defaults: { toRegional: 1, regionalCaUpgrade: 3, toMajor: 5, majorCaUpgrade: 9, widebody: 0 },
  },
  'regional-ual': {
    id: 'regional-ual', label: 'Regional → United (ref)', regional: 'regional', major: 'united', reference: true,
    defaults: { toRegional: 1, regionalCaUpgrade: 3, toMajor: 4, majorCaUpgrade: 8, widebody: 6 },
  },
  'regional-dal': {
    id: 'regional-dal', label: 'Regional → Delta (ref)', regional: 'regional', major: 'delta', reference: true,
    defaults: { toRegional: 1, regionalCaUpgrade: 3, toMajor: 4, majorCaUpgrade: 8, widebody: 6 },
  },
};

export const PATH_IDS = Object.keys(PATHS) as Exclude<PathId, 'stay'>[];
