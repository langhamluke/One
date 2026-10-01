import { useState } from 'react';
import Link from 'next/link';
import { useStore } from '../store';
import { useMilestones } from '../useMilestones';
import type { MilestoneTrack } from '../lib/milestones';
import { Bar, Card, Disclaimer, celebrate, money } from '../components/ui';

const TRACKS: MilestoneTrack[] = ['Saving', 'Investing', 'Credit', 'Learning'];

export default function Rewards() {
  const { goals, sponsor, setSponsor, claimBonus, claimed: claimedOn } = useStore();
  const milestones = useMilestones();
  const [goalId, setGoalId] = useState(goals[0]?.id ?? '');
  const target = goals.find((g) => g.id === goalId) ?? goals[0];

  const claimed = milestones.filter((m) => m.status === 'claimed');
  const ready = milestones.filter((m) => m.status === 'ready');
  const earned = claimed.reduce((s, m) => s + m.bonus, 0);
  const available = milestones.reduce((s, m) => s + m.bonus, 0);
  const funder = sponsor.trim() || 'your sponsor';

  return (
    <>
      <div className="page-head">
        <div>
          <p className="eyebrow">Milestone bonuses</p>
          <h1>Rewards</h1>
          <p className="muted">
            Hit milestones in saving, investing, credit, and learning to earn bonuses. Every bonus goes straight into a savings goal, so good habits pay you twice.
          </p>
        </div>
      </div>

      <div className="grid g4">
        <Card><div className="stat-label">Bonuses earned</div><div className="stat-value">{money(earned)}</div><div className="small muted">of {money(available)} available</div></Card>
        <Card><div className="stat-label">Ready to claim</div><div className="stat-value">{ready.length}</div><div className="small muted">{money(ready.reduce((s, m) => s + m.bonus, 0))} waiting</div></Card>
        <Card><div className="stat-label">Milestones reached</div><div className="stat-value">{claimed.length}</div><div className="small muted">of {milestones.length}</div></Card>
        <Card>
          <label className="field">Bonuses deposit into
            {goals.length ? (
              <select value={target?.id} onChange={(e) => setGoalId(e.target.value)}>
                {goals.map((g) => <option key={g.id} value={g.id}>{g.name}</option>)}
              </select>
            ) : (
              <Link href="/savings" className="btn">Create a savings goal</Link>
            )}
          </label>
        </Card>
      </div>

      <Card className="mt">
        <div className="row" style={{ alignItems: 'flex-end', gap: 20 }}>
          <label className="field" style={{ width: 260 }}>Who funds your bonuses?
            <input value={sponsor} onChange={(e) => setSponsor(e.target.value)} placeholder="e.g. a parent, or yourself" />
          </label>
          <p className="small muted" style={{ flex: 1, minWidth: 260 }}>
            A bonus becomes real money when someone moves it. When you claim one, move the amount into your savings account (or ask {funder} to), and
            Sprout logs it toward your goal. No sponsor? Pay yourself: it’s a reward for a habit that already saves you money.
          </p>
        </div>
      </Card>

      {TRACKS.map((track) => (
        <section key={track} style={{ marginTop: 32 }}>
          <h2 className="serif" style={{ fontSize: '1.6rem', marginBottom: 12 }}>{track}</h2>
          <div className="grid g2">
            {milestones.filter((m) => m.track === track).map((m) => (
              <div key={m.id} className="card" style={{ padding: 18 }}>
                <div className="row between" style={{ alignItems: 'flex-start', flexWrap: 'nowrap' }}>
                  <div>
                    <h3>{m.title}</h3>
                    <p className="small muted">{m.detail}</p>
                  </div>
                  <div style={{ textAlign: 'right', flex: 'none' }}>
                    <div className="serif" style={{ fontSize: '1.5rem', lineHeight: 1 }}>{m.bonus ? money(m.bonus) : '—'}</div>
                    <div className="tiny muted">{m.points} XP</div>
                  </div>
                </div>
                <div style={{ marginTop: 12 }}>
                  {m.status === 'claimed' && <span className="pill good">Claimed {new Date(claimedOn[m.id] + 'T00:00').toLocaleDateString('en-US', { month: 'short', day: 'numeric' })}</span>}
                  {m.status === 'ready' && (
                    <button
                      className="primary"
                      disabled={m.bonus > 0 && !target}
                      onClick={() => {
                        claimBonus(m.id, m.points, m.bonus > 0 ? target?.id ?? null : null, m.bonus);
                        celebrate(m.bonus ? `${money(m.bonus)} added to ${target?.name} · ${m.points} XP` : `${m.points} XP earned`);
                      }}
                    >
                      {m.bonus ? `Claim ${money(m.bonus)}` : `Claim ${m.points} XP`}
                    </button>
                  )}
                  {m.status === 'locked' && (
                    <div className="row" style={{ flexWrap: 'nowrap' }}>
                      <div style={{ flex: 1 }}><Bar value={m.progress} /></div>
                      <span className="tiny muted num">{Math.round(m.progress * 100)}%</span>
                    </div>
                  )}
                </div>
              </div>
            ))}
          </div>
        </section>
      ))}
      <Disclaimer />
    </>
  );
}
