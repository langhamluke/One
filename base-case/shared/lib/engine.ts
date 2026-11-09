/**
 * ENGINE ENTRY POINT.
 * computeDerived(state) runs the whole plan: risk profile -> allocation/glide path -> career/pay simulation per path
 * -> Social Security -> taxes/limits/cash-flow ledger -> Monte Carlo (active path) -> alerts/actions -> data quality.
 *
 * MUST stay pure (no React, no Node-only APIs) so it runs in the browser and on the server. It never throws on a valid
 * PlanState: inputs are clamped first (sanitizeState) and any unexpected failure degrades to an empty Derived with an
 * 'engine-error' alert rather than crashing the UI.
 */
import { CURRENT_YEAR, defaultAirlineConfig, defaultCareerPath, defaultPilotProfile, type CareerPath, type Debt, type Goal, type PlanState } from './inputs';
import type { Derived, MonteCarloResult, PathResult } from './derived';
import { riskProfile } from './scoring';
import { allocationFromEquity, modelEquity as modelEquityFor } from '../data/models';
import { buildGlidePath, expectedReturn, glideEquity, glideParams } from './glidepath';
import { simulatePath, type CareerSim } from './career';
import { estimateSocialSecurity } from './ss';
import { computeDebtSummary, computeEmergencyFund, runLedger, type LedgerOutput } from './plan';
import { runMonteCarlo } from './montecarlo';
import { buildAlerts } from './alerts';
import { buildActions } from './actions';
import { collectDataQuality } from './dataQuality';
import { ASSET_CLASSES } from './types';

export interface EngineOptions {
  /** Override Monte Carlo sims (UI uses fewer while dragging sliders) */
  sims?: number;
  /** Skip Monte Carlo (fast previews) */
  skipMonteCarlo?: boolean;
}

function now(): number {
  const p = (globalThis as { performance?: { now?: () => number } }).performance;
  return p && typeof p.now === 'function' ? p.now() : Date.now();
}

function cl(x: unknown, lo: number, hi: number, dflt: number): number {
  const v = typeof x === 'number' && Number.isFinite(x) ? x : dflt;
  return Math.min(hi, Math.max(lo, v));
}

