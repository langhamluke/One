/**
 * Alert ledger. Rules are evaluated against the active path and sorted warning -> caution -> advisory
 * (insertion order inside a severity). Advisor-only rows carry advisorOnly: true.
 */
import type { Alert, Severity } from './types';
import type { PlanState } from './inputs';
import type { EmergencyFund, MonteCarloResult, PathResult, RiskProfile, SocialSecurityEstimate } from './derived';
import type { LedgerOutput } from './plan';
import { STATES } from '../data/states';
import { TEXT_VERIFIED } from '../data/questionnaire';
import { compensationCap, deferralLimit } from './limits';
import { fmtMoney, fmtPct } from './format';

export interface AlertContext {
  state: PlanState;
  active: PathResult;
  ledger: LedgerOutput;
  mc: MonteCarloResult;
  emergency: EmergencyFund;
  profile: RiskProfile;
  ss: SocialSecurityEstimate;
  dataQuality: { unverifiedCount: number; userProvidedCount: number };
  /** Expected return of today's allocation (high-interest threshold) */
  expectedReturn: number;
}

const ORDER: Record<Severity, number> = { warning: 0, caution: 1, advisory: 2 };

/** Annual employer match the client forgoes at the current deferral rate (first income year). */
export function matchLeftOnTable(state: PlanState, pay: number, year: number): { amount: number; neededPct: number } {
  const b = state.benefits;
  const cap = Math.max(0, b.matchCapPct);
  const pct = Math.max(0, state.savings.deferralPct);
  if (b.matchRate <= 0 || pct >= cap || pay <= 0) return { amount: 0, neededPct: cap };
  const eligible = Math.min(pay, compensationCap(year, state.assumptions.indexing ?? state.assumptions.inflation));
  return { amount: b.matchRate * (cap - pct) * eligible, neededPct: cap };
}

