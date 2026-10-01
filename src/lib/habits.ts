import { futureValue } from './savings';

export type Frequency = 'weekly' | 'biweekly' | 'monthly';

export const FREQUENCY_LABEL: Record<Frequency, string> = {
  weekly: 'every week',
  biweekly: 'every two weeks',
  monthly: 'every month',
};

/** A "pay yourself first" plan: a fixed transfer on payday, plus a commitment to raise it when income rises. */
export interface SavePlan {
  amount: number;
  frequency: Frequency;
  goalId: string;
  /** The user confirmed they scheduled the automatic transfer at their bank. */
  automated: boolean;
  /** Share of any future raise the user pre-commits to saving (Save More Tomorrow). */
  raiseCommit: number;
}

const PER_MONTH: Record<Frequency, number> = { weekly: 52 / 12, biweekly: 26 / 12, monthly: 1 };

export const monthlyAmount = (p: Pick<SavePlan, 'amount' | 'frequency'>) => p.amount * PER_MONTH[p.frequency];

const DAY = 864e5;
const parse = (iso: string) => new Date(iso + 'T00:00');

/** Whole days between two yyyy-mm-dd dates. */
export const daysBetween = (from: string, to: string) => Math.round((parse(to).getTime() - parse(from).getTime()) / DAY);

/** A check-in is due if there has never been one, or the last was 7+ days ago. */
export function checkInDue(checkIns: string[], today: string): boolean {
  const last = [...checkIns].sort().pop();
  return !last || daysBetween(last, today) >= 7;
}

/** Check-in streak: check-ins each within 7 days of the next, the latest within 7 days of today. */
export function checkInWeeks(checkIns: string[], today: string): number {
  const days = [...new Set(checkIns)].sort().reverse();
  if (!days.length || daysBetween(days[0], today) > 7) return 0;
  let n = 1;
  while (n < days.length && daysBetween(days[n], days[n - 1]) <= 7) n++;
  return n;
}

export interface FreshStart {
  id: string;
  title: string;
  detail: string;
}

/**
 * Temporal landmarks make people more likely to start a goal (Dai, Milkman & Riis 2014).
 * Returns the most relevant one for a date, if any.
 */
export function freshStart(d: Date): FreshStart | null {
  const m = d.getMonth(); // 0 = January
  const day = d.getDate();
  if (m === 0 && day <= 14)
    return { id: `newyear-${d.getFullYear()}`, title: 'New year, new plan', detail: 'The start of a year is when new habits stick best. Set this year’s savings goal and automate it.' };
  if ((m === 0 && day > 14) || (m === 7 && day >= 15) || (m === 8 && day <= 15))
    return { id: `semester-${d.getFullYear()}-${m}`, title: 'New semester, fresh start', detail: 'Before the semester gets busy, decide what you’ll save from each paycheck or refund and put it on autopilot.' };
  if (m === 5 && day <= 21)
    return { id: `summer-${d.getFullYear()}`, title: 'Summer job season', detail: 'Decide now how much of each summer paycheck you’ll keep. Saving a set share before the money lands is far easier than saving what’s left.' };
  if (day <= 3)
    return { id: `month-${d.getFullYear()}-${m}`, title: 'A new month starts today', detail: 'A good moment to check your goals and nudge your automatic transfer up a little.' };
  return null;
}

/** What steady saving grows to by a future age, and what waiting five years would cost. */
export function futureSelf(p: { current: number; monthly: number; age: number; targetAge: number; rate: number }) {
  const years = Math.max(0, p.targetAge - p.age);
  const now = futureValue(p.current, p.monthly, p.rate, years);
  const waitYears = Math.max(0, years - 5);
  const later = futureValue(p.current, p.monthly, p.rate, waitYears);
  return { years, now, later, costOfWaiting: now - later, contributed: p.current + p.monthly * 12 * years };
}
