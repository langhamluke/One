import {
  ASSET_CLASSES,
  type AssetClass,
  type Holding,
  type Insight,
  type RiskProfile,
} from './types';

export const clamp = (x: number, lo = 0, hi = 1) => Math.min(hi, Math.max(lo, x));

/** Linear ramp: 1 at or below `good`, 0 at or above `bad` (works for either direction). */
export function ramp(x: number, good: number, bad: number): number {
  if (good === bad) return x <= good ? 1 : 0;
  return clamp((bad - x) / (bad - good));
}

/** Simple, transparent target mixes used to grade a portfolio's asset mix. */
export type MixBucket = 'us' | 'intl' | 'bonds' | 'cash' | 'other';

export const MIX_BUCKET_LABELS: Record<MixBucket, string> = {
  us: 'U.S. stocks',
  intl: 'International stocks',
  bonds: 'Bonds',
  cash: 'Cash',
  other: 'Real estate & other',
};

export const TARGET_MIX: Record<RiskProfile, Record<MixBucket, number>> = {
  cautious: { us: 0.35, intl: 0.15, bonds: 0.4, cash: 0.1, other: 0 },
  balanced: { us: 0.5, intl: 0.2, bonds: 0.25, cash: 0.05, other: 0 },
  growth: { us: 0.6, intl: 0.3, bonds: 0.1, cash: 0, other: 0 },
  aggressive: { us: 0.65, intl: 0.35, bonds: 0, cash: 0, other: 0 },
};

const BUCKET_OF: Record<AssetClass, MixBucket | null> = {
  usStocks: 'us',
  intlStocks: 'intl',
  emStocks: 'intl',
  bonds: 'bonds',
  cash: 'cash',
  realEstate: 'other',
  commodities: 'other',
  crypto: null, // graded separately as "speculative"
};

const EQUITY: AssetClass[] = ['usStocks', 'intlStocks', 'emStocks'];

export interface ScoreComponent {
  key: string;
  label: string;
  /** Points earned. */
  points: number;
  max: number;
  explanation: string;
}

export interface PortfolioAnalysis {
  total: number;
  byClass: Record<AssetClass, number>; // fractions of total
  bySector: { sector: string; weight: number }[];
  byHolding: { id: string; symbol: string; weight: number; kind: Holding['kind'] }[];
  mix: Record<MixBucket, number>; // fractions, excluding crypto
  internationalShareOfStocks: number;
  largestSingle: { symbol: string; weight: number } | null;
  speculativeShare: number;
  individualStockShare: number;
  weightedExpenseRatio: number;
  annualFees: number;
  score: number;
  grade: string;
  components: ScoreComponent[];
  insights: Insight[];
}

const SINGLE_NAME_KINDS = new Set<Holding['kind']>(['stock', 'crypto']);

