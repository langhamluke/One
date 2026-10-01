import type { Insight } from './types';

export interface CreditCard {
  id: string;
  name: string;
  balance: number;
  limit: number;
  apr: number; // decimal, e.g. 0.22
}

/** Typical issuer formula: greater of $25 or 1% of balance plus this month's interest. */
export function minimumPayment(balance: number, apr: number): number {
  if (balance <= 0) return 0;
  const interest = balance * (apr / 12);
  return Math.min(balance + interest, Math.max(25, balance * 0.01 + interest));
}

export interface PayoffResult {
  months: number; // Infinity if never paid off
  totalInterest: number;
  totalPaid: number;
  schedule: { month: number; balance: number; interestPaid: number }[];
}

const MAX_MONTHS = 600;

/** Pay off a balance with a fixed monthly payment, or the minimum each month when payment === 'minimum'. */
export function payoff(balance: number, apr: number, payment: number | 'minimum'): PayoffResult {
  const r = apr / 12;
  let b = balance;
  let totalInterest = 0;
  let totalPaid = 0;
  const schedule = [{ month: 0, balance: b, interestPaid: 0 }];
  for (let m = 1; m <= MAX_MONTHS && b > 0.005; m++) {
    const pay = payment === 'minimum' ? minimumPayment(b, apr) : payment;
    const interest = b * r;
    if (pay <= interest + 1e-9) return { months: Infinity, totalInterest: Infinity, totalPaid: Infinity, schedule };
    const actual = Math.min(pay, b + interest);
    b = b + interest - actual;
    totalInterest += interest;
    totalPaid += actual;
    schedule.push({ month: m, balance: Math.max(0, b), interestPaid: totalInterest });
  }
  if (b > 0.005) return { months: Infinity, totalInterest: Infinity, totalPaid: Infinity, schedule };
  return { months: schedule.length - 1, totalInterest, totalPaid, schedule };
}

export type Strategy = 'avalanche' | 'snowball';

/**
 * Multi-card payoff. Each month every card gets its minimum, and any extra budget goes to the
 * target card: highest APR first (avalanche, cheapest) or smallest balance first (snowball, motivating).
 */
export function multiPayoff(cards: CreditCard[], monthlyBudget: number, strategy: Strategy) {
  const state = cards.filter((c) => c.balance > 0).map((c) => ({ ...c }));
  let months = 0;
  let totalInterest = 0;
  const order: string[] = [];
  const minTotal = state.reduce((s, c) => s + minimumPayment(c.balance, c.apr), 0);
  if (monthlyBudget < minTotal - 1e-9) return { feasible: false as const, minTotal };

  while (state.some((c) => c.balance > 0.005) && months < MAX_MONTHS) {
    months++;
    let budget = monthlyBudget;
    for (const c of state) {
      if (c.balance <= 0.005) continue;
      const min = minimumPayment(c.balance, c.apr);
      const interest = c.balance * (c.apr / 12);
      totalInterest += interest;
      c.balance += interest;
      const pay = Math.min(c.balance, min, budget);
      c.balance -= pay;
      budget -= pay;
    }
    const open = state.filter((c) => c.balance > 0.005);
    open.sort((a, b) => (strategy === 'avalanche' ? b.apr - a.apr || a.balance - b.balance : a.balance - b.balance || b.apr - a.apr));
    for (const c of open) {
      if (budget <= 0) break;
      const pay = Math.min(budget, c.balance);
      c.balance -= pay;
      budget -= pay;
    }
    for (const c of state) if (c.balance <= 0.005 && !order.includes(c.id)) order.push(c.id);
  }
  if (state.some((c) => c.balance > 0.005)) return { feasible: false as const, minTotal };
  return { feasible: true as const, months, totalInterest, order };
}

export function utilization(cards: CreditCard[]) {
  const balance = cards.reduce((s, c) => s + Math.max(0, c.balance), 0);
  const limit = cards.reduce((s, c) => s + Math.max(0, c.limit), 0);
  return {
    balance,
    limit,
    overall: limit > 0 ? balance / limit : 0,
    perCard: cards.map((c) => ({ id: c.id, name: c.name, ratio: c.limit > 0 ? c.balance / c.limit : 0 })),
  };
}

export function utilizationBand(ratio: number): { label: string; severity: Insight['severity'] } {
  if (ratio < 0.1) return { label: 'Excellent', severity: 'good' };
  if (ratio < 0.3) return { label: 'Good', severity: 'good' };
  if (ratio < 0.5) return { label: 'Fair', severity: 'warn' };
  return { label: 'High', severity: 'alert' };
}

/** Self-reported credit habits for an educational check-up. */
export interface CreditProfile {
  hasCredit: boolean;
  missedPayments: number; // in the last 2 years
  oldestAccountYears: number;
  hardInquiries: number; // last 12 months
  accountTypes: number; // e.g. card + student loan + auto loan = 3
}