export function buildAlerts(ctx: AlertContext): Alert[] {
  const { state, active, ledger, mc, emergency, profile, ss } = ctx;
  const out: Alert[] = [];
  const push = (id: string, severity: Severity, title: string, detail: string, extra: { advisorOnly?: boolean; value?: number } = {}) =>
    out.push({ id, severity, title, detail, ...extra });
  const rows = active.rows;
  const first = rows[active.firstIncomeYearIndex] ?? rows[0];
  const u = ledger.usage;

  // Retirement shortfall
  if (mc.targetIncomeReal > 0 && (mc.sims > 0 || ledger.retirementIndex < rows.length)) {
    const p = mc.successProbability;
    if (p < 0.75) push('shortfall', 'warning', 'Retirement income is likely to fall short', `The target of ${fmtMoney(mc.targetIncomeReal)}/yr (today's dollars) is funded in ${fmtPct(p, 0)} of simulations. Raise savings, retire later or lower the target.`, { value: p });
    else if (p < 0.9) push('shortfall', 'caution', 'Retirement plan has a meaningful chance of falling short', `The target of ${fmtMoney(mc.targetIncomeReal)}/yr is funded in ${fmtPct(p, 0)} of simulations; 90% is the usual comfort level.`, { value: p });
  }

  // Negative cash flow
  const negEarly = rows.filter((r) => r.yearIndex < 5 && r.stage !== 'retired' && r.cashFlow < -1);
  const negLate = rows.filter((r) => r.yearIndex >= 5 && r.stage !== 'retired' && r.cashFlow < -1);
  if (negEarly.length) {
    const worst = negEarly.reduce((m, r) => (r.cashFlow < m.cashFlow ? r : m), negEarly[0]);
    push('negative-cash-flow', 'warning', `Negative cash flow in ${negEarly.length === 1 ? String(worst.year) : `${negEarly.length} of the next 5 years`}`, `Spending and debt payments exceed take-home by ${fmtMoney(-worst.cashFlow)} in ${worst.year}; the gap is drawn from cash, then taxable savings.`, { value: -worst.cashFlow });
  } else if (negLate.length) {
    const worst = negLate.reduce((m, r) => (r.cashFlow < m.cashFlow ? r : m), negLate[0]);
    push('negative-cash-flow', 'caution', `Negative cash flow in ${worst.year}`, `Spending and debt payments exceed take-home by ${fmtMoney(-worst.cashFlow)} that year (${negLate.length} year${negLate.length === 1 ? '' : 's'} affected).`, { value: -worst.cashFlow });
  }
  if (u.retirementShortfall) {
    push('retirement-drawdown', 'caution', 'Savings run out in retirement on the expected-return path', 'At expected returns the portfolio cannot cover the retirement spending target every year to life expectancy.');
  }

  // Emergency fund
  if (emergency.target > 0 && emergency.monthsCovered < emergency.monthsTarget - 0.05) {
    const sev: Severity = emergency.monthsCovered < 1 ? 'warning' : 'caution';
    push('emergency-fund', sev, `Emergency fund covers ${emergency.monthsCovered.toFixed(1)} of ${emergency.monthsTarget} months`, `${emergency.reason}. Target ${fmtMoney(emergency.target)}, on hand ${fmtMoney(emergency.current)}.`, { value: emergency.target - emergency.current });
  }

  // Insurance
  if (!state.benefits.disabilityCoverage && !state.insurance.disability) {
    push('disability', 'caution', 'No long-term disability coverage', 'Your ability to earn is your largest asset at this stage; check whether work offers group LTD, or price an individual policy.');
  }
  if (!state.insurance.renters) {
    push('renters', 'advisory', 'No renters insurance', 'Renters insurance is inexpensive and covers belongings and liability; most landlords require it.');
  }

  // High-interest debt
  const hi = state.debts.filter((d) => d.balance > 0 && d.rate > ctx.expectedReturn);
  if (hi.length) {
    const bal = hi.reduce((s, d) => s + d.balance, 0);
    push('high-interest-debt', 'caution', `High-interest debt: ${fmtMoney(bal)}`, `${hi.map((d) => `${d.name} at ${fmtPct(d.rate, 1)}`).join(', ')} cost more than the portfolio is expected to earn (${fmtPct(ctx.expectedReturn, 1)}). Pay these down before investing beyond the match.`, { value: bal });
  }

  // 401(k) match and limits
  if (first && (first.stage === 'working' || first.stage === 'gap')) {
    const pay = first.wages + first.bonus;
    const m = matchLeftOnTable(state, pay, first.year);
    if (m.amount > 0.5) {
      push('match-left', 'warning', `Leaving ${fmtMoney(m.amount)}/yr of employer match on the table`, `Deferring ${fmtPct(state.savings.deferralPct, 1)} of pay; the full match needs ${fmtPct(m.neededPct, 1)}. That is an immediate ${fmtPct(state.benefits.matchRate, 0)} return.`, { value: m.amount });
    }
    const lim = deferralLimit(first.age, first.year, state.assumptions.indexing ?? state.assumptions.inflation).total;
    const employee = first.employeePretax401k + first.employeeRoth401k;
    if (first.unallocated > 1 && employee < lim - 1) {
      push('deferral-below-max', 'advisory', '401(k) deferral is below the IRS maximum while cash is unallocated', `Room of ${fmtMoney(lim - employee)} under the ${first.year} limit of ${fmtMoney(lim)}; ${fmtMoney(first.unallocated)}/yr is currently unallocated.`, { value: Math.min(lim - employee, first.unallocated) });
    }
    if (first.unallocated > 1) {
      push('unsaved-cash-flow', 'advisory', `${fmtMoney(first.unallocated)}/yr of cash flow is not assigned to a goal`, 'Surplus beyond the planned savings is assumed spent. Direct it to the next step in the order of operations.', { value: first.unallocated });
    }
  }
  if (u.s415c || u.deferralCapped) {
    push('limits-binding', 'advisory', u.s415c ? 'Section 415(c) annual additions limit binds in some years' : 'The 401(k) deferral limit binds in some years', 'Contributions above the IRS limit are redirected; consider after-tax or taxable investing for the excess.');
  }
  if (u.backdoorRoth || u.rothPhaseOut) {
    push('roth-phaseout', 'advisory', u.backdoorRoth ? 'Roth IRA income limit reached: consider a backdoor Roth' : 'Roth IRA contribution is partially phased out', 'Income inside or above the Roth IRA MAGI range limits direct contributions; a non-deductible traditional contribution converted to Roth (backdoor) is the common workaround when no pre-tax IRA balances exist.');
  }
  if (u.tradIraPhaseOut) {
    push('trad-ira-nondeductible', 'advisory', 'Traditional IRA contribution is not fully deductible', 'Covered by a workplace plan and above the MAGI range; a Roth IRA (or backdoor Roth) is usually the better route.');
  }

  // Loans
  if (u.forgiveness.length) {
    push('forgiveness-tax', 'advisory', 'Projected loan forgiveness may be taxable', 'Balances forgiven under RAP / IBR are shown as forgiven in that year; federal tax treatment of forgiven amounts after 2025 should be confirmed with a tax professional.');
  }
  if (u.ibrNotLegacy) {
    push('ibr-eligibility', 'caution', 'IBR is only available to legacy borrowers', 'A federal loan is set to IBR without the legacy-borrower flag; new borrowers after July 1, 2026 choose between the tiered standard plan and RAP.');
  }
  if (u.gradLoanCap) {
    push('grad-loan-cap', 'caution', 'Grad-school borrowing exceeds the federal caps', 'The financed share above the $20,500/yr and $100,000 aggregate limits is assumed paid from cash or taxable savings. Private loans would carry different terms.');
  }
  for (const r of rows) {
    if (r.flags.includes('s127-excess')) {
      push('s127-excess', 'advisory', 'Employer loan repayment above the §127 exclusion is taxable', 'Amounts over the $5,250 annual exclusion are treated as taxable wages in the projection.');
      break;
    }
  }

  // Goals
  for (const id of new Set(u.goalUnderfunded)) {
    const g = state.goals.find((x) => x.id === id);
    push(`goal-underfunded:${id}`, 'caution', `Goal underfunded: ${g?.name ?? id}`, `The projection does not reach ${fmtMoney(g?.targetAmount ?? 0)} (today's dollars) by ${g?.targetYear ?? ''}. Lower the target, push the date or raise its priority.`);
  }

  // Profile and data
  if (profile.provisional) {
    push('provisional-profile', 'caution', 'Risk profile is provisional', `${profile.answered} of ${profile.total} questionnaire answers recorded; using ${profile.risk} / ${profile.horizon} until it is complete.`);
  }
  if (state.profile.stateCode !== 'CUSTOM' && !STATES[state.profile.stateCode]) {
    push('state-unknown', 'caution', `State tax preset for ${state.profile.stateCode || '(none)'} is not loaded`, 'State income tax is modelled as zero. Choose a listed state or CUSTOM with a rate.');
  }
  if (ctx.dataQuality.unverifiedCount > 0) {
    push('unverified-data', 'advisory', `${ctx.dataQuality.unverifiedCount} data point${ctx.dataQuality.unverifiedCount === 1 ? '' : 's'} in this plan ${ctx.dataQuality.unverifiedCount === 1 ? 'is' : 'are'} unverified`, 'Derived or single-source figures carry a VERIFY tag on the Data & Sources page.', { advisorOnly: true, value: ctx.dataQuality.unverifiedCount });
  }
  if (ss.method === 'estimated') {
    push('ss-estimated', 'advisory', 'Social Security benefit is an estimate, not from an SSA statement', ss.note, { advisorOnly: true });
  }
  if (!TEXT_VERIFIED) {
    push('questionnaire-text', 'advisory', 'Questionnaire wording is a stand-in', 'Question and option text has not been verified against the FNCE 2830 source; the scoring structure is exact.', { advisorOnly: true });
  }

  return out
    .map((al, i) => ({ al, i }))
    .sort((x, y) => ORDER[x.al.severity] - ORDER[y.al.severity] || x.i - y.i)
    .map((x) => x.al);
}