export function analyzePortfolio(holdings: Holding[], profile: RiskProfile): PortfolioAnalysis {
  const valid = holdings.filter((h) => h.value > 0);
  const total = valid.reduce((s, h) => s + h.value, 0);

  const byClass = Object.fromEntries(ASSET_CLASSES.map((c) => [c, 0])) as Record<AssetClass, number>;
  const sectorTotals = new Map<string, number>();
  let fees = 0;

  for (const h of valid) {
    const w = total ? h.value / total : 0;
    const expSum = Object.values(h.exposure).reduce((s, x) => s + (x ?? 0), 0) || 1;
    for (const c of ASSET_CLASSES) byClass[c] += (w * (h.exposure[c] ?? 0)) / expSum;
    const secSum = Object.values(h.sectors).reduce((s, x) => s + x, 0) || 1;
    for (const [sec, x] of Object.entries(h.sectors)) {
      sectorTotals.set(sec, (sectorTotals.get(sec) ?? 0) + (w * x) / secSum);
    }
    fees += h.value * h.expenseRatio;
  }

  const bySector = [...sectorTotals.entries()]
    .map(([sector, weight]) => ({ sector, weight }))
    .sort((a, b) => b.weight - a.weight);

  const byHolding = valid
    .map((h) => ({ id: h.id, symbol: h.symbol, weight: total ? h.value / total : 0, kind: h.kind }))
    .sort((a, b) => b.weight - a.weight);

  const singles = byHolding.filter((h) => SINGLE_NAME_KINDS.has(h.kind));
  const largestSingle = singles[0] ? { symbol: singles[0].symbol, weight: singles[0].weight } : null;
  const individualStockShare = byHolding.filter((h) => h.kind === 'stock').reduce((s, h) => s + h.weight, 0);
  const speculativeShare = byClass.crypto;

  // Asset mix excluding crypto, renormalised.
  const mix: Record<MixBucket, number> = { us: 0, intl: 0, bonds: 0, cash: 0, other: 0 };
  const nonCrypto = 1 - byClass.crypto;
  for (const c of ASSET_CLASSES) {
    const b = BUCKET_OF[c];
    if (b && nonCrypto > 0) mix[b] += byClass[c] / nonCrypto;
  }

  const equity = EQUITY.reduce((s, c) => s + byClass[c], 0);
  const internationalShareOfStocks = equity > 0 ? (byClass.intlStocks + byClass.emStocks) / equity : 0;
  const weightedExpenseRatio = total ? fees / total : 0;

  // ---------- Score components (sum of max = 100) ----------
  const components: ScoreComponent[] = [];

  // 1. Single-name concentration (25)
  const top = largestSingle?.weight ?? 0;
  components.push({
    key: 'concentration',
    label: 'No single bet too big',
    points: 25 * ramp(top, 0.05, 0.4),
    max: 25,
    explanation: largestSingle
      ? `Your largest single company/coin is ${largestSingle.symbol} at ${pct(top)} of your portfolio. Under 5% is ideal.`
      : 'You don’t rely on any single company — your money is spread through funds.',
  });

  // 2. Breadth (20): how much of the money sits in something already diversified.
  const nStocks = singles.filter((h) => h.kind === 'stock').length;
  let breadth = 0;
  for (const h of valid) {
    const w = h.value / total;
    if (h.kind === 'stock') breadth += w * Math.min(1, nStocks / 25);
    else if (h.kind === 'crypto') breadth += 0;
    else {
      const broad = h.sectors['Broad market'] ?? (h.sectors['Bonds'] || h.sectors['Cash'] ? 1 : 0);
      breadth += w * (broad + (1 - broad) * 0.4);
    }
  }
  components.push({
    key: 'breadth',
    label: 'Spread across many companies',
    points: 20 * clamp(breadth),
    max: 20,
    explanation: `About ${pct(clamp(breadth))} of your money is in broadly diversified holdings (index funds, bond funds, or 25+ stocks).`,
  });

  // 3. Sector balance (15) — exposure to one non-broad sector.
  const namedSectors = bySector.filter((s) => !['Broad market', 'Bonds', 'Cash'].includes(s.sector));
  const topSector = namedSectors[0];
  components.push({
    key: 'sectors',
    label: 'Balanced across industries',
    points: 15 * ramp(topSector?.weight ?? 0, 0.2, 0.6),
    max: 15,
    explanation: topSector
      ? `${pct(topSector.weight)} of your portfolio is concentrated in ${topSector.sector} (on top of what your index funds already hold).`
      : 'No single industry dominates your portfolio.',
  });

  // 4. Geography (15)
  const geo =
    equity <= 0
      ? 0.5
      : internationalShareOfStocks < 0.2
        ? 0.25 + 0.75 * (internationalShareOfStocks / 0.2)
        : internationalShareOfStocks <= 0.5
          ? 1
          : 1 - 0.5 * ((internationalShareOfStocks - 0.5) / 0.5);
  components.push({
    key: 'geography',
    label: 'Global, not just U.S.',
    points: 15 * geo,
    max: 15,
    explanation:
      equity > 0
        ? `${pct(internationalShareOfStocks)} of your stocks are outside the U.S. Many investors aim for roughly 20–40%.`
        : 'You don’t own stocks yet, so there’s no geographic mix to grade.',
  });

  // 5. Asset mix fit (15) — half the L1 distance to the profile's target mix.
  const target = TARGET_MIX[profile];
  const distance =
    (Object.keys(target) as MixBucket[]).reduce((s, b) => s + Math.abs(mix[b] - target[b]), 0) / 2;
  components.push({
    key: 'mix',
    label: 'Fits your risk level',
    points: 15 * ramp(distance, 0.05, 0.6),
    max: 15,
    explanation: `Your stock/bond/cash mix is ${pct(distance)} away from a typical ${profile} mix.`,
  });

  // 6. Speculative exposure (10)
  components.push({
    key: 'speculative',
    label: 'Speculation kept small',
    points: 10 * ramp(speculativeShare, 0.05, 0.3),
    max: 10,
    explanation: `${pct(speculativeShare)} of your portfolio is in crypto. Keeping speculative assets under ~5% limits the damage if they crash.`,
  });

  const score = total > 0 ? Math.round(components.reduce((s, c) => s + c.points, 0)) : 0;
  const grade =
    total <= 0
      ? 'No holdings yet'
      : score >= 85
        ? 'Well diversified'
        : score >= 70
          ? 'Solid foundation'
          : score >= 50
            ? 'Needs some work'
            : 'Highly concentrated';

  const analysis: PortfolioAnalysis = {
    total,
    byClass,
    bySector,
    byHolding,
    mix,
    internationalShareOfStocks,
    largestSingle,
    speculativeShare,
    individualStockShare,
    weightedExpenseRatio,
    annualFees: fees,
    score,
    grade,
    components,
    insights: [],
  };
  analysis.insights = portfolioInsights(analysis, valid, profile);
  return analysis;
}

