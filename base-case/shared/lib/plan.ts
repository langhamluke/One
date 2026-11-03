/**
 * Yearly cash-flow ledger for one career path: income -> payroll -> taxes -> spending & debt -> order of operations
 * for the surplus -> balances. Produces the PathResult the UI reads plus the Monte Carlo inputs.
 *
 * Order of operations for a positive surplus (takeHome - living - debt service):
 *   (1) emergency fund top-up to target (months x monthly essentials, where essentials = living + debt service)
 *   (2) planned IRA (savings.iraContribution, capped at the IRA limit and earned income; Roth subject to the MAGI
 *       phase-out -> when 'none' the amount is routed to taxable and flagged 'backdoor-roth')
 *   (3) goals by priority (level funding = remaining / years remaining)
 *   (4) planned taxable (savings.taxableContribution + whatIf.extraSavingsRatePct x pay)
 *   remainder = unallocated (assumed spent; surfaced in alerts).
 * A negative surplus is drawn from cash, then taxable, and the row is flagged 'negative-cash-flow'.
 *
 * Retirement years: taxes on pension / Social Security are embodied in assumptions.taxGrossUp rather than computed, so
 * takeHome = pension + SS, living = retirement spending target (override, or incomeReplacement x final working-year
 * take-home in today's dollars) and the demanded withdrawal = (living + debt service - takeHome) x (1 + taxGrossUp),
 * drawn taxable -> pre-tax -> Roth -> HSA, then cash. The same demanded withdrawals feed the Monte Carlo.
 *
 * Balances grow at the expected return of that year's glide-path allocation (contributions at year end); cash and goal
 * balances earn assumptions.cashYield. Planned dollar contributions (HSA, IRA, taxable) are indexed by inflation.
 */
import { CURRENT_YEAR, type Goal, type PlanState } from './inputs';
import type { DebtSummary, EmergencyFund, GlidePoint, PathResult, SocialSecurityEstimate, TaxSummary, YearRow } from './derived';
import type { CareerSim } from './career';
import { LoanSimulator, effectivePlan, type LoanInput } from './loans';
import { federalIncomeTax, fica, marginalFederalRate, roundTo, standardDeduction, stateTax } from './tax';
import { applySection415c, deferralLimit, employerContributions, hsaLimit, iraLimit, rothIraAllowed, tradIraDeductible } from './limits';
import { allocationFromEquity } from '../data/models';
import { expectedReturn, glideEquity, glideParams } from './glidepath';
import { emergencyMonths } from './scoring';
import { LIMITS_2026 } from '../data/irs2026';

export interface LedgerUsage {
  rap: boolean;
  tiered: boolean;
  ibr: boolean;
  hsa: boolean;
  s127: boolean;
  rothPhaseOut: boolean;
  backdoorRoth: boolean;
  tradIraPhaseOut: boolean;
  catchUp: boolean;
  superCatchUp: boolean;
  s415c: boolean;
  deferralCapped: boolean;
  gradLoanCap: boolean;
  goalUnderfunded: string[];
  forgiveness: string[];
  negativeCashFlowYears: number[];
  retirementShortfall: boolean;
  ibrNotLegacy: boolean;
}

export interface LedgerOutput {
  path: PathResult;
  /** Investment contributions per plan year (nominal), Monte Carlo input */
  contributions: number[];
  /** Demanded withdrawals per plan year (nominal), Monte Carlo input */
  withdrawals: number[];
  targetIncomeReal: number;
  /** Row index of the first retirement year (rows.length when retirement is beyond the projection) */
  retirementIndex: number;
  tax: TaxSummary;
  usage: LedgerUsage;
  /** Scheduled monthly payment in the first year with debt payments */
  firstYearMonthlyDebt: number;
}

interface GoalState {
  g: Goal;
  balance: number;
  targetNominal: number;
  done: boolean;
}

function emptyTax(year: number): TaxSummary {
  return { year, gross: 0, pretaxDeductions: 0, standardDeduction: 0, taxableIncome: 0, federalTax: 0, stateTax: 0, fica: 0, totalTax: 0, effectiveRate: 0, marginalFederalRate: 0, takeHome: 0 };
}

/** §127 educational-assistance exclusion: $5,250 through 2026, indexed afterwards (rounded to $50). */
export function section127Cap(year: number, indexing: number): number {
  const base = LIMITS_2026.educationalAssistance127.value;
  const n = Math.max(0, year - CURRENT_YEAR);
  return n === 0 ? base : roundTo(base * Math.pow(1 + indexing, n), 50);
}

