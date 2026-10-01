import type { PortfolioAnalysis } from './portfolio';
import type { BudgetAnalysis } from './savings';
import type { CreditCard, CreditProfile } from './credit';
import { utilization } from './credit';

export type MilestoneTrack = 'Saving' | 'Investing' | 'Credit' | 'Learning';

export interface MilestoneContext {
  portfolio: PortfolioAnalysis;
  budget: BudgetAnalysis;
  goals: { name: string; saved: number; target: number }[];
  cards: CreditCard[];
  credit: CreditProfile;
  completedLessons: string[];
  lessonsByTrack: Record<string, string[]>;
  streak: number;
  automated: boolean;
  checkInStreak: number;
}

export interface Milestone {
  id: string;
  track: MilestoneTrack;
  title: string;
  detail: string;
  /** Suggested dollar bonus that goes into savings when claimed. */
  bonus: number;
  points: number;
  /** 0..1 progress; 1 means unlocked. */
  progress: (c: MilestoneContext) => number;
}

const frac = (have: number, need: number) => (need <= 0 ? 1 : Math.max(0, Math.min(1, have / need)));
const trackDone = (c: MilestoneContext, track: string) =>
  frac(c.lessonsByTrack[track]?.filter((id) => c.completedLessons.includes(id)).length ?? 0, c.lessonsByTrack[track]?.length ?? 0);
const hasFunds = (c: MilestoneContext) => c.portfolio.byHolding.some((h) => h.kind === 'etf' || h.kind === 'mutualFund');
/** Ratio-style milestones (lower is better) only count once there is something to measure. */
const below = (x: number, limit: number) => (x <= limit ? 1 : Math.max(0, Math.min(0.99, limit / x)));