/** Clamp absurd inputs so the projection stays finite. Returns a new object; the input is not mutated. */
export function sanitizeState(s: PlanState): PlanState {
  const p = s.profile;
  const age = cl(p.age, 16, 100, 22);
  const retirementAge = Math.max(age, cl(p.retirementAge, 30, 100, 67));
  const a = s.assumptions;
  const lifeExpectancy = Math.max(retirementAge + 1, cl(a.lifeExpectancy, age + 1, 110, 95));
  const cma = {} as PlanState['assumptions']['cma'];
  for (const k of ASSET_CLASSES) {
    const e = a.cma?.[k];
    cma[k] = { ret: cl(e?.ret, -0.5, 0.5, 0.05), vol: cl(e?.vol, 0, 1, 0.1) };
  }
  const wi = s.whatIf;
  const gs = wi.gradSchool;
  const paths: CareerPath[] = (s.careerPaths?.length ? s.careerPaths : [defaultCareerPath('path-1')]).map((cp) => ({
    ...cp,
    kind: cp.kind === 'airline' ? 'airline' : 'ladder',
    yearsOverrides: cp.yearsOverrides ?? {},
    startLevelIndex: cl(cp.startLevelIndex, 0, 50, 0),
    meritRaise: cl(cp.meritRaise, -0.5, 1, 0.03),
    industryDrift: cl(cp.industryDrift, -0.5, 0.5, 0),
    startYearOffset: cl(cp.startYearOffset, 0, 60, 0),
    preStartIncome: cl(cp.preStartIncome, 0, 1e8, 0),
    bonusPctOverride: cp.bonusPctOverride === undefined ? undefined : cl(cp.bonusPctOverride, 0, 5, 0),
    airline:
      cp.kind === 'airline'
        ? {
            ...defaultAirlineConfig(),
            ...(cp.airline ?? {}),
            milestones: Object.fromEntries(Object.entries(cp.airline?.milestones ?? {}).map(([k, v]) => [k, cl(v, 0, 40, 0)])),
            profitSharingPct: cl(cp.airline?.profitSharingPct, 0, 1, 0),
            payGrowthAfterContract: cl(cp.airline?.payGrowthAfterContract, -0.2, 0.2, 0.03),
          }
        : cp.airline,
  }));
  const pilot = p.pilot
    ? {
        ...defaultPilotProfile(),
        ...p.pilot,
        hours: cl(p.pilot.hours, 0, 50000, 0),
        yearsAtEmployer: cl(p.pilot.yearsAtEmployer, 0, 45, 0),
        creditHours: cl(p.pilot.creditHours, 0, 200, 80),
      }
    : paths.some((x) => x.kind === 'airline')
      ? defaultPilotProfile()
      : undefined;
  const debts: Debt[] = (s.debts ?? []).map((d) => ({
    ...d,
    balance: cl(d.balance, 0, 1e9, 0),
    rate: cl(d.rate, 0, 1, 0),
    extraPayment: d.extraPayment === undefined ? undefined : cl(d.extraPayment, 0, 1e7, 0),
    payment: d.payment === undefined ? undefined : cl(d.payment, 0, 1e7, 0),
    graceMonths: d.graceMonths === undefined ? undefined : cl(d.graceMonths, 0, 600, 0),
  }));
  const goals: Goal[] = (s.goals ?? []).map((g) => ({
    ...g,
    targetAmount: cl(g.targetAmount, 0, 1e9, 0),
    targetYear: cl(g.targetYear, CURRENT_YEAR, CURRENT_YEAR + 100, CURRENT_YEAR + 5),
    priority: cl(g.priority, 1, 100, 1),
    fundedSoFar: cl(g.fundedSoFar, 0, 1e9, 0),
  }));
  const b = s.benefits;
  const sv = s.savings;
  const activePathId = paths.some((x) => x.id === s.activePathId) ? s.activePathId : paths[0].id;
  return {
    ...s,
    profile: {
      ...p,
      pilot,
      age,
      retirementAge,
      dependents: cl(p.dependents, 0, 20, 0),
      spouseIncome: cl(p.spouseIncome, 0, 1e8, 0),
      livingExpenses: cl(p.livingExpenses, 0, 1e8, 0),
      housingCost: cl(p.housingCost, 0, 1e8, 0),
      customStateRate: p.customStateRate === undefined ? undefined : cl(p.customStateRate, 0, 0.5, 0),
      stateCode: typeof p.stateCode === 'string' ? p.stateCode : 'CUSTOM',
    },
    balanceSheet: {
      cash: cl(s.balanceSheet?.cash, 0, 1e10, 0),
      taxable: cl(s.balanceSheet?.taxable, 0, 1e10, 0),
      preTax: cl(s.balanceSheet?.preTax, 0, 1e10, 0),
      roth: cl(s.balanceSheet?.roth, 0, 1e10, 0),
      hsa: cl(s.balanceSheet?.hsa, 0, 1e10, 0),
      otherAssets: cl(s.balanceSheet?.otherAssets, 0, 1e10, 0),
    },
    debts,
    goals,
    benefits: {
      ...b,
      matchRate: cl(b.matchRate, 0, 5, 1),
      matchCapPct: cl(b.matchCapPct, 0, 1, 0.04),
      nonElectivePct: cl(b.nonElectivePct, 0, 1, 0),
      employerHsaContribution: cl(b.employerHsaContribution, 0, 1e5, 0),
      employerLoanRepayment: cl(b.employerLoanRepayment, 0, 1e5, 0),
      lifeCoverageMultiple: cl(b.lifeCoverageMultiple, 0, 20, 0),
      pension: {
        ...b.pension,
        multiplier: cl(b.pension?.multiplier, 0, 0.1, 0.02),
        employeeContribPct: cl(b.pension?.employeeContribPct, 0, 0.5, 0.08),
        vestingYears: cl(b.pension?.vestingYears, 0, 30, 5),
        normalRetirementAge: cl(b.pension?.normalRetirementAge, 40, 80, 65),
      },
      equityComp: {
        annualRsuValue: cl(b.equityComp?.annualRsuValue, 0, 1e8, 0),
        esppDiscount: cl(b.equityComp?.esppDiscount, 0, 0.5, 0),
        esppContribPct: cl(b.equityComp?.esppContribPct, 0, 0.15, 0),
      },
    },
    savings: {
      ...sv,
      deferralPct: cl(sv.deferralPct, 0, 1, 0.06),
      rothSplit: cl(sv.rothSplit, 0, 1, 0.5),
      hsaContribution: cl(sv.hsaContribution, 0, 1e5, 0),
      iraContribution: cl(sv.iraContribution, 0, 1e5, 0),
      taxableContribution: cl(sv.taxableContribution, 0, 1e8, 0),
      emergencyFundMonthsOverride: sv.emergencyFundMonthsOverride === undefined ? undefined : cl(sv.emergencyFundMonthsOverride, 0, 36, 6),
    },
    careerPaths: paths,
    activePathId,
    whatIf: {
      ...wi,
      promotionDelayYears: cl(wi.promotionDelayYears, 0, 30, 0),
      layoffGapMonths: cl(wi.layoffGapMonths, 0, 120, 0),
      layoffYearOffset: cl(wi.layoffYearOffset, 0, 60, 3),
      extraSavingsRatePct: cl(wi.extraSavingsRatePct, 0, 1, 0),
      spendingCut: cl(wi.spendingCut, -1e7, 1e7, 0),
      upgradeDelayYears: cl(wi.upgradeDelayYears, 0, 20, 0),
      furloughYears: cl(wi.furloughYears, 0, 10, 0),
      retireAtOverride: wi.retireAtOverride === undefined ? undefined : Math.max(age, cl(wi.retireAtOverride, 30, 100, retirementAge)),
      gradSchool: {
        ...gs,
        startYearOffset: cl(gs?.startYearOffset, 0, 40, 3),
        years: cl(gs?.years, 0, 10, 2),
        annualCost: cl(gs?.annualCost, 0, 1e6, 40000),
        financedPct: cl(gs?.financedPct, 0, 1, 0.75),
        loanRate: cl(gs?.loanRate, 0, 0.3, 0.0807),
        incomeDuring: cl(gs?.incomeDuring, 0, 1e7, 0),
        postLevelIndex: cl(gs?.postLevelIndex, 0, 50, 1),
        postPremium: cl(gs?.postPremium, -0.9, 5, 0.2),
      },
    },
    assumptions: {
      ...a,
      inflation: cl(a.inflation, -0.02, 0.15, 0.025),
      cma,
      glideYears: cl(a.glideYears, 0, 60, 25),
      landingEquity: cl(a.landingEquity, 0, 1, 0.45),
      equityOverride: a.equityOverride === undefined ? undefined : cl(a.equityOverride, 0, 1, 0.6),
      mcSims: cl(a.mcSims, 0, 20000, 1000),
      seed: cl(a.seed, 0, 2 ** 32 - 1, 1),
      incomeReplacement: cl(a.incomeReplacement, 0, 3, 0.7),
      retirementSpendingOverride: a.retirementSpendingOverride === undefined ? undefined : cl(a.retirementSpendingOverride, 0, 1e8, 0),
      ssClaimAge: cl(a.ssClaimAge, 62, 70, 67),
      ssOverrideAnnual: a.ssOverrideAnnual === undefined ? undefined : cl(a.ssOverrideAnnual, 0, 1e6, 0),
      ssHaircut: cl(a.ssHaircut, 0, 1, 0),
      taxGrossUp: cl(a.taxGrossUp, 0, 1, 0.15),
      lifeExpectancy,
      emergencyMonthsDefault: cl(a.emergencyMonthsDefault, 0, 36, 6),
      cashYield: cl(a.cashYield, -0.1, 0.3, 0.035),
      lifestyleCreep: cl(a.lifestyleCreep, -0.1, 0.1, 0),
      indexing: a.indexing === undefined ? undefined : cl(a.indexing, -0.02, 0.15, 0.025),
    },
  };
}

