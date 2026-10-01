import { create } from 'zustand';
import { persist } from 'zustand/middleware';
import type { Holding, RiskProfile } from './lib/types';
import type { BudgetLine } from './lib/savings';
import type { CreditCard, CreditProfile } from './lib/credit';

export type Stage = 'highSchool' | 'college' | 'graduated';

export interface SavingsGoal {
  id: string;
  name: string;
  target: number;
  saved: number;
  /** ISO date (yyyy-mm-dd) or empty for no deadline. */
  deadline: string;
}

export interface Deposit {
  id: string;
  goalId: string;
  amount: number;
  date: string; // ISO date
  /** Logged from a claimed milestone bonus. */
  bonus?: boolean;
}

export interface Profile {
  name: string;
  stage: Stage;
  age: number;
  riskProfile: RiskProfile;
  onboarded: boolean;
}

interface State {
  profile: Profile;
  holdings: Holding[];
  income: number;
  budget: BudgetLine[];
  goals: SavingsGoal[];
  deposits: Deposit[];
  cards: CreditCard[];
  credit: CreditProfile;
  xp: number;
  completedLessons: string[];
  /** ISO dates on which the user did something money-positive (for streaks). */
  activeDays: string[];
  /** Milestone id -> date its bonus was claimed. */
  claimed: Record<string, string>;
  /** Who funds milestone bonuses (a parent, a sponsor, or the user). */
  sponsor: string;

  setProfile: (p: Partial<Profile>) => void;
  addHolding: (h: Omit<Holding, 'id'>) => void;
  updateHolding: (id: string, patch: Partial<Holding>) => void;
  removeHolding: (id: string) => void;
  setHoldings: (h: Holding[]) => void;
  setIncome: (n: number) => void;
  addBudgetLine: (l: Omit<BudgetLine, 'id'>) => void;
  updateBudgetLine: (id: string, patch: Partial<BudgetLine>) => void;
  removeBudgetLine: (id: string) => void;
  addGoal: (g: Omit<SavingsGoal, 'id' | 'saved'>) => void;
  removeGoal: (id: string) => void;
  deposit: (goalId: string, amount: number) => void;
  addCard: (c: Omit<CreditCard, 'id'>) => void;
  updateCard: (id: string, patch: Partial<CreditCard>) => void;
  removeCard: (id: string) => void;
  setCredit: (p: Partial<CreditProfile>) => void;
  completeLesson: (id: string, xp: number) => void;
  claimBonus: (id: string, points: number, goalId: string | null, amount: number) => void;
  setSponsor: (name: string) => void;
  reset: () => void;
}

