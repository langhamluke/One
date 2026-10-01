import { useState } from 'react';
import { useStore, type Stage } from '../store';
import { RISK_PROFILE_LABELS, type RiskProfile } from '../lib/types';
import { loadSampleData } from '../data/sample';
import { Segmented } from '../components/ui';

const QUESTIONS = [
  {
    q: 'When will you need the money you invest?',
    options: ['Within 3 years', 'In 3–10 years', '10+ years from now'],
  },
  {
    q: 'Your investments drop 30% in a month. You…',
    options: ['Sell to stop the loss', 'Wait it out', 'Buy more while it’s on sale'],
  },
  {
    q: 'What matters more to you?',
    options: ['Not losing money', 'A balance of both', 'Maximum long-term growth'],
  },
];

export function profileFromAnswers(answers: number[]): RiskProfile {
  const sum = answers.reduce((a, b) => a + b, 0);
  return sum <= 1 ? 'cautious' : sum <= 3 ? 'balanced' : sum <= 5 ? 'growth' : 'aggressive';
}

export default function Onboarding() {
  const setProfile = useStore((s) => s.setProfile);
  const [step, setStep] = useState(0);
  const [name, setName] = useState('');
  const [stage, setStage] = useState<Stage>('college');
  const [age, setAge] = useState(19);
  const [answers, setAnswers] = useState<number[]>([]);

  const finish = (sample: boolean) => {
    setProfile({ name: name.trim() || 'Friend', stage, age, riskProfile: profileFromAnswers(answers), onboarded: true });
    if (sample) loadSampleData();
  };

  return (
    <div style={{ minHeight: '100vh', display: 'grid', placeItems: 'center', padding: 16 }}>
      <div className="card" style={{ maxWidth: 520, width: '100%', padding: 28 }}>
        <div className="logo" style={{ padding: '0 0 12px' }}><span className="logo-mark">🌱</span>Sprout</div>

        {step === 0 && (
          <div className="stack">
            <h1>Money skills, minus the stress.</h1>
            <p className="muted">
              Learn to save, invest, and build credit, with tools made for high school and college students. No bank login and no judgment.
              Your data stays on this device.
            </p>
            <label className="field">What should we call you?
              <input autoFocus value={name} onChange={(e) => setName(e.target.value)} placeholder="Your first name" />
            </label>
            <label className="field">Where are you right now?
              <Segmented<Stage>
                value={stage}
                onChange={setStage}
                options={[{ value: 'highSchool', label: 'High school' }, { value: 'college', label: 'College' }, { value: 'graduated', label: 'Recent grad' }]}
              />
            </label>
            <label className="field">Age
              <input type="number" min={13} max={30} value={age} onChange={(e) => setAge(Number(e.target.value) || 0)} />
            </label>
            {age > 0 && age < 13 && <p className="small" style={{ color: 'var(--alert)' }}>Sprout is designed for ages 13 and up.</p>}
            <button className="primary" disabled={age < 13} onClick={() => setStep(1)}>Next →</button>
          </div>
        )}

        {step >= 1 && step <= QUESTIONS.length && (
          <div className="stack">
            <p className="tiny muted">Quick risk check · {step} of {QUESTIONS.length}</p>
            <h2>{QUESTIONS[step - 1].q}</h2>
            {QUESTIONS[step - 1].options.map((o, i) => (
              <button
                key={o}
                className="quiz-opt"
                onClick={() => {
                  const next = [...answers.slice(0, step - 1), i];
                  setAnswers(next);
                  setStep(step + 1);
                }}
              >
                {o}
              </button>
            ))}
            <button className="ghost" onClick={() => setStep(step - 1)}>← Back</button>
          </div>
        )}

        {step === QUESTIONS.length + 1 && (
          <div className="stack">
            <h1>Nice to meet you, {name.trim() || 'friend'} 👋</h1>
            <p>
              Your investing style looks <strong>{RISK_PROFILE_LABELS[profileFromAnswers(answers)]}</strong>. That just sets a starting point for
              tips, and you can change it any time in the Optimizer.
            </p>
            <p className="muted small">Want to explore with a sample student’s money first? You can clear it later.</p>
            <button className="primary" onClick={() => finish(false)}>Start fresh</button>
            <button onClick={() => finish(true)}>Explore with sample data</button>
          </div>
        )}
      </div>
    </div>
  );
}
