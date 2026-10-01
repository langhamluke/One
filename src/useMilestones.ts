import { useMemo } from 'react';
import { useStore, streak } from './store';
import { analyzePortfolio } from './lib/portfolio';
import { analyzeBudget } from './lib/savings';
import { MILESTONES, milestoneStatus, type MilestoneContext } from './lib/milestones';
import { LESSONS } from './data/lessons';

const lessonsByTrack = LESSONS.reduce<Record<string, string[]>>((m, l) => ({ ...m, [l.track]: [...(m[l.track] ?? []), l.id] }), {});

/** Every milestone with its live status, computed from the store. */
export function useMilestones() {
  const s = useStore();
  return useMemo(() => {
    const ctx: MilestoneContext = {
      portfolio: analyzePortfolio(s.holdings, s.profile.riskProfile),
      budget: analyzeBudget(s.income, s.budget),
      goals: s.goals,
      cards: s.cards,
      credit: s.credit,
      completedLessons: s.completedLessons,
      lessonsByTrack,
      streak: streak(s.activeDays),
    };
    return MILESTONES.map((m) => ({ ...m, ...milestoneStatus(m, ctx, s.claimed) }));
  }, [s.holdings, s.profile.riskProfile, s.income, s.budget, s.goals, s.cards, s.credit, s.completedLessons, s.activeDays, s.claimed]);
}