export function runLedger(state: PlanState, sim: CareerSim, ctx: { modelEquity: number; ss: SocialSecurityEstimate }): LedgerOutput {
  const a = state.assumptions;
  const p = state.profile;
  const b = state.benefits;
  const sv = state.savings;
  const bs = state.balanceSheet;
  const wi = state.whatIf;
  const infl = a.inflation;
  const idx = a.indexing ?? infl;
  const status = p.filingStatus;
  const gp = glideParams(state, ctx.modelEquity);
  const ssClaim = ctx.ss.claimAge;
  const dependents = Math.max(0, Math.floor(p.dependents));
  const householdSize = 1 + (status === 'mfj' ? 1 : 0) + dependents;
  const hsaCoverage: 'self' | 'family' = status === 'mfj' || dependents > 0 ? 'family' : 'self';
  const months = emergencyMonths(state).months;
  const grossUp = Math.max(0, a.taxGrossUp);

  const debts: LoanInput[] = [...state.debts];
  if (sim.gradLoan) debts.push(sim.gradLoan);
  const loans = new LoanSimulator(debts);
  const usage: LedgerUsage = {
    rap: debts.some((d) => effectivePlan(d) === 'rap'),
    tiered: debts.some((d) => effectivePlan(d) === 'tiered_standard'),
    ibr: debts.some((d) => effectivePlan(d) === 'ibr'),
    hsa: b.hsaEligible,
    s127: b.employerLoanRepayment > 0 && debts.some((d) => d.kind === 'federal_student' || d.kind === 'private_student'),
    rothPhaseOut: false,
    backdoorRoth: false,
    tradIraPhaseOut: false,
    catchUp: false,
    superCatchUp: false,
    s415c: false,
    deferralCapped: false,
    gradLoanCap: sim.flags.includes('grad-loan-cap'),
    goalUnderfunded: [],
    forgiveness: [],
    negativeCashFlowYears: [],
    retirementShortfall: false,
    ibrNotLegacy: false,
  };

  let cash = Math.max(0, bs.cash);
  let taxable = Math.max(0, bs.taxable);
  let preTax = Math.max(0, bs.preTax);
  let roth = Math.max(0, bs.roth);
  let hsa = Math.max(0, bs.hsa);
  const other = Math.max(0, bs.otherAssets);
  const goals: GoalState[] = [...state.goals]
    .sort((x, y) => x.priority - y.priority || x.targetYear - y.targetYear)
    .map((g) => ({
      g,
      balance: Math.max(0, g.fundedSoFar),
      targetNominal: Math.max(0, g.targetAmount) * Math.pow(1 + infl, Math.max(0, g.targetYear - CURRENT_YEAR)),
      done: false,
    }));

  const rows: YearRow[] = [];
  const contributions: number[] = [];
  const withdrawals: number[] = [];
  let lastWorkingTakeHomeReal = 0;
  let targetReal: number | null = null;
  let retirementIndex = sim.rows.length;
  let debtFreeAge: number | null = null;
  const hadDebt = loans.hasDebts;
  let lifetimeEarnings = 0;
  let peakSalary = 0;
  let firstYearMonthlyDebt = 0;
  const firstIncome = sim.firstIncomeYearIndex >= 0 ? sim.firstIncomeYearIndex : 0;
  let tax: TaxSummary = emptyTax(CURRENT_YEAR);
  let netWorthAtRetirement = 0;

  for (let i = 0; i < sim.rows.length; i++) {
    const r = sim.rows[i];
    const year = r.year;
    const age = r.age;
    const retired = r.stage === 'retired';
    const working = r.stage === 'working' || r.stage === 'gap';
    const flags: string[] = [];
    const inflIdx = Math.pow(1 + infl, i);
    const equityPct = glideEquity(age, gp);
    const alloc = allocationFromEquity(equityPct);
    const ret = expectedReturn(alloc, a.cma);
    if (retired && retirementIndex === sim.rows.length) {
      retirementIndex = i;
      netWorthAtRetirement = rows.length ? rows[rows.length - 1].netWorth : investableNow() + cash + other - loans.totalBalance();
    }

    // ---- Income
    const wages = r.wages;
    const bonus = r.bonus;
    const equityComp = r.rsu + r.esppGain;
    const spouseWages = !retired ? Math.max(0, p.spouseIncome) * inflIdx : 0;
    const pensionIncome = r.pensionIncome;
    const socialSecurity = age >= ssClaim ? ctx.ss.annualAtClaim * inflIdx : 0;
    const grossIncome = wages + bonus + equityComp + spouseWages + pensionIncome + socialSecurity;
    const pay = wages + bonus;
    const earned = wages + bonus;
    lifetimeEarnings += wages + bonus + equityComp;
    if (wages > peakSalary) peakSalary = wages;

    // ---- Payroll
    let employeePretax = 0;
    let employeeRoth = 0;
    let employer401k = 0;
    let loanMatch = 0;
    let hsaEmployee = 0;
    let hsaEmployer = 0;
    let deferralCapped = false;
    let s415cCapped = false;
    const dl = deferralLimit(age, year, idx);
    if (working && pay > 0) {
      const wanted = Math.max(0, sv.deferralPct) * pay;
      const employee = Math.min(wanted, dl.total);
      deferralCapped = wanted > dl.total + 1e-6;
      if (deferralCapped) flags.push('deferral-capped');
      if (employee > dl.base && dl.catchUpKind === 'age50') usage.catchUp = true;
      if (employee > dl.base && dl.catchUpKind === 'age60to63') usage.superCatchUp = true;
      if (sv.deferralType === 'roth') employeeRoth = employee;
      else if (sv.deferralType === 'split') {
        employeeRoth = employee * Math.min(1, Math.max(0, sv.rothSplit));
        employeePretax = employee - employeeRoth;
      } else employeePretax = employee;
      if (b.hsaEligible) {
        const hl = hsaLimit(hsaCoverage, age, year, idx).total;
        hsaEmployer = Math.min(Math.max(0, b.employerHsaContribution), hl);
        hsaEmployee = Math.min(Math.max(0, sv.hsaContribution) * inflIdx, Math.max(0, hl - hsaEmployer));
      }
    }
    const pensionContrib = r.pensionEmployeeContrib;
    const pretaxPayroll = employeePretax + hsaEmployee + pensionContrib;
    const agi = Math.max(0, grossIncome - pretaxPayroll);

    // ---- Debt (needs AGI); employer repayment only while employed
    const employerRepay = working && pay > 0 ? Math.max(0, b.employerLoanRepayment) : 0;
    const dr = loans.stepYear({ yearIndex: i, year, agi, dependents, householdSize, employerLoanRepayment: employerRepay, inflation: infl });
    for (const f of dr.flags) {
      if (f.startsWith('rap-forgiveness') || f.startsWith('ibr-forgiveness')) {
        usage.forgiveness.push(f);
        flags.push(f);
      }
      if (f.startsWith('ibr-not-legacy')) usage.ibrNotLegacy = true;
    }
    const s127Excess = Math.max(0, dr.employerPaid - section127Cap(year, idx));
    if (s127Excess > 0) flags.push('s127-excess');
    if (firstYearMonthlyDebt === 0 && dr.scheduled > 0) firstYearMonthlyDebt = dr.scheduled / 12;

    // ---- Employer 401(k) and §415(c)
    if (working && pay > 0) {
      const employee = employeePretax + employeeRoth;
      const ec = employerContributions({ pay, deferralPct: employee / pay, benefits: b, year, studentLoanPayments: dr.studentLoanPayments, indexing: idx });
      const catchUpUsed = Math.max(0, employee - dl.base);
      const s = applySection415c(employee, ec.total, pay, year, { indexing: idx, catchUpExcluded: catchUpUsed });
      s415cCapped = s.capped;
      if (s.capped) {
        flags.push('s415c-capped');
        usage.s415c = true;
        if (s.employee < employee - 1e-6) {
          const scale = s.employee / employee;
          employeePretax *= scale;
          employeeRoth *= scale;
        }
      }
      loanMatch = ec.total > 0 ? ec.loanMatch * (s.employer / ec.total) : 0;
      employer401k = s.employer - loanMatch;
    }
    if (deferralCapped) usage.deferralCapped = true;

    // ---- IRA plan and deductibility
    const iraLim = iraLimit(age, year, idx).total;
    const plannedIra = earned > 0 ? Math.min(Math.max(0, sv.iraContribution) * inflIdx, iraLim, earned) : 0;
    const coveredByPlan = employeePretax + employeeRoth + employer401k + loanMatch > 0;
    const ra = rothIraAllowed(agi, status, year, iraLim, idx);
    const rothAllowedEarned = Math.min(ra.allowed, Math.max(0, earned));
    let rothPlanned = 0;
    let tradPlanned = 0;
    let rothRouted = 0;
    let tradDeduction = 0;
    if (plannedIra > 0) {
      if (sv.iraType === 'roth') {
        rothPlanned = Math.min(plannedIra, ra.allowed);
        rothRouted = plannedIra - rothPlanned;
        if (ra.status === 'none') {
          flags.push('backdoor-roth');
          usage.backdoorRoth = true;
        } else if (ra.status === 'partial') {
          flags.push('roth-phaseout');
          usage.rothPhaseOut = true;
        }
      } else {
        tradPlanned = plannedIra;
        tradDeduction = tradIraDeductible(tradPlanned, agi, status, coveredByPlan, year, idx);
        if (tradDeduction < tradPlanned - 1e-6) {
          flags.push('trad-ira-nondeductible');
          usage.tradIraPhaseOut = true;
        }
      }
    }

    // ---- Taxes and take-home
    const sd = standardDeduction(status, year, idx);
    let taxableIncome = 0;
    let federalTax = 0;
    let stTax = 0;
    let ficaTotal = 0;
    let takeHome: number;
    let pretaxDeductions = pretaxPayroll + tradDeduction;
    if (retired) {
      takeHome = grossIncome;
      pretaxDeductions = 0;
    } else {
      const agiLike = Math.max(0, grossIncome - pretaxPayroll - tradDeduction + s127Excess);
      taxableIncome = Math.max(0, agiLike - sd);
      federalTax = federalIncomeTax(taxableIncome, status, year, idx);
      stTax = stateTax(agiLike, p.stateCode, status, { customRate: p.customStateRate });
      const ficaWages = Math.max(0, wages + bonus + r.rsu + s127Excess - hsaEmployee);
      ficaTotal = fica(ficaWages, status, year, { inflation: infl, oasdiExempt: !r.coveredBySS }).total;
      if (spouseWages > 0) ficaTotal += fica(spouseWages, status, year, { inflation: infl }).total;
      takeHome = grossIncome - employeePretax - employeeRoth - hsaEmployee - pensionContrib - r.esppContribution - federalTax - stTax - ficaTotal;
    }

    // ---- Spending
    let living: number;
    if (retired) {
      if (targetReal === null) targetReal = a.retirementSpendingOverride ?? Math.max(0, a.incomeReplacement) * Math.max(0, lastWorkingTakeHomeReal);
      living = Math.max(0, targetReal) * inflIdx;
    } else {
      living = Math.max(0, p.livingExpenses - wi.spendingCut) * inflIdx * Math.pow(1 + a.lifestyleCreep, i) + r.tuitionCash;
      if (r.tuitionCash > 0) flags.push('tuition');
      if (r.tuitionExcess > 0) flags.push('grad-loan-cap');
      if (working) lastWorkingTakeHomeReal = takeHome / inflIdx;
    }
    const debtService = dr.debtService;

    // ---- Surplus and order of operations
    for (const g of goals) if (!g.done) g.balance *= 1 + a.cashYield;
    const surplus = takeHome - living - debtService;
    let emergencyTopUp = 0;
    let iraActual = 0;
    let rothIraContrib = 0;
    let tradIraContrib = 0;
    let goalFunding = 0;
    let taxableContrib = 0;
    let unallocated = 0;
    let cashFlow = 0;
    let drawCash = 0;
    let drawTaxable = 0;
    let drawPre = 0;
    let drawRoth = 0;
    let drawHsa = 0;
    let withdrawalDemand = 0;
    if (retired) {
      const need = Math.max(0, -surplus);
      withdrawalDemand = need * (1 + grossUp);
      let left = withdrawalDemand;
      const take = (bal: number): number => {
        const x = Math.min(left, Math.max(0, bal));
        left -= x;
        return x;
      };
      drawTaxable = take(taxable);
      drawPre = take(preTax);
      drawRoth = take(roth);
      drawHsa = take(hsa);
      if (left > 0) {
        const netLeft = left / (1 + grossUp);
        drawCash = Math.min(cash, netLeft);
        left -= drawCash * (1 + grossUp);
      }
      if (left > 1) {
        flags.push('retirement-shortfall');
        usage.retirementShortfall = true;
        cashFlow = -left / (1 + grossUp);
      } else cashFlow = 0;
      if (surplus > 0) {
        unallocated = surplus;
        cashFlow = surplus;
      }
    } else if (surplus < 0) {
      drawCash = Math.min(cash, -surplus);
      drawTaxable = Math.min(taxable, -surplus - drawCash);
      cashFlow = surplus;
      flags.push('negative-cash-flow');
      usage.negativeCashFlowYears.push(i);
    } else {
      let rem = surplus;
      const target = months * ((living + debtService) / 12);
      emergencyTopUp = Math.min(rem, Math.max(0, target - cash));
      rem -= emergencyTopUp;
      const iraWant = rothPlanned + tradPlanned;
      iraActual = Math.min(rem, iraWant);
      rem -= iraActual;
      if (iraWant > 0) {
        rothIraContrib = iraActual * (rothPlanned / iraWant);
        tradIraContrib = iraActual - rothIraContrib;
      }
      for (const g of goals) {
        if (g.done || g.g.targetYear < year) continue;
        const yearsLeft = Math.max(1, g.g.targetYear - year + 1);
        const remaining = Math.max(0, g.targetNominal - g.balance);
        const fund = Math.min(rem, remaining / yearsLeft);
        g.balance += fund;
        goalFunding += fund;
        rem -= fund;
      }
      const taxWant = Math.max(0, sv.taxableContribution) * inflIdx + Math.max(0, wi.extraSavingsRatePct) * pay + rothRouted;
      taxableContrib = Math.min(rem, taxWant);
      rem -= taxableContrib;
      unallocated = rem;
      cashFlow = unallocated;
      if (unallocated > 1) flags.push('unallocated');
    }

    // ---- Goals due this year
    let goalLeftover = 0;
    for (const g of goals) {
      if (g.done || g.g.targetYear > year) continue;
      const spend = Math.min(g.balance, g.targetNominal);
      if (g.balance < g.targetNominal - 1) {
        usage.goalUnderfunded.push(g.g.id);
        flags.push(`goal-underfunded:${g.g.id}`);
      }
      goalLeftover += g.balance - spend;
      g.balance = 0;
      g.done = true;
    }

    // ---- Balances (end of year)
    cash = cash * (1 + a.cashYield) + emergencyTopUp - drawCash + goalLeftover + (retired ? unallocated : 0);
    preTax = preTax * (1 + ret) + employeePretax + employer401k + loanMatch + tradIraContrib - drawPre;
    roth = roth * (1 + ret) + employeeRoth + rothIraContrib - drawRoth;
    hsa = hsa * (1 + ret) + hsaEmployee + hsaEmployer - drawHsa;
    taxable = taxable * (1 + ret) + taxableContrib + r.esppContribution + r.esppGain - drawTaxable;
    cash = Math.max(0, cash);
    preTax = Math.max(0, preTax);
    roth = Math.max(0, roth);
    hsa = Math.max(0, hsa);
    taxable = Math.max(0, taxable);
    let goalsBal = 0;
    for (const g of goals) goalsBal += g.balance;
    const debtBalance = dr.totalBalance;
    if (hadDebt && debtFreeAge === null && loans.totalBalance() <= 0.5) debtFreeAge = age;
    const investable = preTax + roth + hsa + taxable;
    const netWorth = investable + cash + goalsBal + other - debtBalance;

    const employeeSavings = employeePretax + employeeRoth + hsaEmployee + iraActual + taxableContrib + emergencyTopUp + dr.extraPrincipal;
    const employerSavings = employer401k + loanMatch + hsaEmployer;
    const savingsRate = grossIncome > 0 ? employeeSavings / grossIncome : 0;
    const savingsRateWithEmployer = grossIncome + employerSavings > 0 ? (employeeSavings + employerSavings) / (grossIncome + employerSavings) : 0;

    contributions.push(employeePretax + employeeRoth + employer401k + loanMatch + hsaEmployee + hsaEmployer + iraActual + taxableContrib + r.esppContribution + r.esppGain);
    withdrawals.push(retired ? withdrawalDemand : drawTaxable);

    if (i === firstIncome) {
      const totalTax = federalTax + stTax + ficaTotal;
      tax = {
        year,
        gross: grossIncome,
        pretaxDeductions,
        standardDeduction: retired ? 0 : sd,
        taxableIncome,
        federalTax,
        stateTax: stTax,
        fica: ficaTotal,
        totalTax,
        effectiveRate: grossIncome > 0 ? totalTax / grossIncome : 0,
        marginalFederalRate: retired ? 0 : marginalFederalRate(taxableIncome, status, year, idx),
        takeHome,
      };
    }

    rows.push({
      yearIndex: i,
      year,
      age,
      stage: r.stage,
      levelTitle: r.levelTitle,
      wages,
      bonus,
      equityComp,
      spouseWages,
      pensionIncome,
      socialSecurity,
      grossIncome,
      employeePretax401k: employeePretax,
      employeeRoth401k: employeeRoth,
      employer401k,
      employerLoanMatch401k: loanMatch,
      hsaEmployee,
      hsaEmployer,
      esppContribution: r.esppContribution,
      taxableIncome,
      federalTax,
      stateTax: stTax,
      fica: ficaTotal,
      takeHome,
      livingExpenses: living,
      debtService,
      debtInterest: dr.interest,
      loanForgiven: dr.forgiven,
      emergencyTopUp,
      iraContribution: iraActual,
      taxableContribution: taxableContrib,
      goalFunding,
      unallocated,
      cashFlow,
      balances: { cash, preTax, roth, hsa, taxable, goals: goalsBal },
      debtBalance,
      investable,
      netWorth,
      equityPct,
      expectedReturn: ret,
      savingsRate,
      savingsRateWithEmployer,
      limits: { deferralCapped, s415cCapped, rothIra: ra.status, rothIraAllowed: rothAllowedEarned },
      flags,
    });
  }

  function investableNow(): number {
    return preTax + roth + hsa + taxable;
  }

  if (retirementIndex === sim.rows.length) netWorthAtRetirement = rows.length ? rows[rows.length - 1].netWorth : 0;
  const startWp = sim.waypoints.find((w) => w.kind === 'start');
  const startingSalary = startWp ? startWp.pay : sim.firstIncomeYearIndex >= 0 ? sim.rows[sim.firstIncomeYearIndex].wages : 0;

  return {
    path: {
      pathId: sim.pathId,
      name: sim.name,
      rows,
      waypoints: sim.waypoints,
      lifetimeEarnings,
      startingSalary,
      peakSalary,
      netWorthAtRetirement,
      debtFreeAge,
      firstIncomeYearIndex: firstIncome,
    },
    contributions,
    withdrawals,
    targetIncomeReal: targetReal ?? (a.retirementSpendingOverride ?? Math.max(0, a.incomeReplacement) * Math.max(0, lastWorkingTakeHomeReal)),
    retirementIndex,
    tax,
    usage,
    firstYearMonthlyDebt,
  };
}

