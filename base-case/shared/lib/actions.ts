/**
 * Action items: the order of operations applied to the FIRST YEAR WITH REAL INCOME (not plan year 1), so a student
 * with no income this year still gets 401(k) guidance for the year they start. Up to five order-of-operations items,
 * then insurance gaps and a loan-plan comparison when relevant.
 */
import type { ActionItem } from './types';
import { isPilotPlan, type PlanState } from './inputs';
import type { EmergencyFund, PathResult, YearRow } from './derived';
import type { LedgerOutput } from './plan';
import { deferralLimit, hsaLimit, iraLimit } from './limits';
import { initialMonthlyPayment, levelPayment, rapMonthlyPayment, tieredStandardTermMonths } from './loans';
import { emergencyMonths, emergencyTarget } from './scoring';
import { matchLeftOnTable } from './alerts';
import { fmtMoney, fmtPct } from './format';
import { STARTER_FUND, UTILIZATION_CAUTION, cardUtilization } from './sprout';

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
  const cashStart = fi > 0 ? rows[fi - 1].balances.cash : Math.max(0, state.balanceSheet.cash);
  if (state.product === 'sprout') return buildStudentActions(ctx, row, pay, year, cashStart);

  // 1. Emergency fund
  const months = emergencyMonths(state).months;
  const target = months * ((row.livingExpenses + row.debtService) / 12);
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
  const pilot = isPilotPlan(state);
  const noLtd = !b.disabilityCoverage && !state.insurance.disability;
  const noLol = pilot && !state.insurance.lossOfLicense;
  if (pilot && (noLtd || noLol)) {
    items.push({ id: 'action-insurance-pilot', rank: items.length + 1, category: 'insurance', title: `Add ${[noLtd && 'own-occupation disability', noLol && 'loss-of-license'].filter(Boolean).join(' + ')} coverage`, detail: 'Protects the pilot certificate, the engine of the whole plan. Union group plans are a start; check the benefit against the pay projection.' });
  } else if (noLtd) {
    items.push({ id: 'action-insurance-disability', rank: items.length + 1, category: 'insurance', title: 'Close the disability-insurance gap', detail: 'No long-term disability coverage is recorded. Check the employer plan first; individual coverage typically costs 1-3% of salary.' });
  }

  // Airline-specific (Flight Plan)
  if (pilot) {
    const pp = state.profile.pilot;
    if (pp?.employer === 'fedex' && (pp.stage === 'cargo_fo' || pp.stage === 'cargo_ca')) {
      items.push({ id: 'action-fedex-election', rank: items.length + 1, category: 'other', title: 'Model and make the FedEx pension election (Apr–May 30, 2027)', detail: 'Compare the legacy pension and the market-based cash balance plan with the FedEx option on the career path before the irrevocable deadline.' });
    }
    const u = ctx.ledger.usage;
    if (u.s415cSpill > 0.5) {
      items.push({
        id: 'action-415c',
        rank: items.length + 1,
        category: 'tax',
        title: `Plan for §415(c) spillover from age ${u.s415cSpillFirstAge ?? '—'}`,
        detail: u.s415cHandling === 'cash' ? 'Company contributions above the annual-additions limit are paid as taxable cash; invest the after-tax amount in a tax-efficient taxable account rather than spending it.' : u.s415cHandling === 'mbcb' ? 'Excess company contributions go to the market-based cash balance plan; confirm the plan mechanics and keep its balance in the retirement picture.' : 'Excess company contributions are forfeited under the current setting; confirm the plan document.',
        amount: u.s415cSpill,
      });
    }
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

/**
 * Sprout: three to six next steps, easiest first. An automatic transfer (five minutes at the bank), the $500 starter
 * cushion, a card balance back to zero, the first savings goal, then a Roth IRA once there is earned income. Every
 * suggested automatic transfer carries the low-balance warning (product rule).
 */
function buildStudentActions(ctx: ActionContext, row: YearRow, pay: number, year: number, cashStart: number): ActionItem[] {
  const { state } = ctx;
  const sv = state.savings;
  const items: Omit<ActionItem, 'rank' | 'id'>[] = [];
  const idx = state.assumptions.indexing ?? state.assumptions.inflation;
  const monthlyIn = Math.max(0, row.takeHome) / 12;
  const planned = Math.max(0, sv.taxableContribution) + Math.max(0, sv.iraContribution) + (pay > 0 ? Math.max(0, sv.deferralPct) * pay : 0) + Math.max(0, state.whatIf.extraSavingsRatePct) * pay;

  // 1. Pay yourself first (easiest)
  if (planned <= 0 && monthlyIn > 0) {
    const suggested = Math.max(20, Math.round((monthlyIn * 0.1) / 5) * 5);
    items.push({
      category: 'goal',
      title: `Set up an automatic transfer of ${fmtMoney(suggested)} a month to savings`,
      detail: `About 10% of the ${fmtMoney(monthlyIn)} a month you have coming in, moved the day money lands so you never see it. Low-balance warning: pick an amount your checking account can cover on its lowest day, because an overdraft fee costs more than a month of saving. Set it on the Save & spend screen.`,
      amount: suggested * 12,
    });
  }

  // 2. Starter cushion, then the full target
  const em = emergencyTarget(state, (row.livingExpenses + row.debtService) / 12);
  if (cashStart < STARTER_FUND.value - 1) {
    items.push({
      category: 'emergency',
      title: `Build the ${fmtMoney(STARTER_FUND.value)} starter cushion (${fmtMoney(cashStart)} saved)`,
      detail: 'A flat tire or a broken phone screen should come out of savings, not a credit card. Keep it in a savings account you do not spend from.',
      amount: STARTER_FUND.value - cashStart,
    });
  } else if (em.target - cashStart > 1) {
    items.push({
      category: 'emergency',
      title: `Grow the emergency fund to ${fmtMoney(em.target)}`,
      detail: `${em.reason}. ${fmtMoney(cashStart)} is set aside today.`,
      amount: em.target - cashStart,
    });
  }

  // 3. Card balance to zero
  const u = cardUtilization(state);
  if (u.balance > 0) {
    const worst = u.cards.filter((c) => c.ratio != null).sort((a, b) => (b.ratio ?? 0) - (a.ratio ?? 0))[0];
    items.push({
      category: 'debt',
      title: `Pay the card balance down to $0 (${fmtMoney(u.balance)} owed)`,
      detail: `Pay the full statement balance by the due date and the card charges no interest.${worst && (worst.ratio ?? 0) > UTILIZATION_CAUTION ? ` ${worst.name} is at ${fmtPct(worst.ratio ?? 0, 0)} of its limit; under ${fmtPct(UTILIZATION_CAUTION, 0)} is the usual rule of thumb for your credit score.` : ''}`,
      amount: u.balance,
    });
  }

  // 4. Other high-interest debt
  const hi = state.debts.filter((d) => d.kind !== 'credit_card' && d.balance > 0 && d.rate > HIGH_INTEREST_RATE);
  if (hi.length) {
    const bal = hi.reduce((s, d) => s + d.balance, 0);
    items.push({ category: 'debt', title: `Pay off high-interest debt (${fmtMoney(bal)})`, detail: `${hi.map((d) => `${d.name} ${fmtPct(d.rate, 1)}`).join(', ')}. Anything above ${fmtPct(HIGH_INTEREST_RATE, 0)} costs more than saving is likely to earn.`, amount: bal });
  }

  // 5. First savings goal
  const goal = [...state.goals].sort((a, b) => a.priority - b.priority || a.targetYear - b.targetYear).find((g) => g.fundedSoFar < g.targetAmount && g.targetYear >= year);
  if (goal) {
    const monthsLeft = Math.max(1, (goal.targetYear - year + 1) * 12);
    const perMonth = (goal.targetAmount - goal.fundedSoFar) / monthsLeft;
    items.push({ category: 'goal', title: `Save ${fmtMoney(perMonth)} a month for ${goal.name}`, detail: `${fmtMoney(goal.fundedSoFar)} of ${fmtMoney(goal.targetAmount)} saved; ${fmtMoney(perMonth)} a month gets there by ${goal.targetYear}. Give the goal its own savings account so it does not get spent.`, amount: perMonth * 12 });
  }

  // 6. Roth IRA with earned income
  if (pay > 0 && row.limits.rothIra !== 'none') {
    const lim = iraLimit(row.age, year, idx).total;
    const room = Math.min(lim, row.limits.rothIraAllowed) - row.iraContribution;
    if (room > 1) {
      items.push({
        category: 'ira',
        title: `Learn about a Roth IRA: up to ${fmtMoney(room)} of this year's pay could go in`,
        detail: `Roth IRA contributions are limited to earned income (your job pay, not allowance), up to ${fmtMoney(lim)} in ${year}. ${row.age < 18 ? 'Under 18 it is a custodial account a parent or guardian opens with you. ' : ''}Money you put in can come back out without tax or penalty; growth is for later. This is an account type to understand, not a recommendation to buy anything.`,
        amount: room,
      });
    }
  }

  // 7. Credit basics for an adult without any card history
  const st = state.profile.student;
  if (st && st.card === 'none' && row.age >= 18) {
    items.push({ category: 'other', title: 'Start a credit history on purpose', detail: 'Common first steps at 18 or older: become an authorized user on a parent\'s card, or open a student or secured card, put one small bill on it and set autopay to the full balance. Under 21 you need your own income or a co-signer (CARD Act).' });
  }

  return items.slice(0, 6).map((it, i) => ({ id: `action-student-${it.category}-${i}`, rank: i + 1, ...it }));
}