function emptyMc(seed: number, retirementAge: number): MonteCarloResult {
  return { ages: [], p10: [], p50: [], p90: [], p10Real: [], p50Real: [], p90Real: [], successProbability: 0, medianAtRetirement: 0, medianAtRetirementReal: 0, targetIncomeReal: 0, deterministic: [], sims: 0, seed, retirementAge };
}

function emptyPath(id: string, name: string): PathResult {
  return { pathId: id, name, rows: [], waypoints: [], lifetimeEarnings: 0, startingSalary: 0, peakSalary: 0, netWorthAtRetirement: 0, debtFreeAge: null, firstIncomeYearIndex: 0 };
}

export function computeDerived(state: PlanState, opts: EngineOptions = {}): Derived {
  const t0 = now();
  try {
    return compute(state, opts, t0);
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    const id = state?.activePathId ?? 'path-1';
    const path = emptyPath(id, 'Path');
    return {
      profile: { riskScore: null, horizonScore: null, risk: 'Moderate', horizon: 'Long-term', provisional: true, answered: 0, total: 10 },
      allocation: allocationFromEquity(0.6),
      modelEquity: 0.6,
      glidePath: [],
      paths: [path],
      active: path,
      mc: emptyMc(state?.assumptions?.seed ?? 0, state?.profile?.retirementAge ?? 67),
      alerts: [{ id: 'engine-error', severity: 'warning', title: 'The plan could not be computed', detail: message }],
      actions: [],
      emergency: { monthsTarget: 6, monthlyEssentials: 0, target: 0, current: 0, monthsCovered: 0, reason: 'unavailable' },
      tax: { year: CURRENT_YEAR, gross: 0, pretaxDeductions: 0, standardDeduction: 0, taxableIncome: 0, federalTax: 0, stateTax: 0, fica: 0, totalTax: 0, effectiveRate: 0, marginalFederalRate: 0, takeHome: 0 },
      ss: { annualAtClaim: 0, claimAge: 67, aime: 0, pia: 0, method: 'none', note: 'unavailable' },
      debt: { totalBalance: 0, monthlyPayment: 0, highestRate: 0, highInterestBalance: 0, studentLoanBalance: 0, payoffAge: null, totalInterest: 0, forgivenTotal: 0 },
      dataQuality: { unverifiedCount: 0, userProvidedCount: 0, items: [] },
      headline: { netWorth: 0, savingsRate: 0, savingsRateWithEmployer: 0, successProbability: 0, medianAtRetirementReal: 0, emergencyMonthsCovered: 0, debtFreeAge: null, year1TakeHome: 0, year1CashFlow: 0 },
      computeMs: now() - t0,
    };
  }
}

