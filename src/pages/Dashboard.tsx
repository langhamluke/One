import { useMemo } from 'react';
import { Link } from 'react-router-dom';
import { useStore, streak, levelFor } from '../store';
import { analyzePortfolio } from '../lib/portfolio';
import { analyzeBudget } from '../lib/savings';
import { creditInsights, utilization, utilizationBand } from '../lib/credit';
import { LESSONS } from '../data/lessons';
import type { Insight } from '../lib/types';
import { useMilestones } from '../useMilestones';
import { Bar, Card, Disclaimer, Insights, ScoreRing, money } from '../components/ui';

const RANK: Record<Insight['severity'], number> = { alert: 0, warn: 1, info: 2, good: 3 };
const tile = { textDecoration: 'none', color: 'inherit' } as const;

export default function Dashboard() {
  const s = useStore();
  const portfolio = useMemo(() => analyzePortfolio(s.holdings, s.profile.riskProfile), [s.holdings, s.profile.riskProfile]);
  const budget = useMemo(() => analyzeBudget(s.income, s.budget), [s.income, s.budget]);
  const milestones = useMilestones();
  const util = utilization(s.cards);
  const days = streak(s.activeDays);
  const level = levelFor(s.xp);
  const saved = s.goals.reduce((t, g) => t + g.saved, 0);
  const target = s.goals.reduce((t, g) => t + g.target, 0);
  const nextLesson = LESSONS.find((l) => !s.completedLessons.includes(l.id));
  const nextBonuses = milestones
    .filter((m) => m.status !== 'claimed' && m.bonus > 0)
    .sort((a, b) => Number(b.status === 'ready') - Number(a.status === 'ready') || b.progress - a.progress)
    .slice(0, 3);

  const nextSteps = [
    ...budget.insights.map((i) => ({ ...i, id: `b-${i.id}`, where: '/savings' })),
    ...portfolio.insights.map((i) => ({ ...i, id: `p-${i.id}`, where: '/portfolio' })),
    ...creditInsights(s.cards, s.credit).map((i) => ({ ...i, id: `c-${i.id}`, where: '/credit' })),
  ]
    .filter((i) => i.severity !== 'good')
    .sort((a, b) => RANK[a.severity] - RANK[b.severity])
    .slice(0, 3);

  return (
    <>
      <div className="card hero">
        <div className="row between" style={{ alignItems: 'flex-end' }}>
          <div>
            <p className="eyebrow" style={{ color: 'inherit', opacity: 0.7 }}>{new Date().toLocaleDateString('en-US', { weekday: 'long', month: 'long', day: 'numeric' })}</p>
            <h1 style={{ marginTop: 4 }}>Good to see you, {s.profile.name}.</h1>
            <p className="muted" style={{ marginTop: 4 }}>
              {days > 0 ? `${days}-day streak. One small money move today keeps it going.` : 'Make one small money move today to start a streak.'}
            </p>
          </div>
          <div style={{ minWidth: 220 }}>
            <div className="small"><strong>Level {level.index}, {level.name}</strong> · {s.xp} XP</div>
            <div style={{ marginTop: 8 }}><Bar value={level.progress} color="var(--on-brand)" /></div>
            {level.next && <div className="tiny muted" style={{ marginTop: 6 }}>{level.toNext} XP to {level.next}</div>}
          </div>
        </div>
      </div>

      <div className="grid g4 mt">
        <Link to="/portfolio" className="card" style={tile}>
          <div className="row" style={{ flexWrap: 'nowrap', gap: 14 }}>
            <ScoreRing score={portfolio.score} size={64} />
            <div>
              <div className="stat-label">Diversification</div>
              <div style={{ fontWeight: 600 }}>{portfolio.grade}</div>
              <div className="small muted">{money(portfolio.total)} invested</div>
            </div>
          </div>
        </Link>
        <Link to="/savings" className="card" style={tile}>
          <div className="stat-label">Saved toward goals</div>
          <div className="stat-value">{money(saved)}</div>
          <div style={{ margin: '8px 0 4px' }}><Bar value={target ? saved / target : 0} /></div>
          <div className="small muted">{target ? `of ${money(target)} across ${s.goals.length} goal${s.goals.length === 1 ? '' : 's'}` : 'Set your first goal'}</div>
        </Link>
        <Link to="/savings" className="card" style={tile}>
          <div className="stat-label">Savings rate</div>
          <div className="stat-value">{s.income ? `${Math.round(budget.shares.savings * 100)}%` : '—'}</div>
          <div className="small muted">{s.income ? `${money(budget.savings)} of ${money(s.income)} a month` : 'Add your budget'}</div>
        </Link>
        <Link to="/credit" className="card" style={tile}>
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
                  <Link key={w} to={w} className="btn">Open {w.slice(1)}</Link>
                ))}
              </div>
            </div>
          ) : (
            <div className="empty">You’re all caught up. Nice work.</div>
          )}
        </Card>

        <div className="stack">
          <Card title="Keep learning" action={<Link to="/learn" className="small">All lessons</Link>}>
            {nextLesson ? (
              <div className="stack" style={{ gap: 8 }}>
                <p className="eyebrow">{nextLesson.track}</p>
                <h1 style={{ fontSize: '1.6rem' }}>{nextLesson.title}</h1>
                <p className="small muted">{nextLesson.minutes} min · {nextLesson.xp} XP</p>
                <Link to="/learn" className="btn primary" style={{ alignSelf: 'flex-start' }}>Start lesson</Link>
              </div>
            ) : (
              <p>You’ve finished every lesson.</p>
            )}
          </Card>
          <Card title="Next bonuses" action={<Link to="/rewards" className="small">All rewards</Link>}>
            <div className="stack">
              {nextBonuses.map((m) => (
                <div key={m.id}>
                  <div className="row between small" style={{ flexWrap: 'nowrap' }}>
                    <span>{m.title}</span>
                    <strong className="num">{money(m.bonus)}</strong>
                  </div>
                  {m.status === 'ready' ? (
                    <Link to="/rewards" className="pill good" style={{ textDecoration: 'none', marginTop: 4 }}>Ready to claim</Link>
                  ) : (
                    <div style={{ marginTop: 6 }}><Bar value={m.progress} /></div>
                  )}
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
