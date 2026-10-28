import { AIRLINES, type AirlineId, type PathId } from '../data/airlines';
import { MODELS, equityPct } from '../data/models';
import { STATE_TAX_OPTIONS } from '../data/tax2026';
import { buildGlidePath, type GlidePoint } from './glidepath';
import { milestonesFor, type PlanState } from './inputs';
import { catchUpMustBeRoth, computeDC, hsaLimit, payWhere415cBinds, rothIraEligibility, type RothIraStatus } from './limits';
import { deterministicPath, expectedReturn, runMonteCarlo, type MCResult } from './montecarlo';
import { buildCareer, PLAN_START_YEAR, type Career, type CareerYear } from './payroll';
import { emergencyFundMonths, horizonCategory, scoreAnswers, type ScoreResult } from './scoring';
import { computeTaxes, type TaxResult } from './tax';
import type { Allocation, ExcessHandling, FilingStatus, HorizonCategory, RiskCategory } from './types';

export interface Buckets { pretax: number; roth: number; hsa: number; taxable: number; mbcb: number }

export interface YearRow extends CareerYear {
  index: number;
  wages: number;
  spouseWages: number;
  employeeDeferral: number;
  rothDeferral: number;
  pretaxDeferral: number;
  catchUp: number;
  catchUpRoth: boolean;
  company: number;
  companyIntended: number;
  companyPct: number;
  excess: number;
  excessHandling: ExcessHandling;
  cashInLieu: number;
  mbcbCredit: number;
  hsa: number;
  ira: number;
  iraStatus: RothIraStatus | 'off';
  magi: number;
  taxes: TaxResult;
  takeHome: number;
  expenses: number;
  debtPayment: number;
  debtBalance: number;
  taxablePlanned: number;
  taxableActual: number;
  unallocated: number;
  cash: number;
  efTarget: number;
  allocation: Allocation;
  equity: number;
  expReturn: number;
  contributionTotal: number;
  balances: Buckets & { total: number };
  netWorth: number;
  savingsRate: number;
  savingsRateWithCompany: number;
}

export interface RetirementSummary {
  age: number;
  year: number;
  yearsToRetire: number;
  finalTakeHome: number;
  targetIncomeReal: number;
  ssReal: number;
  ssStartAge: number;
  pensionNominal: number;
  pensionReal: number;
  pensionServiceYears: number;
  firstYearNeedReal: number;
  requiredBalanceReal: number;
  deterministicNominal: number;
  deterministicReal: number;
  indexAtRetirement: number;
}

export interface PlanResult {
  pathId: PathId;
  career: Career;
  rows: YearRow[];
  score: ScoreResult;
  provisional: boolean;
  risk: RiskCategory;
  horizon: HorizonCategory;
  model: Allocation;
  glide: GlidePoint[];
  startBalance: number;
  retireAge: number;
  status: FilingStatus;
  efMonths: number;
  retirement: RetirementSummary;
  /** Per projection year inputs for MC (accumulation then decumulation) */
  mcInputs: { allocations: Allocation[]; contributions: number[]; withdrawals: number[]; retireIndex: number; ages: number[] };
  deterministic: number[];
  cumulativeGross: number;
  bindPay415: number;
  firstSpill: YearRow | null;
  firstBackdoor: YearRow | null;
  firstPartialRoth: YearRow | null;
  firstNegativeCash: YearRow | null;
  debtFreeAge: number | null;
  stateRate: number;
}

function pmt(rate: number, years: number, pv: number): number {
  if (pv <= 0) return 0;
  if (rate === 0) return pv / years;
  return (pv * rate) / (1 - Math.pow(1 + rate, -years));
}

export function effectiveRetireAge(s: PlanState): number {
  const r = s.whatIf.retireAt60 ? 60 : s.profile.retireAge;
  return Math.max(s.profile.age + 1, Math.min(65, r));
}

export function profileCategories(s: PlanState): { score: ScoreResult; risk: RiskCategory; horizon: HorizonCategory; provisional: boolean } {
  const score = scoreAnswers(s.answers);
  if (score.complete) return { score, risk: score.riskCategory, horizon: score.horizonCategory, provisional: false };
  // Provisional profile until the checklist is complete: Moderate risk, horizon by years to retirement.
  const yrs = effectiveRetireAge(s) - s.profile.age;
  return { score, risk: 'Moderate', horizon: horizonCategory(yrs > 20 ? 14 : yrs > 7 ? 10 : 6), provisional: true };
}