function compute(raw: PlanState, opts: EngineOptions, t0: number): Derived {
  const state = sanitizeState(raw);
  const a = state.assumptions;

  // 1. Profile -> model equity -> glide path -> today's allocation
  const profile = riskProfile(state);
  const modelEquity = a.equityOverride ?? modelEquityFor(profile.risk, profile.horizon);
  const gp = glideParams(state, modelEquity);
  const glidePath = buildGlidePath(state, modelEquity);
  const allocation = allocationFromEquity(glideEquity(state.profile.age, gp));
  const todayReturn = expectedReturn(allocation, a.cma);

  // 2. Each career path: simulate -> SS -> ledger
  const sims: CareerSim[] = [];
  const ledgers: LedgerOutput[] = [];
  const ssByPath: ReturnType<typeof estimateSocialSecurity>[] = [];
  for (const path of state.careerPaths) {
    const sim = simulatePath(state, path, state.whatIf);
    const ss = estimateSocialSecurity(state, sim.rows);
    const ledger = runLedger(state, sim, { modelEquity, ss });
    sims.push(sim);
    ssByPath.push(ss);
    ledgers.push(ledger);
  }
  let activeIdx = state.careerPaths.findIndex((p) => p.id === state.activePathId);
  if (activeIdx < 0) activeIdx = 0;
  const active = ledgers[activeIdx];
  const ss = ssByPath[activeIdx];
  const paths = ledgers.map((l) => l.path);

  // 3. Monte Carlo on the active path
  const rows = active.path.rows;
  const ages = rows.map((r) => r.age);
  const allocations = rows.map((r) => allocationFromEquity(r.equityPct));
  const bs = state.balanceSheet;
  const mcOut = runMonteCarlo({
    startBalance: bs.preTax + bs.roth + bs.hsa + bs.taxable,
    contributions: active.contributions,
    withdrawals: active.withdrawals,
    allocations,
    ages,
    cma: a.cma,
    inflation: a.inflation,
    sims: opts.sims ?? a.mcSims,
    seed: a.seed,
    retirementIndex: active.retirementIndex,
    retirementAge: state.whatIf.retireAtOverride ?? state.profile.retirementAge,
    targetIncomeReal: active.targetIncomeReal,
    skip: opts.skipMonteCarlo,
  });
  const { flags: mcFlags, ...mc } = mcOut;

  // 4. Readouts
  const emergency = computeEmergencyFund(state, rows);
  const tax = active.tax;
  const debt = computeDebtSummary(state, active, todayReturn);
  const dataQuality = collectDataQuality(state, { sims, usage: active.usage });
  const alerts = buildAlerts({ state, active: active.path, ledger: active, mc, emergency, profile, ss, dataQuality, expectedReturn: todayReturn });
  if (mcFlags.includes('correlation-jittered')) {
    alerts.push({ id: 'correlation-jittered', severity: 'advisory', title: 'Correlation matrix was regularised', detail: 'The asset correlation matrix was not positive-definite; a tiny diagonal jitter was added for the simulation.', advisorOnly: true });
  }
  const actions = buildActions({ state, active: active.path, ledger: active, emergency });
  const first = rows[active.path.firstIncomeYearIndex] ?? rows[0];
  const startNetWorth = bs.cash + bs.taxable + bs.preTax + bs.roth + bs.hsa + bs.otherAssets + state.goals.reduce((s, g) => s + g.fundedSoFar, 0) - state.debts.reduce((s, d) => s + d.balance, 0);
  const headline = {
    netWorth: startNetWorth,
    savingsRate: first?.savingsRate ?? 0,
    savingsRateWithEmployer: first?.savingsRateWithEmployer ?? 0,
    successProbability: mc.successProbability,
    medianAtRetirementReal: mc.medianAtRetirementReal,
    emergencyMonthsCovered: emergency.monthsCovered,
    debtFreeAge: active.path.debtFreeAge,
    year1TakeHome: first?.takeHome ?? 0,
    year1CashFlow: first?.cashFlow ?? 0,
  };

  return {
    profile,
    allocation,
    modelEquity,
    glidePath,
    paths,
    active: active.path,
    mc,
    alerts,
    actions,
    emergency,
    tax,
    ss,
    debt,
    dataQuality,
    headline,
    computeMs: now() - t0,
  };
}