/** Emergency-fund readout based on today's essentials (year-0 living expenses + debt service) and current cash. */
export function computeEmergencyFund(state: PlanState, rows: YearRow[]): EmergencyFund {
  const em = emergencyMonths(state);
  const row = rows[0];
  const monthlyEssentials = row ? (row.livingExpenses + row.debtService) / 12 : Math.max(0, state.profile.livingExpenses) / 12;
  const target = em.months * monthlyEssentials;
  const current = Math.max(0, state.balanceSheet.cash);
  const monthsCovered = monthlyEssentials > 0 ? current / monthlyEssentials : em.months;
  return { monthsTarget: em.months, monthlyEssentials, target, current, monthsCovered, reason: em.reason };
}

/** Debt readout for the active path. */
export function computeDebtSummary(state: PlanState, out: LedgerOutput, expectedPortfolioReturn: number): DebtSummary {
  const debts = state.debts.filter((d) => d.balance > 0);
  let totalBalance = 0;
  let highestRate = 0;
  let highInterestBalance = 0;
  let studentLoanBalance = 0;
  for (const d of debts) {
    totalBalance += d.balance;
    highestRate = Math.max(highestRate, d.rate);
    if (d.rate > expectedPortfolioReturn) highInterestBalance += d.balance;
    if (d.kind === 'federal_student' || d.kind === 'private_student') studentLoanBalance += d.balance;
  }
  let totalInterest = 0;
  let forgivenTotal = 0;
  for (const r of out.path.rows) {
    totalInterest += r.debtInterest;
    forgivenTotal += r.loanForgiven;
  }
  return {
    totalBalance,
    monthlyPayment: out.firstYearMonthlyDebt,
    highestRate,
    highInterestBalance,
    studentLoanBalance,
    payoffAge: out.path.debtFreeAge,
    totalInterest,
    forgivenTotal,
  };
}