export interface FactorResult {
  key: string;
  label: string;
  weight: number; // FICO's published importance
  rating: number; // 0..1
  status: string;
  tip: string;
}

/**
 * Rates each factor using the publicly documented FICO weightings
 * (payment history 35%, amounts owed 30%, length of history 15%, new credit 10%, credit mix 10%).
 * This is an educational health check — NOT a credit score.
 */
export function creditCheckup(profile: CreditProfile, utilRatio: number): { health: number; factors: FactorResult[] } {
  const r = (x: number) => Math.max(0, Math.min(1, x));
  const factors: FactorResult[] = [
    {
      key: 'payment',
      label: 'Payment history',
      weight: 0.35,
      rating: r(profile.missedPayments === 0 ? 1 : 0.6 - 0.2 * (profile.missedPayments - 1)),
      status: profile.missedPayments === 0 ? 'No missed payments 🎉' : `${profile.missedPayments} missed payment(s)`,
      tip: 'Turn on autopay for at least the minimum so you never miss a due date. A payment 30+ days late can stay on your report for 7 years.',
    },
    {
      key: 'utilization',
      label: 'Amounts owed (utilization)',
      weight: 0.3,
      rating: r(1 - Math.max(0, utilRatio - 0.1) / 0.6),
      status: `${Math.round(utilRatio * 100)}% of your limits used`,
      tip: 'Keep balances under 30% of your limit, and under 10% if you can. Paying before the statement closes lowers the reported balance.',
    },
    {
      key: 'length',
      label: 'Length of credit history',
      weight: 0.15,
      rating: r(profile.oldestAccountYears / 7),
      status: profile.oldestAccountYears > 0 ? `${profile.oldestAccountYears} year(s)` : 'Just getting started',
      tip: 'Time is your friend. Keep your oldest no-annual-fee card open, and use it for a small purchase now and then.',
    },
    {
      key: 'new',
      label: 'New credit',
      weight: 0.1,
      rating: r(1 - profile.hardInquiries * 0.25),
      status: `${profile.hardInquiries} hard inquiry(ies) this year`,
      tip: 'Every application can add a hard inquiry. Space out applications, and use issuers’ pre-qualification tools first.',
    },
    {
      key: 'mix',
      label: 'Credit mix',
      weight: 0.1,
      rating: r(profile.accountTypes / 3),
      status: `${profile.accountTypes} type(s) of credit`,
      tip: 'Don’t borrow just to improve your mix. It matters least and grows naturally over time (student loan, card, car loan).',
    },
  ];
  if (!profile.hasCredit) {
    return {
      health: 0,
      factors: factors.map((f) => ({ ...f, rating: 0, status: 'No credit file yet' })),
    };
  }
  const health = Math.round(100 * factors.reduce((s, f) => s + f.weight * f.rating, 0));
  return { health, factors };
}

export function creditInsights(cards: CreditCard[], profile: CreditProfile): Insight[] {
  const out: Insight[] = [];
  const u = utilization(cards);
  if (!profile.hasCredit && cards.length === 0) {
    out.push({
      id: 'start',
      severity: 'info',
      title: 'Building credit from zero',
      detail:
        'Common first steps: become an authorized user on a parent’s card, open a student or secured card (at 18+), use it for one small bill, and pay it in full every month.',
      learn: 'Under the CARD Act, people under 21 need independent income or a co-signer to get their own credit card.',
    });
  }
  for (const c of u.perCard) {
    if (c.ratio > 0.3) {
      out.push({
        id: `util-${c.id}`,
        severity: c.ratio > 0.5 ? 'alert' : 'warn',
        title: `${c.name} is ${Math.round(c.ratio * 100)}% used`,
        detail: 'High utilization on a single card can hurt your score even if your overall usage is low. Pay it down or ask for a credit-limit increase.',
      });
    }
  }
  const expensive = cards.filter((c) => c.balance > 0 && c.apr >= 0.2);
  if (expensive.length) {
    const interest = expensive.reduce((s, c) => s + (c.balance * c.apr) / 12, 0);
    out.push({
      id: 'interest',
      severity: 'warn',
      title: `Carrying a balance costs about $${interest.toFixed(2)} a month in interest`,
      detail: 'Pay the statement balance in full each month and you’ll pay $0 interest, because of the grace period.',
      learn: 'Average credit card APRs are around 21–24% in late 2026. Carrying a balance is one of the most expensive ways to borrow.',
    });
  }
  if (cards.length > 0 && u.overall < 0.1 && profile.missedPayments === 0) {
    out.push({
      id: 'great',
      severity: 'good',
      title: 'Your credit habits look great',
      detail: 'Low utilization and on-time payments are the two biggest drivers of a strong score. Keep it up!',
    });
  }
  return out;
}
