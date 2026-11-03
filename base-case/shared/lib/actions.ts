/**
 * Action items: the order of operations applied to the FIRST YEAR WITH REAL INCOME (not plan year 1), so a student
 * with no income this year still gets 401(k) guidance for the year they start. Up to five order-of-operations items,
 * then insurance gaps and a loan-plan comparison when relevant.
 */
import type { ActionItem } from './types';
import type { PlanState } from './inputs';
import type { EmergencyFund, PathResult } from './derived';
import type { LedgerOutput } from './plan';
import { deferralLimit, hsaLimit, iraLimit } from './limits';
import { initialMonthlyPayment, levelPayment, rapMonthlyPayment, tieredStandardTermMonths } from './loans';
import { emergencyMonths } from './scoring';
import { matchLeftOnTable } from './alerts';
import { fmtMoney, fmtPct } from './format';

export interface ActionContext {
  state: PlanState;
  active: PathResult;
  ledger: LedgerOutput;
  emergency: EmergencyFund;
}

export const HIGH_INTEREST_RATE = 0.07;

export function buildActions(ctx: ActionContext): ActionItem[] {
  const { state, active } = ctx;
  const rows = active.rows;
  if (rows.length === 0) return [];
  const fi = Math.min(Math.max(0, active.firstIncomeYearIndex), rows.length - 1);
  const row = rows[fi];
  const pay = row.wages + row.bonus;
  const year = row.year;
  const idx = state.assumptions.indexing ?? state.assumptions.inflation;
  const b = state.benefits;
  const sv = state.savings;
  const core: Omit<ActionItem, 'rank' | 'id'>[] = [];

  // 1. Emergency fund
  const months = emergencyMonths(state).months;
  const target = months * ((row.livingExpenses + row.debtService) / 12);
  const cashStart = fi > 0 ? rows[fi - 1].balances.cash : Math.max(0, state.balanceSheet.cash);
  if (target - cashStart > 1) {
    core.push({
      category: 'emergency',
      title: `Build the emergency fund to ${fmtMoney(target)} (${months} months)`,
      detail: `${months} months of essentials (living costs plus debt payments) in ${year}; ${fmtMoney(cashStart)} is set aside today. Keep it in high-yield savings.`,
      amount: target - cashStart,
    });
  }

  // 2. High-interest debt
  const hi = state.debts.filter((d) => d.balance > 0 && d.rate > HIGH_INTEREST_RATE);
  if (hi.length) {
    const bal = hi.reduce((s, d) => s + d.balance, 0);
    core.push({
      category: 'debt',
      title: `Pay off high-interest debt (${fmtMoney(bal)})`,
      detail: `${hi.map((d) => `${d.name} ${fmtPct(d.rate, 1)}`).join(', ')}. Anything above ${fmtPct(HIGH_INTEREST_RATE, 0)} beats the expected return of investing, so attack the highest rate first.`,
      amount: bal,
    });
  }

  const working = (row.stage === 'working' || row.stage === 'gap') && pay > 0;

  // 3. Full match
  if (working) {
    const m = matchLeftOnTable(state, pay, year);
    if (m.amount > 0.5) {
      core.push({
        category: 'match',
        title: `Raise the 401(k) deferral to ${fmtPct(m.neededPct, 1)} to capture the full match`,
        detail: `Deferring ${fmtPct(sv.deferralPct, 1)} today leaves ${fmtMoney(m.amount)}/yr of employer match unclaimed in ${year}.`,
        amount: m.amount,
      });
    }
  }

  // 4. HSA
  if (working && b.hsaEligible) {
    const coverage: 'self' | 'family' = state.profile.filingStatus === 'mfj' || state.profile.dependents > 0 ? 'family' : 'self';
    const lim = hsaLimit(coverage, row.age, year, idx).total;
    const room = lim - row.hsaEmployer - row.hsaEmployee;
    if (room > 1) {
      core.push({
        category: 'hsa',
        title: `Contribute ${fmtMoney(room)} more to the HSA`,
        detail: `${year} limit ${fmtMoney(lim)} (${coverage}); employer seeds ${fmtMoney(row.hsaEmployer)}, you add ${fmtMoney(row.hsaEmployee)}. Payroll HSA dollars skip income tax and FICA.`,
        amount: room,
      });
    }
  }

  // 5. Roth IRA / backdoor
  if (pay > 0) {
    const lim = iraLimit(row.age, year, idx).total;
    if (row.limits.rothIra === 'none') {
      core.push({
        category: 'ira',
        title: `Use a backdoor Roth IRA (${fmtMoney(lim)}/yr)`,
        detail: `Income is above the Roth IRA MAGI limit in ${year}; a non-deductible traditional contribution converted to Roth achieves the same result when no pre-tax IRA balances exist.`,
        amount: lim,
      });
    } else {
      const allowed = Math.min(lim, row.limits.rothIraAllowed);
      const room = allowed - row.iraContribution;
      if (room > 1) {
        core.push({
          category: 'ira',
          title: `Fund a Roth IRA with ${fmtMoney(room)}${row.limits.rothIra === 'partial' ? ' (partially phased out)' : ''}`,
          detail: `${year} limit ${fmtMoney(lim)}; the plan currently contributes ${fmtMoney(row.iraContribution)}. Roth dollars grow and come out tax-free, and contributions can be withdrawn in a pinch.`,
          amount: room,
        });
      }
    }
  }

  // 6. 401(k) toward the max
  if (working) {
    const lim = deferralLimit(row.age, year, idx).total;
    const employee = row.employeePretax401k + row.employeeRoth401k;
    const room = lim - employee;
    if (room > 1) {
      const amount = row.unallocated > 1 ? Math.min(room, row.unallocated) : room;
      core.push({
        category: '401k',
        title: `Raise the 401(k) toward the ${fmtMoney(lim)} limit`,
        detail: `Deferring ${fmtMoney(employee)} in ${year} leaves ${fmtMoney(room)} of room${row.unallocated > 1 ? `; ${fmtMoney(row.unallocated)}/yr is unallocated today` : ''}.`,
        amount,
      });
    }
  }

  // 7. Taxable investing
  if (row.unallocated > 1) {
    core.push({
      category: 'taxable',
      title: `Invest the remaining ${fmtMoney(row.unallocated)}/yr in a taxable account`,
      detail: 'Cash flow left after the steps above is assumed spent; automate a transfer to a low-cost diversified brokerage account.',
      amount: row.unallocated,
    });
  }

  const items: ActionItem[] = core.slice(0, 5).map((it, i) => ({ id: `action-${it.category}-${i}`, rank: i + 1, ...it }));

  // Insurance gaps
  if (!b.disabilityCoverage && !state.insurance.disability) {
    items.push({ id: 'action-insurance-disability', rank: items.length + 1, category: 'insurance', title: 'Close the disability-insurance gap', detail: 'No long-term disability coverage is recorded. Check the employer plan first; individual coverage typically costs 1-3% of salary.' });
  }
  if (!state.insurance.renters && state.profile.housingCost > 0) {
    items.push({ id: 'action-insurance-renters', rank: items.length + 1, category: 'insurance', title: 'Add renters insurance', detail: 'Covers belongings and liability for roughly $15-30 a month.' });
  }

  // Loan-plan choice
  const feds = state.debts.filter((d) => d.kind === 'federal_student' && d.balance > 0);
  if (feds.length > 0) {
    const agi = Math.max(0, row.grossIncome - row.employeePretax401k - row.hsaEmployee);
    const householdSize = 1 + state.profile.dependents + (state.profile.filingStatus === 'mfj' ? 1 : 0);
    // RAP is ONE payment per borrower covering every Direct loan; the tiered standard plan is per loan.
    const rap = rapMonthlyPayment(agi, state.profile.dependents);
    const fedBalance = feds.reduce((s, d) => s + d.balance, 0);
    const tieredTotal = feds.reduce((s, d) => s + levelPayment(d.balance, d.rate, tieredStandardTermMonths(d.originalBalance ?? d.balance)), 0);
    const anyRap = feds.some((d) => d.federalPlan === 'rap');
    const current = (anyRap ? rap : 0) + feds.filter((d) => d.federalPlan !== 'rap').reduce((s, d) => s + initialMonthlyPayment(d, { agi, dependents: state.profile.dependents, householdSize }), 0);
    const longestTerm = Math.max(...feds.map((d) => tieredStandardTermMonths(d.originalBalance ?? d.balance)));
    const avgRate = feds.reduce((s, d) => s + d.rate * d.balance, 0) / Math.max(1, fedBalance);
    items.push({
      id: 'action-loans-plan',
      rank: items.length + 1,
      category: 'loans',
      title: `Compare RAP vs tiered standard: RAP ${fmtMoney(rap)}/mo vs ${fmtMoney(tieredTotal)}/mo`,
      detail: `${feds.length === 1 ? feds[0].name : `${feds.length} federal loans (${fmtMoney(fedBalance)})`}: the current plan choice pays about ${fmtMoney(current)}/mo. RAP is ${fmtPct((rap * 12) / Math.max(1, agi), 1)} of AGI for all federal loans combined, with unpaid interest waived and a $50/mo principal match; the tiered standard plan runs up to ${longestTerm / 12} years at about ${fmtPct(avgRate, 2)}. RAP forgives any balance left after 360 payments.`,
      amount: Math.abs(rap - tieredTotal) * 12,
    });
  }

  return items;
}
