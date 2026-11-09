/**
 * Alert ledger. Rules are evaluated against the active path and sorted warning -> caution -> advisory
 * (insertion order inside a severity). Advisor-only rows carry advisorOnly: true.
 */
import type { Alert, Severity } from './types';
import { isPilotPlan, type PlanState } from './inputs';
import type { EmergencyFund, MonteCarloResult, PathResult, RiskProfile, SocialSecurityEstimate } from './derived';
import type { LedgerOutput } from './plan';
import { STATES } from '../data/states';
import { TEXT_VERIFIED } from '../data/questionnaire';
import { AIRLINES, bindingPay415c, type AirlineId } from '../data/airlines';
import { LIMITS_2026 } from '../data/irs2026';
import { FAA_RETIREMENT_AGE } from './airline';
import { compensationCap, deferralLimit } from './limits';
import { fmtMoney, fmtPct } from './format';

function fmtMonth(iso: string): string {
  const [y, m] = iso.split('-');
  if (!y || !m) return iso;
  const names = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
  return `${names[Number(m) - 1] ?? m} ${y}`;
}

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
  const pilot = isPilotPlan(state);
  const airlinePath = rows.some((r) => r.airline);
  if (!state.benefits.disabilityCoverage && !state.insurance.disability) {
    push('disability', 'caution', pilot ? 'No long-term disability coverage' : 'No long-term disability coverage', pilot ? 'Own-occupation LTD protects the largest asset in the plan: future pilot earnings. Union group plans are a start; check the benefit cap against the pay projection.' : 'Your ability to earn is your largest asset at this stage; check whether work offers group LTD, or price an individual policy.');
  }
  if (pilot && !state.insurance.lossOfLicense) {
    push('loss-of-license', 'caution', 'No loss-of-license coverage', 'A medical certificate denial ends pilot income even when a general disability policy would not pay. Loss-of-license coverage bridges that gap.');
  }
  const dependents = state.profile.dependents > 0 || state.profile.filingStatus === 'mfj';
  if (dependents && first && first.wages > 0 && !state.insurance.life && state.benefits.lifeCoverageMultiple < 5) {
    push('life-insurance', 'caution', 'Life insurance looks thin with dependents', `No individual term policy is recorded and employer coverage is ${state.benefits.lifeCoverageMultiple > 0 ? `${state.benefits.lifeCoverageMultiple}× salary` : 'none'}; a common rule of thumb with dependents is around 10× income (${fmtMoney(10 * (first.wages + first.bonus))}).`);
  }
  if (!state.insurance.renters) {
    push('renters', 'advisory', 'No renters insurance', 'Renters insurance is inexpensive and covers belongings and liability; most landlords require it.');
  }

  // Airline-specific (Flight Plan)
  if (pilot) {
    if (state.supplement?.s2 === 2) {
      push('employer-stock', 'caution', 'Employer stock / profit-sharing reliance', 'Income and investments tied to one airline compound career risk. Keep employer stock small and budget without profit sharing.');
    }
    const carriers = new Set<AirlineId>();
    for (const r of rows) if (r.airline && AIRLINES[r.airline.id as AirlineId]) carriers.add(r.airline.id as AirlineId);
    if (carriers.has('envoy')) {
      push('envoy-premium', 'advisory', `Envoy premium pay ends ${fmtMonth(AIRLINES.envoy.premium?.ends.slice(0, 7) ?? '2026-12')}`, 'The 50% pilot-supply premium is not projected after 2026; the plan uses base rates.');
    }
    const pp = state.profile.pilot;
    if (pp?.employer === 'fedex' && (pp.stage === 'cargo_fo' || pp.stage === 'cargo_ca')) {
      const w = AIRLINES.fedex.retirement.pension?.electionWindow;
      push('fedex-election', 'caution', 'FedEx pension election: Apr–May 2027', `${w?.value ?? 'Election window per the 2026 CBA'}. One-time and irrevocable: legacy pension vs. market-based cash balance plan. Compare both with the FedEx option on the career path before the deadline.`);
    }
    for (const id of carriers) {
      const al = AIRLINES[id];
      if ((al.kind === 'major' || al.kind === 'cargo') && /^\d{4}-\d{2}/.test(al.amendable.value)) {
        push(`amendable-${id}`, 'advisory', `${al.code} contract amendable ${fmtMonth(al.amendable.value.slice(0, 7))}`, `Pay beyond the contract term uses the pay-growth assumption (${fmtPct(state.careerPaths.find((p) => p.id === active.pathId)?.airline?.payGrowthAfterContract ?? 0.03, 1)}/yr).`);
      }
    }
    if (u.s415cSpill > 0.5 && u.s415cHandling) {
      const h = u.s415cHandling;
      const major = [...carriers].map((c) => AIRLINES[c]).filter((al) => al.kind === 'major' || al.kind === 'cargo');
      const pct = Math.max(0, ...major.map((al) => al.retirement.companyPct.value)) / 100;
      const bind = bindingPay415c(pct, LIMITS_2026.electiveDeferral.value, LIMITS_2026.annualAdditions415c.value);
      push(
        's415c-spill',
        'caution',
        h === 'cash' ? '§415(c) limit: company money spills to taxable cash' : h === 'mbcb' ? '§415(c) limit: excess company money goes to the cash balance plan' : '§415(c) limit: excess company money is forfeited',
        `Binds from age ${u.s415cSpillFirstAge ?? '—'}; with ${fmtPct(pct, 0)} company contributions plus a maximum deferral the cap binds near ${Number.isFinite(bind) ? fmtMoney(bind) : '—'} of pay (2026 dollars). ${fmtMoney(u.s415cSpill)} of company money is affected over the projection.`,
        { value: u.s415cSpill },
      );
    }
    if (airlinePath && state.profile.retirementAge > FAA_RETIREMENT_AGE) {
      push('faa-65', 'advisory', `Airline flying ends at ${FAA_RETIREMENT_AGE}`, `The plan's retirement age is ${state.profile.retirementAge}; airline pay stops at the FAA age limit, so the projection retires the pilot at ${FAA_RETIREMENT_AGE}.`);
    }
    const retireAt = state.whatIf.retireAtOverride ?? state.profile.retirementAge;
    if (retireAt < FAA_RETIREMENT_AGE) {
      push('early-retirement', 'advisory', `Early retirement at ${retireAt}`, 'Social Security and pension timing matter more with an earlier landing; Social Security cannot start before 62 and Medicare before 65.');
    }
  }

  // High-interest debt
  const hi = state.debts.filter((d) => d.balance > 0 && d.rate > ctx.expectedReturn);
  if (hi.length) {
    const bal = hi.reduce((s, d) => s + d.balance, 0);
    push('high-interest-debt', 'caution', `High-interest debt: ${fmtMoney(bal)}`, `${hi.map((d) => `${d.name} at ${fmtPct(d.rate, 1)}`).join(', ')} cost more than the portfolio is expected to earn (${fmtPct(ctx.expectedReturn, 1)}). Pay these down before investing beyond the match.`, { value: bal });
  }

  // Lines of credit secured by assets
  const sbloc = state.debts.filter((d) => d.kind === 'sbloc' && d.balance > 0);
  if (sbloc.length) {
    const bal = sbloc.reduce((s, d) => s + d.balance, 0);
    const portfolio = state.balanceSheet.taxable;
    const ltv = portfolio > 0 ? bal / portfolio : null;
    push('sbloc-risk', ltv !== null && ltv > 0.5 ? 'caution' : 'advisory', `Securities-based line of credit: ${fmtMoney(bal)}${ltv !== null ? ` (${fmtPct(ltv, 0)} of the taxable portfolio)` : ''}`,
      'An SBLOC is a demand loan at a variable rate (usually SOFR plus a spread). If the pledged portfolio falls, the lender can require more collateral or sell holdings without notice, possibly at a loss and with taxable gains. Proceeds cannot be used to buy securities. FINRA suggests borrowing well below the maximum offered.', { value: bal });
  }
  const heloc = state.debts.filter((d) => d.kind === 'heloc' && d.balance > 0);
  if (heloc.length) {
    const bal = heloc.reduce((s, d) => s + d.balance, 0);
    push('heloc-risk', 'advisory', `Home equity line of credit: ${fmtMoney(bal)}`,
      'A HELOC rate floats with the prime rate and the home secures the debt. Interest is deductible only if the money buys, builds or substantially improves the home that secures it, and only when you itemize (IRC §163(h) as made permanent by P.L. 119-21). Using it to pay off cards converts unsecured debt into debt secured by your home.', { value: bal });
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
  if ((u.s415c && !(u.s415cSpill > 0.5)) || u.deferralCapped) {
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
