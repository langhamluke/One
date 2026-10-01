import { describe, expect, it } from 'vitest';
import { MILESTONES, milestoneStatus, type MilestoneContext } from './milestones';
import { analyzePortfolio } from './portfolio';
import { analyzeBudget } from './savings';
import { findSecurity } from '../data/securities';
import type { Holding } from './types';

const holding = (symbol: string, value: number): Holding => {
  const s = findSecurity(symbol)!;
  return { id: symbol, symbol, name: s.name, kind: s.kind, value, exposure: s.exposure, sectors: s.sectors, expenseRatio: s.expenseRatio };
};

const base: MilestoneContext = {
  portfolio: analyzePortfolio([], 'growth'),
  budget: analyzeBudget(0, []),
  goals: [],
  cards: [],
  credit: { hasCredit: false, missedPayments: 0, oldestAccountYears: 0, hardInquiries: 0, accountTypes: 0 },
  completedLessons: [],
  lessonsByTrack: { Saving: ['a', 'b'], Investing: ['c'], Credit: ['d'] },
  streak: 0,
  automated: false,
  checkInStreak: 0,
};
const get = (id: string) => MILESTONES.find((m) => m.id === id)!;

describe('milestones', () => {
  it('starts with everything locked and nothing ready', () => {
    for (const m of MILESTONES) expect(milestoneStatus(m, base, {}).status).toBe('locked');
  });

  it('has unique ids and non-negative bonuses', () => {
    expect(new Set(MILESTONES.map((m) => m.id)).size).toBe(MILESTONES.length);
    MILESTONES.forEach((m) => expect(m.bonus).toBeGreaterThanOrEqual(0));
  });

  it('unlocks investing milestones from a diversified, low-fee portfolio', () => {
    const ctx = { ...base, portfolio: analyzePortfolio([holding('VTI', 6000), holding('VXUS', 3000), holding('BND', 1000)], 'growth') };
    for (const id of ['first-holding', 'diversified-70', 'diversified-85', 'low-fees', 'global']) {
      expect(milestoneStatus(get(id), ctx, {}).status).toBe('ready');
    }
  });

  it('tracks credit utilization only once a card exists', () => {
    const card = (balance: number) => [{ id: 'x', name: 'x', balance, limit: 1000, apr: 0.22 }];
    expect(get('util-10').progress({ ...base, cards: card(50) })).toBe(1);
    expect(get('util-10').progress({ ...base, cards: card(300) })).toBeLessThan(1);
    expect(get('paid-off').progress({ ...base, cards: card(0) })).toBe(1);
    expect(get('paid-off').progress(base)).toBe(0);
  });

  it('completes a course only when every lesson in it is done', () => {
    expect(get('track-saving').progress({ ...base, completedLessons: ['a'] })).toBe(0.5);
    expect(get('track-saving').progress({ ...base, completedLessons: ['a', 'b'] })).toBe(1);
    expect(get('all-lessons').progress({ ...base, completedLessons: ['a', 'b', 'c', 'd'] })).toBe(1);
  });

  it('reports claimed milestones as claimed', () => {
    const ctx = { ...base, goals: [{ name: 'Fund', saved: 600, target: 500 }] };
    expect(milestoneStatus(get('starter-cushion'), ctx, {}).status).toBe('ready');
    expect(milestoneStatus(get('starter-cushion'), ctx, { 'starter-cushion': '2026-10-01' }).status).toBe('claimed');
  });
});