export function stateRateFor(s: PlanState): number {
  if (s.profile.stateTaxId === 'custom') return s.profile.stateCustomRate;
  return STATE_TAX_OPTIONS.find((o) => o.id === s.profile.stateTaxId)?.rate ?? 0;
}

export function computePlan(s: PlanState, pathId: PathId): PlanResult {
  const p = s.profile;
  const a = s.assumptions;
  const w = s.whatIf;
  const retireAge = effectiveRetireAge(s);
  const status: FilingStatus = p.marital === 'married' ? 'mfj' : 'single';
  const stateRate = stateRateFor(s);
  const { score, risk, horizon, provisional } = profileCategories(s);
  const model = MODELS[risk][horizon];
  const planTo = Math.max(a.planToAge, retireAge + 1);
  const glide = buildGlidePath(model, p.age, retireAge, planTo, Math.min(a.landingEquity, equityPct(model)), a.glideYears);

  const career = buildCareer({
    age: p.age,
    retireAge,
    stage: p.stage,
    employer: p.employer,
    yearsAtEmployer: p.yearsAtEmployer,
    creditHours: p.creditHours,
    pathId,
    milestones: milestonesFor(p, pathId),
    upgradeDelay: w.upgradeDelay,
    furloughYears: w.furloughYears,
    envoyCaRule: a.envoyCaRateRule,
    profitSharingPct: a.profitSharingOn ? a.profitSharingPct / 100 : 0,
    payGrowthAfterContract: a.payGrowthAfterContract,
  });

  const earlyCareer = ['student', 'cfi', 'regional_fo', 'regional_ca'].includes(p.stage);
  const efMonths = emergencyFundMonths(s.supplement, earlyCareer);
  const deferralRate = Math.min(1, Math.max(0, (p.deferralPct + w.deferralBump) / 100));
  const family = p.marital === 'married' || p.kids.length > 0;

  let cash = p.cash;
  let school = p.schoolDebt, other = p.otherDebt;
  const schoolPmt = pmt(p.schoolRate / 100, a.debtTermYears, p.schoolDebt);
  const otherPmt = pmt(p.otherRate / 100, a.debtTermYears, p.otherDebt);
  const b: Buckets = { pretax: p.retirementAccounts, roth: 0, hsa: 0, taxable: p.taxable, mbcb: 0 };
  const startBalance = b.pretax + b.taxable;
  let priorWages = 0;
  let debtFreeAge: number | null = p.schoolDebt + p.otherDebt <= 0 ? p.age : null;
  let fedexLegacyService = p.employer === 'fedex' ? p.yearsAtEmployer : 0;
  const fedexIsLegacyEligible = p.employer === 'fedex' && (p.stage === 'cargo_fo' || p.stage === 'cargo_ca');

  const rows: YearRow[] = [];
  for (const cy of career.years) {
    const index = Math.pow(1 + a.inflation, cy.t + 1);
    const airline = cy.airline ? AIRLINES[cy.airline] : null;
    const isEmployed = cy.phase === 'regional' || cy.phase === 'major' || cy.phase === 'cfi';
    const companyPct = airline && isEmployed ? airline.retirement.companyPct.value / 100 : 0;
    const excessHandling: ExcessHandling = (cy.airline && a.excessOverrides[cy.airline]) || airline?.retirement.excessHandling.value || 'cash';
    const glidePt = glide[Math.min(cy.t, glide.length - 1)];
    const allocation: Allocation = { ...glidePt };
    const expReturn = expectedReturn(allocation, a.cma);

    const dc = computeDC({ pay: cy.gross, age: cy.age, deferralRate: cy.gross > 0 ? deferralRate : 0, companyRate: companyPct, excessHandling, index });
    const cashInLieu = excessHandling === 'cash' ? dc.excess : 0;

    // Market-based cash balance credits (DB plan, outside §415(c))
    let mbcbCredit = excessHandling === 'mbcb' ? dc.excess : 0;
    if (airline?.retirement.mbcbPct && cy.airline !== 'fedex') mbcbCredit += cy.gross * (airline.retirement.mbcbPct.value / 100);
    if (cy.airline === 'fedex' && cy.phase === 'major') {
      const newHire = !fedexIsLegacyEligible;
      const mbcbActive = newHire || (a.fedexOption === 'mbcb' && cy.year >= 2028);
      if (mbcbActive) {
        const pct = (cy.year <= 2028 ? 9 : 10) / 100; // ≈9% through 2028, ≈10% after (VERIFY)
        mbcbCredit += Math.min(cy.gross, 360_000 * index) * pct;
      }
      if (!newHire && (a.fedexOption === 'legacy' || cy.year <= 2027)) fedexLegacyService += 1;
    }

    const hsa = p.hsaEligible && cy.gross > 0 ? hsaLimit(family, cy.age, index) : 0;
    const rothDeferral = dc.employeeDeferral * (p.rothPct / 100);
    const catchUpRoth = dc.catchUp > 0 && catchUpMustBeRoth(priorWages, index);
    const catchUpRothAmt = catchUpRoth ? dc.catchUp : dc.catchUp * (p.rothPct / 100);
    const pretaxDeferral = dc.employeeDeferral - rothDeferral + (dc.catchUp - catchUpRothAmt);
    const wages = cy.gross + cashInLieu;
    const spouseWages = p.marital === 'married' ? p.spouseIncome * index : 0;
    const taxes = computeTaxes({ wages, pretaxDeferral, hsa, spouseWages, status, stateRate, index });
    const magi = taxes.agi;
    priorWages = wages;

    // IRA
    let ira = 0;
    let iraStatus: RothIraStatus | 'off' = 'off';
    if (p.rothIra && cy.gross > 0) {
      const el = rothIraEligibility(magi, status, cy.age, index);
      iraStatus = el.status;
      ira = el.limit; // full amount: direct, partial direct + backdoor remainder, or backdoor
    }

    // Debt service
    let debtPayment = 0;
    for (const [bal, rate, pay, set] of [
      [school, p.schoolRate / 100, schoolPmt, (v: number) => (school = v)],
      [other, p.otherRate / 100, otherPmt, (v: number) => (other = v)],
    ] as const) {
      if (bal <= 0) continue;
      const interest = bal * rate;
      const payment = Math.min(pay, bal + interest);
      debtPayment += payment;
      set(Math.max(0, bal + interest - payment));
    }
    if (debtFreeAge === null && school + other <= 0.5) debtFreeAge = cy.age + 1;
    const snowball = a.snowball && school + other <= 0.5 && debtFreeAge !== null && debtFreeAge <= cy.age ? schoolPmt + otherPmt : 0;

    // Cash flow & order of operations: emergency fund → planned IRA → planned taxable
    const expenses = p.monthlyExpenses * 12 * index;
    const takeHome = wages + spouseWages - taxes.total - dc.employeeDeferral - dc.catchUp - hsa;
    let surplus = takeHome - expenses - debtPayment;
    const efTarget = efMonths * p.monthlyExpenses * index;
    if (surplus < 0) cash += surplus;
    else {
      const topUp = Math.min(surplus, Math.max(0, efTarget - cash));
      cash += topUp;
      surplus -= topUp;
    }
    const afterTaxCashInLieu = cashInLieu > 0
      ? cashInLieu - (taxes.total - computeTaxes({ wages: cy.gross, pretaxDeferral, hsa, spouseWages, status, stateRate, index }).total)
      : 0;
    const taxablePlanned = p.monthlyTaxable * 12 * index + snowball + afterTaxCashInLieu;
    const avail = Math.max(0, surplus);
    const iraActual = Math.min(ira, avail);
    const taxableActual = Math.min(taxablePlanned, avail - iraActual);
    const unallocated = Math.max(0, avail - iraActual - taxableActual);
    cash *= 1 + a.cma.cash.mean * 0.5; // conservative yield on cash

    // Buckets: grow with expected return of the glide-path allocation, contribute at year end
    const contrib: Buckets = {
      pretax: pretaxDeferral + dc.companyContribution,
      roth: rothDeferral + catchUpRothAmt + iraActual,
      hsa,
      taxable: taxableActual,
      mbcb: mbcbCredit,
    };
    const contributionTotal = contrib.pretax + contrib.roth + contrib.hsa + contrib.taxable + contrib.mbcb;
    (Object.keys(b) as (keyof Buckets)[]).forEach((k) => (b[k] = b[k] * (1 + expReturn) + contrib[k]));
    const total = b.pretax + b.roth + b.hsa + b.taxable + b.mbcb;

    const personal = dc.employeeDeferral + dc.catchUp + hsa + iraActual + taxableActual;
    const income = cy.gross + spouseWages;
    rows.push({
      ...cy,
      index, wages, spouseWages,
      employeeDeferral: dc.employeeDeferral, rothDeferral, pretaxDeferral, catchUp: dc.catchUp, catchUpRoth,
      company: dc.companyContribution, companyIntended: dc.companyIntended, companyPct,
      excess: dc.excess, excessHandling, cashInLieu, mbcbCredit,
      hsa, ira: iraActual, iraStatus, magi, taxes, takeHome, expenses,
      debtPayment, debtBalance: school + other,
      taxablePlanned, taxableActual, unallocated, cash, efTarget,
      allocation, equity: glidePt.equity, expReturn, contributionTotal,
      balances: { ...b, total },
      netWorth: cash + total - school - other,
      savingsRate: income > 0 ? personal / income : 0,
      savingsRateWithCompany: income > 0 ? (personal + dc.companyContribution + mbcbCredit) / income : 0,
    });
  }

  // ---------------------------------------------------------------- retirement
  const last = rows[rows.length - 1];
  const nAccum = rows.length;
  const indexAtRet = Math.pow(1 + a.inflation, nAccum);
  const finalTakeHome = last ? last.takeHome : 0;
  const targetIncomeReal = (finalTakeHome * a.targetIncomePct) / 100 / (last ? last.index : 1);

  let pensionNominal = 0;
  const fdx = AIRLINES.fedex.retirement.pension;
  if (fdx && fedexLegacyService > 0) {
    const fae = rows.slice(-5).reduce((sum, r) => sum + r.gross, 0) / Math.max(1, Math.min(5, rows.length));
    pensionNominal = fdx.maxAnnualBenefit.value * Math.min(1, fedexLegacyService / fdx.fullServiceYears.value) * Math.min(1, fae / fdx.faeCap.value);
  }

  const allocations: Allocation[] = [];
  const contributions: number[] = [];
  const withdrawals: number[] = [];
  const ages: number[] = [];
  rows.forEach((r) => { allocations.push(r.allocation); contributions.push(r.contributionTotal); withdrawals.push(0); ages.push(r.age); });
  let firstYearNeedReal = 0;
  for (let age = retireAge; age < planTo; age++) {
    const t = age - p.age;
    const idx = Math.pow(1 + a.inflation, t + 1);
    const ss = age >= a.ssStartAge ? a.socialSecurity : 0;
    const pensionReal = pensionNominal / idx;
    const needReal = Math.max(0, targetIncomeReal - ss - pensionReal) / (1 - a.retirementTaxRate);
    if (age === retireAge) firstYearNeedReal = needReal;
    allocations.push(glide[Math.min(t, glide.length - 1)]);
    contributions.push(0);
    withdrawals.push(needReal * idx);
    ages.push(age);
  }

  const mcInputs = { allocations, contributions, withdrawals, retireIndex: nAccum, ages };
  const deterministic = deterministicPath({ startBalance, ...mcInputs, cma: a.cma });

  const maxCompanyPct = rows.reduce((m, r) => Math.max(m, r.companyPct), 0);
  return {
    pathId, career, rows, score, provisional, risk, horizon, model, glide, startBalance, retireAge, status, efMonths,
    retirement: {
      age: retireAge,
      year: PLAN_START_YEAR + nAccum,
      yearsToRetire: nAccum,
      finalTakeHome,
      targetIncomeReal,
      ssReal: a.socialSecurity,
      ssStartAge: a.ssStartAge,
      pensionNominal,
      pensionReal: pensionNominal / indexAtRet,
      pensionServiceYears: fedexLegacyService,
      firstYearNeedReal,
      requiredBalanceReal: firstYearNeedReal / 0.04,
      deterministicNominal: deterministic[nAccum] ?? 0,
      deterministicReal: (deterministic[nAccum] ?? 0) / indexAtRet,
      indexAtRetirement: indexAtRet,
    },
    mcInputs,
    deterministic,
    cumulativeGross: rows.reduce((sum, r) => sum + r.gross, 0),
    bindPay415: maxCompanyPct > 0 ? payWhere415cBinds(maxCompanyPct) : Infinity,
    firstSpill: rows.find((r) => r.excess > 0.5) ?? null,
    firstBackdoor: rows.find((r) => r.iraStatus === 'none') ?? null,
    firstPartialRoth: rows.find((r) => r.iraStatus === 'partial') ?? null,
    firstNegativeCash: rows.find((r) => r.cash < 0) ?? null,
    debtFreeAge,
    stateRate,
  };
}

export function monteCarloFor(plan: PlanResult, s: PlanState): MCResult {
  return runMonteCarlo({
    startBalance: plan.startBalance,
    ...plan.mcInputs,
    cma: s.assumptions.cma,
    nSims: s.assumptions.nSims,
    seed: s.assumptions.seed,
  });
}

export function activePathOf(s: PlanState): PathId {
  return s.whatIf.pathOverride ?? s.activePath;
}

export function airlineIdsIn(plan: PlanResult): AirlineId[] {
  return [...new Set(plan.rows.map((r) => r.airline).filter((x): x is AirlineId => !!x))];
}
