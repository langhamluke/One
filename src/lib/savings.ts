import type { Insight } from './types';

/** Future value with monthly compounding and end-of-month contributions. */
export function futureValue(principal: number, monthly: number, annualRate: number, years: number): number {
  const r = annualRate / 12;
  const n = Math.round(years * 12);
  if (r === 0) return principal + monthly * n;
  const g = Math.pow(1 + r, n);
  return principal * g + monthly * ((g - 1) / r);
}

/** Month-by-month balance series (one point per year) for charts. */
export function growthSeries(principal: number, monthly: number, annualRate: number, years: number) {
  return Array.from({ length: years + 1 }, (_, y) => ({
    year: y,
    contributed: principal + monthly * 12 * y,
    balance: futureValue(principal, monthly, annualRate, y),
  }));
}

/** Months until `current` grows to `target`. Returns Infinity if it never gets there. */
export function monthsToGoal(current: number, target: number, monthly: number, annualRate: number): number {
  if (current >= target) return 0;
  if (monthly <= 0 && (annualRate <= 0 || current <= 0)) return Infinity;
  const r = annualRate / 12;
  let v = current;
  for (let m = 1; m <= 1200; m++) {
    v = v * (1 + r) + monthly;
    if (v >= target - 1e-9) return m;
  }
  return Infinity;
}

/** Monthly amount needed to reach `target` in `months`. */
export function monthlyNeeded(current: number, target: number, months: number, annualRate: number): number {
  if (months <= 0) return Math.max(0, target - current);
  const r = annualRate / 12;
  const g = Math.pow(1 + r, months);
  const remaining = target - current * g;
  if (remaining <= 0) return 0;
  return r === 0 ? remaining / months : remaining / ((g - 1) / r);
}

export type SpendType = 'need' | 'want' | 'save';

export interface BudgetLine {
  id: string;
  label: string;
  amount: number; // monthly
  type: SpendType;
  category: string;
}

export interface BudgetAnalysis {
  income: number;
  needs: number;
  wants: number;
  savings: number;
  unassigned: number;
  shares: { needs: number; wants: number; savings: number };
  insights: Insight[];
}

export const CATEGORY_SUGGESTIONS: { label: string; type: SpendType; category: string }[] = [
  { label: 'Rent / housing', type: 'need', category: 'Housing' },
  { label: 'Groceries', type: 'need', category: 'Food' },
  { label: 'Phone bill', type: 'need', category: 'Bills' },
  { label: 'Gas / transit', type: 'need', category: 'Transport' },
  { label: 'Car insurance', type: 'need', category: 'Transport' },
  { label: 'Textbooks & supplies', type: 'need', category: 'School' },
  { label: 'Eating out & coffee', type: 'want', category: 'Food' },
  { label: 'Streaming & subscriptions', type: 'want', category: 'Subscriptions' },
  { label: 'Clothes & shopping', type: 'want', category: 'Shopping' },
  { label: 'Going out & events', type: 'want', category: 'Fun' },
  { label: 'Gaming', type: 'want', category: 'Fun' },
  { label: 'Emergency fund', type: 'save', category: 'Savings' },
  { label: 'Investing', type: 'save', category: 'Investing' },
];

