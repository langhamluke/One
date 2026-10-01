import { useMemo } from 'react';
import { Link } from 'react-router-dom';
import { useStore, streak, levelFor } from '../store';
import { analyzePortfolio } from '../lib/portfolio';
import { analyzeBudget } from '../lib/savings';
import { creditInsights, utilization, utilizationBand } from '../lib/credit';
import { LESSONS } from '../data/lessons';
import type { Insight } from '../lib/types';
import { Bar, Card, Disclaimer, Insights, ScoreRing, money } from '../components/ui';

const RANK: Record<Insight['severity'], number> = { alert: 0, warn: 1, info: 2, good: 3 };

export default function Dashboard() {
  const s = useStore();
  const portfolio = useMemo(() => analyzePortfolio(s.holdings, s.profile.riskProfile), [s.holdings, s.profile.riskProfile]);
  const budget = useMemo(() => analyzeBudget(s.income, s.budget), [s.income, s.budget]);
  const util = utilization(s.cards);
  const days = streak(s.activeDays);
  const level = levelFor(s.xp);
  const saved = s.goals.reduce((t, g) => t + g.saved, 0);
  const target = s.goals.reduce((t, g) => t + g.target, 0);
  const nextLesson = LESSONS.find((l) => !s.completedLessons.includes(l.id));

  const nextSteps = [
    ...budget.insights.map((i) => ({ ...i, id: `b-${i.id}`, where: '/savings' })),
    ...portfolio.insights.map((i) => ({ ...i, id: `p-${i.id}`, where: '/portfolio' })),
    ...creditInsights(s.cards, s.credit).map((i) => ({ ...i, id: `c-${i.id}`, where: '/credit' })),
  ]
    .filter((i) => i.severity !== 'good')
    .sort((a, b) => RANK[a.severity] - RANK[b.severity])
    .slice(0, 3);

  const badges = [
    { id: 'goal', icon: '🎯', label: 'Goal setter', earned: s.goals.length > 0 },
    { id: 'deposit', icon: '💰', label: 'First deposit', earned: s.deposits.some((d) => d.amount > 0) },
    { id: 'streak3', icon: '🔥', label: '3-day streak', earned: days >= 3 },
    { id: 'learner', icon: '📚', label: '3 lessons', earned: s.completedLessons.length >= 3 },
    { id: 'scholar', icon: '🎓', label: 'All lessons', earned: s.completedLessons.length === LESSONS.length },
    { id: 'diversified', icon: '🧺', label: 'Diversified (85+)', earned: portfolio.score >= 85 },
    { id: 'saver20', icon: '🐷', label: 'Saving 20%+', earned: budget.shares.savings >= 0.2 },
    { id: 'credit', icon: '💳', label: 'Under 10% utilization', earned: s.cards.length > 0 && util.overall < 0.1 },
  ];

  return (
    <>
      <div className="card hero">
        <div className="row between">
          <div>
            <h1>Hey {s.profile.name} 👋</h1>
            <p className="muted" style={{ marginTop: 4 }}>
              {days > 0 ? `🔥 ${days}-day streak. Keep it going!` : 'Do one small money move today to start a streak.'}
            </p>
          </div>
          <div style={{ minWidth: 220 }}>
            <div className="small"><strong>Level {level.index} · {level.name}</strong> · {s.xp} XP</div>
            <div style={{ marginTop: 6 }}><Bar value={level.progress} color="white" /></div>
            {level.next && <div className="tiny muted" style={{ marginTop: 4 }}>{level.toNext} XP to {level.next}</div>}
          </div>
        </div>
      </div>

      <div className="grid g4 mt">
        <Link to="/portfolio" className="card" style={{ textDecoration: 'none', color: 'inherit' }}>
          <div className="row" style={{ flexWrap: 'nowrap' }}>
            <ScoreRing score={portfolio.score} size={64} />
            <div>
              <div className="stat-label">Diversification</div>
              <div style={{ fontWeight: 700 }}>{portfolio.grade}</div>
              <div className="small muted">{money(portfolio.total)} invested</div>
            </div>
          </div>
        </Link>
        <Link to="/savings" className="card" style={{ textDecoration: 'none', color: 'inherit' }}>
          <div className="stat-label">Saved toward goals</div>
          <div className="stat-value">{money(saved)}</div>
          <Bar value={target ? saved / target : 0} />
          <div className="small muted" style={{ marginTop: 4 }}>{target ? `of ${money(target)} across ${s.goals.length} goal(s)` : 'Set your first goal'}</div>
        </Link>
        <Link to="/savings" className="card" style={{ textDecoration: 'none', color: 'inherit' }}>
          <div className="stat-label">Savings rate</div>
          <div className="stat-value">{s.income ? `${Math.round(budget.shares.savings * 100)}%` : '—'}</div>
          <div className="small muted">{s.income ? `${money(budget.savings)} of ${money(s.income)} a month` : 'Add your budget'}</div>
        </Link>
        <Link to="/credit" className="card" style={{ textDecoration: 'none', color: 'inherit' }}>
          <div className="stat-label">Credit utilization</div>
          <div className="stat-value">{s.cards.length ? `${Math.round(util.overall * 100)}%` : '—'}</div>
          <div className="small muted">{s.cards.length ? utilizationBand(util.overall).label : 'No cards added'}</div>
        </Link>
      </div>

      <div className="grid g3 mt">
        <Card title="Your next best steps" className="span2">
          {nextSteps.length ? (
            <div className="stack">
              <Insights items={nextSteps} />
              <div className="row">
                {[...new Set(nextSteps.map((n) => n.where))].map((w) => (
                  <Link key={w} to={w} className="btn">Open {w.slice(1)} →</Link>
                ))}
              </div>
            </div>
          ) : (
            <div className="empty"><div className="big">🌟</div>You’re all caught up. Nice money habits!</div>
          )}
        </Card>

        <div className="stack">
          <Card title="Keep learning">
            {nextLesson ? (
              <div className="stack">
                <div style={{ fontSize: '2rem' }}>{nextLesson.emoji}</div>
                <h3>{nextLesson.title}</h3>
                <p className="small muted">{nextLesson.track} · {nextLesson.minutes} min · +{nextLesson.xp} XP</p>
                <Link to="/learn" className="btn primary">Start lesson</Link>
              </div>
            ) : (
              <p>🎓 You finished every lesson. Legend.</p>
            )}
          </Card>
          <Card title="Badges">
            <div className="grid g4" style={{ gap: 8 }}>
              {badges.map((b) => (
                <div key={b.id} title={b.label} style={{ textAlign: 'center', opacity: b.earned ? 1 : 0.3, filter: b.earned ? 'none' : 'grayscale(1)' }}>
                  <div style={{ fontSize: '1.6rem' }}>{b.icon}</div>
                  <div className="tiny">{b.label}</div>
                </div>
              ))}
            </div>
          </Card>
        </div>
      </div>
      <Disclaimer />
    </>
  );
}