function portfolioInsights(a: PortfolioAnalysis, holdings: Holding[], profile: RiskProfile): Insight[] {
  const out: Insight[] = [];
  if (a.total <= 0) {
    out.push({
      id: 'empty',
      severity: 'info',
      title: 'Add your first holding',
      detail:
        'Add what you own (or what you’re thinking of buying) to see how diversified it is. Not investing yet? Try a sample portfolio to explore.',
      learn: 'You can start investing with as little as $1 using fractional shares at most major brokerages.',
    });
    return out;
  }

  if (a.largestSingle && a.largestSingle.weight > 0.2) {
    out.push({
      id: 'single-name',
      severity: a.largestSingle.weight > 0.4 ? 'alert' : 'warn',
      title: `${a.largestSingle.symbol} is ${pct(a.largestSingle.weight)} of your portfolio`,
      detail: `If ${a.largestSingle.symbol} dropped 50%, your whole portfolio would fall about ${pct(a.largestSingle.weight * 0.5)}. Consider directing new money into a broad index fund until no single position is above ~10%.`,
      learn:
        'Even famous companies can crash: plenty of household names have lost more than half their value in a single year. A total-market fund holds thousands of companies, so one bad apple barely moves it.',
    });
  }

  if (a.individualStockShare > 0.5) {
    out.push({
      id: 'stock-picking',
      severity: 'warn',
      title: `${pct(a.individualStockShare)} of your money is in individual stocks`,
      detail:
        'A common approach is a “core and explore” setup: keep ~80–90% in low-cost index funds (the core) and use 10–20% for individual picks you’re excited about (explore).',
      learn:
        'Over long periods, most professional fund managers fail to beat a simple index fund after fees — so a low-cost index core is a strong default.',
    });
  }

  const topSector = a.bySector.find((s) => !['Broad market', 'Bonds', 'Cash'].includes(s.sector));
  if (topSector && topSector.weight > 0.3) {
    out.push({
      id: 'sector',
      severity: topSector.weight > 0.5 ? 'alert' : 'warn',
      title: `Heavy tilt toward ${topSector.sector}`,
      detail: `${pct(topSector.weight)} of your portfolio is a direct bet on ${topSector.sector}. Broad index funds already hold plenty of it, so extra sector bets add risk without much extra diversification.`,
      learn: 'Sectors go in and out of favor. Tech stocks fell roughly 80% from 2000 to 2002, and energy stocks went nowhere for about a decade after 2008.',
    });
  }

  const equity = a.byClass.usStocks + a.byClass.intlStocks + a.byClass.emStocks;
  if (equity > 0.2 && a.internationalShareOfStocks < 0.1) {
    out.push({
      id: 'intl',
      severity: 'info',
      title: 'Your stocks are almost all U.S.',
      detail:
        'Adding a total international fund (like VXUS or IXUS) spreads your money across thousands of companies in dozens of countries.',
      learn: 'The U.S. is roughly 60% of the global stock market. Other markets have led for long stretches, like the 2000s.',
    });
  }

  if (a.speculativeShare > 0.1) {
    out.push({
      id: 'crypto',
      severity: a.speculativeShare > 0.25 ? 'alert' : 'warn',
      title: `${pct(a.speculativeShare)} in crypto`,
      detail: 'Crypto can swing 50%+ in months. Many guides suggest keeping speculative assets to money you could afford to lose — often 5% or less.',
      learn: 'Bitcoin has fallen more than 70% from its peak several times.',
    });
  }

  if (a.weightedExpenseRatio > 0.0025) {
    out.push({
      id: 'fees',
      severity: 'warn',
      title: `You pay ${pctFine(a.weightedExpenseRatio)} a year in fund fees`,
      detail: `That’s about $${a.annualFees.toFixed(2)} per year right now. Low-cost index funds charge 0.03%–0.10%.`,
      learn: 'Fees compound too: a 1% fee can eat roughly a quarter of your ending balance over 30 years.',
    });
  } else if (holdings.some((h) => h.kind !== 'stock' && h.kind !== 'crypto' && h.kind !== 'cash')) {
    out.push({
      id: 'fees-good',
      severity: 'good',
      title: 'Your fund fees are low',
      detail: `Your average expense ratio is ${pctFine(a.weightedExpenseRatio)}. Low fees mean more of the return stays with you.`,
    });
  }

  const target = TARGET_MIX[profile];
  if (a.mix.cash > target.cash + 0.2) {
    out.push({
      id: 'cash-drag',
      severity: 'info',
      title: 'Lots of uninvested cash',
      detail:
        'Cash in a brokerage account is often earning little. If this is long-term money, you could invest it. If it’s your emergency fund, a high-yield savings account is a better home.',
    });
  }
  if (target.bonds >= 0.2 && a.mix.bonds < target.bonds / 2) {
    out.push({
      id: 'bonds',
      severity: 'info',
      title: 'Fewer bonds than your risk level suggests',
      detail: `A ${profile} investor often holds ~${pct(target.bonds)} in bonds to soften crashes. A total bond fund (BND or AGG) is a simple option.`,
    });
  }

  if (a.score >= 85) {
    out.push({
      id: 'great',
      severity: 'good',
      title: 'Nice work — this is a well-diversified portfolio',
      detail: 'The best next step is usually boring: keep adding money regularly and rebalance about once a year.',
    });
  }
  return out;
}

export const pct = (x: number, digits = 0) => `${(x * 100).toFixed(digits)}%`;
export const pctFine = (x: number) => `${(x * 100).toFixed(2)}%`;

/** How much a given annual fee costs over time versus a fee-free version (for teaching). */
export function feeDrag(start: number, monthly: number, annualReturn: number, fee: number, years: number) {
  const grow = (r: number) => {
    let v = start;
    const m = Math.pow(1 + r, 1 / 12) - 1;
    for (let i = 0; i < years * 12; i++) v = v * (1 + m) + monthly;
    return v;
  };
  const without = grow(annualReturn);
  const withFee = grow(annualReturn - fee);
  return { without, withFee, lost: without - withFee };
}