export function analyzeBudget(income: number, lines: BudgetLine[]): BudgetAnalysis {
  const sum = (t: SpendType) => lines.filter((l) => l.type === t).reduce((s, l) => s + Math.max(0, l.amount), 0);
  const needs = sum('need');
  const wants = sum('want');
  const savings = sum('save');
  const unassigned = income - needs - wants - savings;
  const shares = income > 0 ? { needs: needs / income, wants: wants / income, savings: savings / income } : { needs: 0, wants: 0, savings: 0 };
  const insights: Insight[] = [];

  if (income <= 0) {
    insights.push({
      id: 'no-income',
      severity: 'info',
      title: 'Add your monthly income',
      detail: 'Include a part-time job, allowance, gig work, or financial aid refunds — whatever money comes in each month.',
    });
    return { income, needs, wants, savings, unassigned, shares, insights };
  }

  if (unassigned < 0) {
    insights.push({
      id: 'overspend',
      severity: 'alert',
      title: `You’re planning to spend $${fmt(-unassigned)} more than you earn`,
      detail: 'Spending more than you earn usually means borrowing on a credit card. Trim a “want” or two first — that’s the easiest lever.',
      learn: 'Credit card balances often charge 20%+ interest, so overspending gets expensive quickly.',
    });
  } else if (unassigned > income * 0.05) {
    insights.push({
      id: 'unassigned',
      severity: 'info',
      title: `$${fmt(unassigned)} a month has no job yet`,
      detail: 'Give every dollar a purpose. Money with no plan tends to disappear. Try sending some of it to savings automatically on payday.',
      learn: 'This is called zero-based budgeting: income minus planned spending and saving equals zero.',
    });
  }

  if (shares.savings >= 0.2) {
    insights.push({
      id: 'saver',
      severity: 'good',
      title: `You’re saving ${Math.round(shares.savings * 100)}% of your income`,
      detail: 'That beats the classic 50/30/20 guideline’s 20% savings target. Future you says thanks!',
    });
  } else if (shares.savings > 0) {
    insights.push({
      id: 'save-more',
      severity: 'info',
      title: `You save ${Math.round(shares.savings * 100)}% — every bit counts`,
      detail: `Bumping savings to 20% would mean $${fmt(income * 0.2)} a month. Even raising it by 1% each month gets you there in time.`,
    });
  } else {
    insights.push({
      id: 'start-saving',
      severity: 'warn',
      title: 'Nothing is going to savings yet',
      detail: 'Start tiny: even $10 a week is $520 a year. Set up an automatic transfer the day you get paid so you never see it.',
      learn: '“Pay yourself first” works because it removes willpower from the equation.',
    });
  }

  if (shares.wants > 0.3) {
    const biggest = lines.filter((l) => l.type === 'want').sort((a, b) => b.amount - a.amount)[0];
    insights.push({
      id: 'wants',
      severity: 'warn',
      title: `Wants are ${Math.round(shares.wants * 100)}% of your income`,
      detail: biggest
        ? `Your biggest want is “${biggest.label}” at $${fmt(biggest.amount)}/mo. Cutting it by a quarter frees up $${fmt(biggest.amount * 0.25)} a month.`
        : 'The 50/30/20 guideline suggests about 30% for wants.',
    });
  }

  const subs = lines.filter((l) => l.category === 'Subscriptions').reduce((s, l) => s + l.amount, 0);
  if (subs > 0) {
    insights.push({
      id: 'subs',
      severity: 'info',
      title: `Subscriptions cost you $${fmt(subs * 12)} a year`,
      detail: 'Check for student discounts (Spotify, Amazon Prime, Apple Music, and others offer them) and cancel anything you didn’t use last month.',
    });
  }

  if (shares.needs > 0.6) {
    insights.push({
      id: 'needs',
      severity: 'info',
      title: `Needs take ${Math.round(shares.needs * 100)}% of your income`,
      detail: 'That’s common for students with rent. Look for the big wins: roommates, meal prepping, a student transit pass, or a cheaper phone plan.',
    });
  }
  return { income, needs, wants, savings, unassigned, shares, insights };
}

/**
 * Emergency-fund guidance tuned for students: a $500 starter cushion, then 3 months of needs.
 */
export function emergencyFundTarget(monthlyNeeds: number) {
  const starter = 500;
  const full = Math.max(starter, Math.round(monthlyNeeds * 3));
  return { starter, full };
}

/** What a recurring small purchase would grow to if invested instead (for perspective, not guilt). */
export function smallHabitCost(perWeek: number, annualReturn: number, years: number) {
  const monthly = (perWeek * 52) / 12;
  return { perYear: perWeek * 52, invested: futureValue(0, monthly, annualReturn, years) };
}

export const fmt = (x: number, digits = 0) =>
  x.toLocaleString('en-US', { minimumFractionDigits: digits, maximumFractionDigits: digits });