export const uid = () => Math.random().toString(36).slice(2, 10);
/** Local-time yyyy-mm-dd (toISOString would use UTC and flip days in the evening). */
export const isoDay = (d: Date) =>
  `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
export const today = () => isoDay(new Date());

const markActive = (days: string[]) => (days.includes(today()) ? days : [...days, today()]);

const initial = {
  profile: { name: '', stage: 'college' as Stage, age: 19, riskProfile: 'growth' as RiskProfile, onboarded: false },
  holdings: [] as Holding[],
  income: 0,
  budget: [] as BudgetLine[],
  goals: [] as SavingsGoal[],
  deposits: [] as Deposit[],
  cards: [] as CreditCard[],
  credit: { hasCredit: false, missedPayments: 0, oldestAccountYears: 0, hardInquiries: 0, accountTypes: 0 },
  xp: 0,
  completedLessons: [] as string[],
  activeDays: [] as string[],
  claimed: {} as Record<string, string>,
  sponsor: '',
};

export const useStore = create<State>()(
  persist(
    (set) => ({
      ...initial,
      setProfile: (p) => set((s) => ({ profile: { ...s.profile, ...p } })),
      addHolding: (h) =>
        set((s) => ({ holdings: [...s.holdings, { ...h, id: uid() }], xp: s.xp + 5, activeDays: markActive(s.activeDays) })),
      updateHolding: (id, patch) => set((s) => ({ holdings: s.holdings.map((h) => (h.id === id ? { ...h, ...patch } : h)) })),
      removeHolding: (id) => set((s) => ({ holdings: s.holdings.filter((h) => h.id !== id) })),
      setHoldings: (holdings) => set({ holdings }),
      setIncome: (income) => set({ income }),
      addBudgetLine: (l) => set((s) => ({ budget: [...s.budget, { ...l, id: uid() }] })),
      updateBudgetLine: (id, patch) => set((s) => ({ budget: s.budget.map((l) => (l.id === id ? { ...l, ...patch } : l)) })),
      removeBudgetLine: (id) => set((s) => ({ budget: s.budget.filter((l) => l.id !== id) })),
      addGoal: (g) => set((s) => ({ goals: [...s.goals, { ...g, id: uid(), saved: 0 }], xp: s.xp + 10 })),
      removeGoal: (id) =>
        set((s) => ({ goals: s.goals.filter((g) => g.id !== id), deposits: s.deposits.filter((d) => d.goalId !== id) })),
      deposit: (goalId, amount) =>
        set((s) => ({
          goals: s.goals.map((g) => (g.id === goalId ? { ...g, saved: Math.max(0, g.saved + amount) } : g)),
          deposits: [...s.deposits, { id: uid(), goalId, amount, date: today() }],
          xp: s.xp + (amount > 0 ? 10 : 0),
          activeDays: amount > 0 ? markActive(s.activeDays) : s.activeDays,
        })),
      addCard: (c) => set((s) => ({ cards: [...s.cards, { ...c, id: uid() }], credit: { ...s.credit, hasCredit: true } })),
      updateCard: (id, patch) => set((s) => ({ cards: s.cards.map((c) => (c.id === id ? { ...c, ...patch } : c)) })),
      removeCard: (id) => set((s) => ({ cards: s.cards.filter((c) => c.id !== id) })),
      setCredit: (p) => set((s) => ({ credit: { ...s.credit, ...p } })),
      completeLesson: (id, xp) =>
        set((s) =>
          s.completedLessons.includes(id)
            ? s
            : { completedLessons: [...s.completedLessons, id], xp: s.xp + xp, activeDays: markActive(s.activeDays) },
        ),
      claimBonus: (id, points, goalId, amount) =>
        set((s) =>
          s.claimed[id]
            ? s
            : {
                claimed: { ...s.claimed, [id]: today() },
                xp: s.xp + points,
                goals: goalId && amount > 0 ? s.goals.map((g) => (g.id === goalId ? { ...g, saved: g.saved + amount } : g)) : s.goals,
                deposits:
                  goalId && amount > 0 ? [...s.deposits, { id: uid(), goalId, amount, date: today(), bonus: true }] : s.deposits,
              },
        ),
      setSponsor: (sponsor) => set({ sponsor }),
      reset: () => set({ ...initial }),
    }),
    { name: 'sprout-v1', version: 1 },
  ),
);

/** Consecutive active days ending today (or yesterday, so a streak isn't lost before you log in). */
export function streak(days: string[]): number {
  const set = new Set(days);
  const d = new Date();
  if (!set.has(isoDay(d))) d.setDate(d.getDate() - 1);
  let n = 0;
  while (set.has(isoDay(d))) {
    n++;
    d.setDate(d.getDate() - 1);
  }
  return n;
}

export const LEVELS = [
  { xp: 0, name: 'Seedling' },
  { xp: 100, name: 'Sprout' },
  { xp: 300, name: 'Sapling' },
  { xp: 600, name: 'Young Tree' },
  { xp: 1000, name: 'Money Oak' },
  { xp: 1600, name: 'Forest Builder' },
];

export function levelFor(xp: number) {
  let i = 0;
  while (i + 1 < LEVELS.length && xp >= LEVELS[i + 1].xp) i++;
  const next = LEVELS[i + 1];
  return {
    index: i + 1,
    name: LEVELS[i].name,
    next: next?.name,
    progress: next ? (xp - LEVELS[i].xp) / (next.xp - LEVELS[i].xp) : 1,
    toNext: next ? next.xp - xp : 0,
  };
}
