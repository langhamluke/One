/**
 * Compact, de-identified plan summary used as the ONLY context for the assistant.
 * PlanState minus notes, plus the engine's headline/alerts/actions/first 10 year rows when computeDerived works.
 * Numbers are rounded; no emails, no other clients.
 */
import { isPilotPlan, type PlanState } from '../../shared/lib/inputs';
import type { Derived } from '../../shared/lib/derived';
import { computeDerived } from '../../shared/lib/engine';
import { IRS_AS_OF, TAX_YEAR, WAGES_AS_OF, LOANS_AS_OF, SS_AS_OF } from '../../shared/data';
import { AIRLINES_AS_OF } from '../../shared/data/airlines';
import type { ProductKey } from '../../shared/product';

export interface PlanContext {
  /** Product the plan belongs to ('base-case' graduates, 'flight-plan' airline pilots) */
  product: ProductKey;
  /** Plan inputs without free-text notes */
  inputs: Record<string, unknown>;
  derived: DerivedSummary | null;
  derivedError: string | null;
  dataAsOf: { irs: string; taxYear: number; wages: string; loans: string; ssa: string; airlines?: string };
}

export interface DerivedSummary {
  headline: Derived['headline'];
  profile: { risk: string; horizon: string; provisional: boolean; answered: number; total: number };
  allocation: Record<string, number>;
  modelEquity: number;
  emergency: Derived['emergency'];
  tax: Derived['tax'];
  debt: Derived['debt'];
  ss: { annualAtClaim: number; claimAge: number; method: string };
  alerts: { id: string; severity: string; title: string; detail: string }[];
  actions: { rank: number; category: string; title: string; detail: string; amount?: number }[];
  years: Record<string, number | string>[];
  paths: { id: string; name: string; startingSalary: number; peakSalary: number; lifetimeEarnings: number; netWorthAtRetirement: number; debtFreeAge: number | null }[];
  dataQuality: { unverifiedCount: number; userProvidedCount: number; unverified: { label: string; source: string; asOf: string }[] };
  retirement: { targetIncomeReal: number; retirementAge: number; currentAge: number; investableNow: number; expectedReturnYear1: number; inflation: number; successProbability: number; medianAtRetirementReal: number; lifeExpectancy: number };
}

export function round(x: unknown, digits = 0): unknown {
  if (typeof x !== 'number' || !Number.isFinite(x)) return x;
  const f = 10 ** digits;
  return Math.round(x * f) / f;
}

/** Deep-round every number in an object tree (rates keep 4 decimals, money 0). */
export function roundTree(value: unknown, depth = 0): unknown {
  if (depth > 12) return undefined;
  if (typeof value === 'number') return Math.abs(value) < 10 ? round(value, 4) : round(value, 0);
  if (Array.isArray(value)) return value.map((v) => roundTree(v, depth + 1));
  if (value && typeof value === 'object') {
    const out: Record<string, unknown> = {};
    for (const [k, v] of Object.entries(value as Record<string, unknown>)) out[k] = roundTree(v, depth + 1);
    return out;
  }
  return value;
}

export function summarizeDerived(d: Derived): DerivedSummary {
  const rows = d.active?.rows ?? [];
  return roundTree({
    headline: d.headline,
    profile: { risk: d.profile.risk, horizon: d.profile.horizon, provisional: d.profile.provisional, answered: d.profile.answered, total: d.profile.total },
    allocation: d.allocation,
    modelEquity: d.modelEquity,
    emergency: d.emergency,
    tax: d.tax,
    debt: d.debt,
    ss: { annualAtClaim: d.ss.annualAtClaim, claimAge: d.ss.claimAge, method: d.ss.method },
    alerts: (d.alerts ?? []).slice(0, 12).map((a) => ({ id: a.id, severity: a.severity, title: a.title, detail: a.detail })),
    actions: (d.actions ?? []).slice(0, 10).map((a) => ({ rank: a.rank, category: a.category, title: a.title, detail: a.detail, amount: a.amount })),
    years: rows.slice(0, 10).map((r) => ({
      year: r.year,
      age: r.age,
      stage: r.stage,
      level: r.levelTitle,
      ...(r.airline ? { airline: r.airline.id, seat: r.airline.seat, rate: r.airline.rate } : {}),
      wages: r.wages,
      grossIncome: r.grossIncome,
      takeHome: r.takeHome,
      livingExpenses: r.livingExpenses,
      debtService: r.debtService,
      cashFlow: r.cashFlow,
      savingsRate: r.savingsRate,
      netWorth: r.netWorth,
      debtBalance: r.debtBalance,
      investable: r.investable,
    })),
    paths: (d.paths ?? []).map((p) => ({
      id: p.pathId,
      name: p.name,
      startingSalary: p.startingSalary,
      peakSalary: p.peakSalary,
      lifetimeEarnings: p.lifetimeEarnings,
      netWorthAtRetirement: p.netWorthAtRetirement,
      debtFreeAge: p.debtFreeAge,
    })),
    retirement: {
      targetIncomeReal: d.mc.targetIncomeReal,
      retirementAge: d.mc.retirementAge,
      currentAge: rows[0]?.age ?? 0,
      investableNow: rows[0]?.investable ?? 0,
      expectedReturnYear1: rows[0]?.expectedReturn ?? 0,
      inflation: 0,
      successProbability: d.mc.successProbability,
      medianAtRetirementReal: d.mc.medianAtRetirementReal,
      lifeExpectancy: d.mc.ages.length ? d.mc.ages[d.mc.ages.length - 1] : 95,
    },
    dataQuality: {
      unverifiedCount: d.dataQuality.unverifiedCount,
      userProvidedCount: d.dataQuality.userProvidedCount,
      unverified: d.dataQuality.items
        .filter((i) => !i.verified)
        .slice(0, 8)
        .map((i) => ({ label: i.label, source: i.source, asOf: i.asOf })),
    },
  }) as DerivedSummary;
}

export function buildPlanContext(state: PlanState): PlanContext {
  const { notes: _notes, ...rest } = state;
  const inputs = roundTree(rest) as Record<string, unknown>;
  let derived: DerivedSummary | null = null;
  let derivedError: string | null = null;
  try {
    const d = computeDerived(state, { sims: 400 });
    derived = summarizeDerived(d);
  } catch (err) {
    derivedError = err instanceof Error ? err.message.slice(0, 200) : 'engine unavailable';
  }
  const product: ProductKey = isPilotPlan(state) ? 'flight-plan' : 'base-case';
  return { product, inputs, derived, derivedError, dataAsOf: { irs: IRS_AS_OF, taxYear: TAX_YEAR, wages: WAGES_AS_OF, loans: LOANS_AS_OF, ssa: SS_AS_OF, ...(product === 'flight-plan' ? { airlines: AIRLINES_AS_OF } : {}) } };
}