export const MILESTONES: Milestone[] = [
  // Saving
  { id: 'first-goal', track: 'Saving', title: 'Set a savings goal', detail: 'Name something you’re saving for.', bonus: 0, points: 25, progress: (c) => frac(c.goals.length, 1) },
  {
    id: 'starter-cushion',
    track: 'Saving',
    title: 'Build a $500 cushion',
    detail: 'Have $500 saved across your goals, the starter emergency fund.',
    bonus: 10,
    points: 100,
    progress: (c) => frac(c.goals.reduce((s, g) => s + g.saved, 0), 500),
  },
  {
    id: 'goal-reached',
    track: 'Saving',
    title: 'Reach a goal',
    detail: 'Fully fund any savings goal.',
    bonus: 10,
    points: 100,
    progress: (c) => Math.max(0, ...c.goals.map((g) => frac(g.saved, g.target))),
  },
  {
    id: 'save-20',
    track: 'Saving',
    title: 'Save 20% of your income',
    detail: 'Budget at least a fifth of what comes in for savings or investing.',
    bonus: 5,
    points: 75,
    progress: (c) => (c.budget.income > 0 ? frac(c.budget.shares.savings, 0.2) : 0),
  },
  {
    id: 'automate',
    track: 'Saving',
    title: 'Put saving on autopilot',
    detail: 'Schedule an automatic transfer to savings on payday.',
    bonus: 5,
    points: 100,
    progress: (c) => (c.automated ? 1 : 0),
  },
  {
    id: 'checkin-4',
    track: 'Saving',
    title: 'Four weekly check-ins in a row',
    detail: 'Check in on your goals once a week for a month.',
    bonus: 5,
    points: 100,
    progress: (c) => frac(c.checkInStreak, 4),
  },
  { id: 'streak-7', track: 'Saving', title: 'Seven-day streak', detail: 'Make a money move seven days in a row.', bonus: 5, points: 75, progress: (c) => frac(c.streak, 7) },

  // Investing
  { id: 'first-holding', track: 'Investing', title: 'Add your first investment', detail: 'Track something you own or plan to buy.', bonus: 0, points: 25, progress: (c) => frac(c.portfolio.byHolding.length, 1) },
  {
    id: 'diversified-70',
    track: 'Investing',
    title: 'Diversification score of 70',
    detail: 'Reach a solid foundation on the Portfolio page.',
    bonus: 5,
    points: 75,
    progress: (c) => frac(c.portfolio.score, 70),
  },
  {
    id: 'diversified-85',
    track: 'Investing',
    title: 'Diversification score of 85',
    detail: 'Build a well-diversified portfolio.',
    bonus: 10,
    points: 150,
    progress: (c) => frac(c.portfolio.score, 85),
  },
  {
    id: 'low-fees',
    track: 'Investing',
    title: 'Keep fund fees under 0.10%',
    detail: 'Hold funds with an average expense ratio below 0.10%.',
    bonus: 5,
    points: 50,
    progress: (c) => (hasFunds(c) ? below(c.portfolio.weightedExpenseRatio, 0.001) : 0),
  },
  {
    id: 'global',
    track: 'Investing',
    title: 'Go global',
    detail: 'Hold at least 20% of your stocks outside the U.S.',
    bonus: 5,
    points: 50,
    progress: (c) => frac(c.portfolio.internationalShareOfStocks, 0.2),
  },

  // Credit
  {
    id: 'util-30',
    track: 'Credit',
    title: 'Utilization under 30%',
    detail: 'Keep card balances below 30% of your limits.',
    bonus: 5,
    points: 50,
    progress: (c) => (c.cards.length ? below(utilization(c.cards).overall, 0.3) : 0),
  },
  {
    id: 'util-10',
    track: 'Credit',
    title: 'Utilization under 10%',
    detail: 'The range where scores tend to be strongest.',
    bonus: 10,
    points: 100,
    progress: (c) => (c.cards.length ? below(utilization(c.cards).overall, 0.1) : 0),
  },
  {
    id: 'on-time',
    track: 'Credit',
    title: 'Two years of on-time payments',
    detail: 'No missed payments, with credit at least two years old.',
    bonus: 10,
    points: 100,
    progress: (c) => (c.credit.hasCredit && c.credit.missedPayments === 0 ? frac(c.credit.oldestAccountYears, 2) : 0),
  },
  {
    id: 'paid-off',
    track: 'Credit',
    title: 'Pay every card in full',
    detail: 'Bring every card balance to $0.',
    bonus: 10,
    points: 100,
    progress: (c) => {
      if (!c.cards.length) return 0;
      const owed = c.cards.reduce((s, k) => s + k.balance, 0);
      return owed <= 0 ? 1 : Math.max(0, Math.min(0.99, 1 - owed / Math.max(1, c.cards.reduce((s, k) => s + k.limit, 0))));
    },
  },

  // Learning
  { id: 'first-lesson', track: 'Learning', title: 'Finish your first lesson', detail: 'Any lesson counts.', bonus: 2, points: 25, progress: (c) => frac(c.completedLessons.length, 1) },
  { id: 'track-saving', track: 'Learning', title: 'Complete the Saving course', detail: 'Finish every Saving lesson.', bonus: 5, points: 75, progress: (c) => trackDone(c, 'Saving') },
  { id: 'track-investing', track: 'Learning', title: 'Complete the Investing course', detail: 'Finish every Investing lesson.', bonus: 5, points: 75, progress: (c) => trackDone(c, 'Investing') },
  { id: 'track-credit', track: 'Learning', title: 'Complete the Credit course', detail: 'Finish every Credit lesson.', bonus: 5, points: 75, progress: (c) => trackDone(c, 'Credit') },
  {
    id: 'all-lessons',
    track: 'Learning',
    title: 'Finish every lesson',
    detail: 'Complete the full curriculum.',
    bonus: 15,
    points: 200,
    progress: (c) => frac(c.completedLessons.length, Object.values(c.lessonsByTrack).flat().length),
  },
];

export type MilestoneStatus = 'locked' | 'ready' | 'claimed';

export function milestoneStatus(m: Milestone, c: MilestoneContext, claimed: Record<string, string>): { status: MilestoneStatus; progress: number } {
  const progress = m.progress(c);
  return { status: claimed[m.id] ? 'claimed' : progress >= 1 ? 'ready' : 'locked', progress };
}
