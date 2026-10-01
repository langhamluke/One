import { useState } from 'react';
import { useStore } from '../store';
import { LESSONS, TRACKS, type Lesson } from '../data/lessons';
import { Bar, Card, celebrate } from '../components/ui';

const TRACK_BLURB: Record<(typeof TRACKS)[number], string> = {
  Saving: 'Budgeting, emergency funds, and making saving automatic.',
  Investing: 'Compound growth, diversification, fees, and where to invest.',
  Credit: 'How scores work and how to use a card without paying interest.',
};

export default function Learn() {
  const completed = useStore((s) => s.completedLessons);
  const [open, setOpen] = useState<Lesson | null>(null);

  if (open) return <LessonView lesson={open} onClose={() => setOpen(null)} />;

  const next = LESSONS.find((l) => !completed.includes(l.id));
  return (
    <>
      <div className="page-head">
        <div>
          <p className="eyebrow">Curriculum</p>
          <h1>Learn</h1>
          <p className="muted">Short lessons, each about four minutes, with a quiz at the end. Finish a course to unlock a savings bonus.</p>
        </div>
        <div style={{ minWidth: 240 }}>
          <div className="row between small"><span className="muted">Overall progress</span><strong className="num">{completed.length} of {LESSONS.length}</strong></div>
          <div style={{ marginTop: 6 }}><Bar value={completed.length / LESSONS.length} /></div>
        </div>
      </div>

      {next && (
        <Card className="hero">
          <div className="row between">
            <div>
              <p className="eyebrow" style={{ color: 'inherit', opacity: 0.75 }}>Up next · {next.track}</p>
              <h1 style={{ marginTop: 4 }}>{next.title}</h1>
              <p className="muted" style={{ marginTop: 4 }}>{next.minutes} minutes · {next.quiz.length}-question quiz · {next.xp} XP</p>
            </div>
            <button style={{ background: 'var(--on-brand)', color: 'var(--brand)', borderColor: 'transparent' }} onClick={() => setOpen(next)}>Start lesson</button>
          </div>
        </Card>
      )}

      {TRACKS.map((track) => {
        const lessons = LESSONS.filter((l) => l.track === track);
        const done = lessons.filter((l) => completed.includes(l.id)).length;
        return (
          <section key={track} className="mt" style={{ marginTop: 32 }}>
            <div className="row between" style={{ alignItems: 'flex-end', marginBottom: 12 }}>
              <div>
                <h2 className="serif" style={{ fontSize: '1.6rem' }}>{track}</h2>
                <p className="small muted">{TRACK_BLURB[track]}</p>
              </div>
              <div style={{ minWidth: 160 }}>
                <div className="tiny muted" style={{ textAlign: 'right', marginBottom: 4 }}>{done} of {lessons.length} complete</div>
                <Bar value={done / lessons.length} />
              </div>
            </div>
            <div className="stack" style={{ gap: 8 }}>
              {lessons.map((l) => {
                const isDone = completed.includes(l.id);
                return (
                  <button key={l.id} className={`module${isDone ? ' done' : ''}`} onClick={() => setOpen(l)}>
                    <span className="index">{String(LESSONS.indexOf(l) + 1).padStart(2, '0')}</span>
                    <span>
                      <strong style={{ fontWeight: 600 }}>{l.title}</strong>
                      <span className="small muted" style={{ display: 'block' }}>{l.minutes} min · {l.quiz.length} questions</span>
                    </span>
                    {isDone ? <span className="pill good">Complete</span> : <span className="pill accent">{l.xp} XP</span>}
                  </button>
                );
              })}
            </div>
          </section>
        );
      })}
    </>
  );
}

function LessonView({ lesson, onClose }: { lesson: Lesson; onClose: () => void }) {
  const completeLesson = useStore((s) => s.completeLesson);
  // Captured on open, so the summary still says "earned XP" after this lesson is marked complete.
  const [alreadyDone] = useState(() => useStore.getState().completedLessons.includes(lesson.id));
  const [step, setStep] = useState(0);
  const [picked, setPicked] = useState<number | null>(null);
  const [correct, setCorrect] = useState(0);
  const cards = lesson.cards.length;
  const total = cards + lesson.quiz.length;
  const finished = step >= total;
  const q = step >= cards && !finished ? lesson.quiz[step - cards] : null;

  const next = () => {
    if (q && picked === q.answer) setCorrect((c) => c + 1);
    setPicked(null);
    const nextStep = step + 1;
    setStep(nextStep);
    if (nextStep >= total && !alreadyDone) {
      completeLesson(lesson.id, lesson.xp);
      celebrate(`Lesson complete · ${lesson.xp} XP`);
    }
  };

  return (
    <div style={{ maxWidth: 680, margin: '0 auto' }}>
      <div className="row between" style={{ marginBottom: 14 }}>
        <button className="ghost" onClick={onClose}>All lessons</button>
        <span className="small muted num">{Math.min(step + 1, total)} / {total}</span>
      </div>
      <div style={{ display: 'grid', gridTemplateColumns: `repeat(${total}, 1fr)`, gap: 4 }}>
        {Array.from({ length: total }, (_, i) => (
          <div key={i} style={{ height: 3, borderRadius: 2, background: i < step ? 'var(--brand)' : 'var(--surface-2)' }} />
        ))}
      </div>
      <Card className="mt">
        <p className="eyebrow">{lesson.track} · {lesson.title}</p>

        {step < cards && (
          <div className="stack" style={{ marginTop: 12, gap: 16 }}>
            <h1>{lesson.cards[step].heading}</h1>
            <p style={{ fontSize: '1.05rem', lineHeight: 1.65 }}>{lesson.cards[step].body}</p>
            <button className="primary" style={{ alignSelf: 'flex-start' }} onClick={next}>{step === cards - 1 ? 'Take the quiz' : 'Continue'}</button>
          </div>
        )}

        {q && (
          <div className="stack" style={{ marginTop: 12 }}>
            <p className="eyebrow">Question {step - cards + 1} of {lesson.quiz.length}</p>
            <h1 style={{ fontSize: '1.8rem' }}>{q.q}</h1>
            {q.options.map((o, i) => {
              const state = picked === null ? '' : i === q.answer ? 'right' : i === picked ? 'wrong' : '';
              return (
                <button key={o} className={`quiz-opt ${state}`} disabled={picked !== null} onClick={() => setPicked(i)}>
                  {o}
                </button>
              );
            })}
            {picked !== null && (
              <>
                <div className={`insight ${picked === q.answer ? 'good' : 'warn'}`}>
                  <span className="eyebrow tag">{picked === q.answer ? 'Correct' : 'Not quite'}</span>
                  <p className="small">{q.why}</p>
                </div>
                <button className="primary" style={{ alignSelf: 'flex-start' }} onClick={next}>Continue</button>
              </>
            )}
          </div>
        )}

        {finished && (
          <div className="stack" style={{ marginTop: 12, textAlign: 'center', alignItems: 'center', padding: '12px 0' }}>
            <h1>Lesson complete</h1>
            <p className="muted">You answered <strong style={{ color: 'var(--text)' }}>{correct} of {lesson.quiz.length}</strong> correctly{alreadyDone ? '' : ` and earned ${lesson.xp} XP`}.</p>
            <div className="row">
              <button onClick={() => { setStep(0); setCorrect(0); }}>Review again</button>
              <button className="primary" onClick={onClose}>Back to lessons</button>
            </div>
          </div>
        )}
      </Card>
    </div>
  );
}
