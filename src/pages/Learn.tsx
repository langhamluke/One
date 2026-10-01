import { useState } from 'react';
import { useStore } from '../store';
import { LESSONS, TRACKS, type Lesson } from '../data/lessons';
import { Bar, Card, Segmented, celebrate } from '../components/ui';

export default function Learn() {
  const completed = useStore((s) => s.completedLessons);
  const [open, setOpen] = useState<Lesson | null>(null);
  const [track, setTrack] = useState<'All' | (typeof TRACKS)[number]>('All');

  if (open) return <LessonView lesson={open} onClose={() => setOpen(null)} />;

  const shown = LESSONS.filter((l) => track === 'All' || l.track === track);
  return (
    <>
      <div className="page-head">
        <div>
          <h1>Learn</h1>
          <p className="muted">Bite-sized lessons. About 4 minutes each. Earn XP and level up your money brain.</p>
        </div>
        <div style={{ minWidth: 220 }}>
          <div className="small"><strong>{completed.length}/{LESSONS.length}</strong> lessons complete</div>
          <Bar value={completed.length / LESSONS.length} />
        </div>
      </div>
      <Segmented value={track} onChange={setTrack} options={[{ value: 'All', label: 'All' }, ...TRACKS.map((t) => ({ value: t, label: t }))]} />
      <div className="grid g3 mt">
        {shown.map((l) => {
          const done = completed.includes(l.id);
          return (
            <button key={l.id} className="card" style={{ textAlign: 'left', display: 'block', fontWeight: 400 }} onClick={() => setOpen(l)}>
              <div className="row between">
                <span style={{ fontSize: '2rem' }}>{l.emoji}</span>
                {done ? <span className="pill good">✓ Done</span> : <span className="pill accent">+{l.xp} XP</span>}
              </div>
              <h3 style={{ marginTop: 8 }}>{l.title}</h3>
              <p className="small muted">{l.track} · {l.minutes} min · {l.quiz.length}-question quiz</p>
            </button>
          );
        })}
      </div>
    </>
  );
}

function LessonView({ lesson, onClose }: { lesson: Lesson; onClose: () => void }) {
  const completeLesson = useStore((s) => s.completeLesson);
  const alreadyDone = useStore((s) => s.completedLessons.includes(lesson.id));
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
      celebrate(`Lesson complete · +${lesson.xp} XP 🎓`);
    }
  };

  return (
    <div style={{ maxWidth: 640, margin: '0 auto' }}>
      <div className="row between" style={{ marginBottom: 12 }}>
        <button className="ghost" onClick={onClose}>← All lessons</button>
        <span className="small muted">{Math.min(step + 1, total)} / {total}</span>
      </div>
      <Bar value={step / total} />
      <Card className="mt">
        <div style={{ fontSize: '2.2rem' }}>{lesson.emoji}</div>
        <p className="tiny muted" style={{ marginTop: 4 }}>{lesson.track.toUpperCase()} · {lesson.title}</p>

        {step < cards && (
          <div className="stack" style={{ marginTop: 10 }}>
            <h2>{lesson.cards[step].heading}</h2>
            <p>{lesson.cards[step].body}</p>
            <button className="primary" style={{ alignSelf: 'flex-start' }} onClick={next}>{step === cards - 1 ? 'Take the quiz →' : 'Next →'}</button>
          </div>
        )}

        {q && (
          <div className="stack" style={{ marginTop: 10 }}>
            <h2>{q.q}</h2>
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
                  <div className="dot">{picked === q.answer ? '🎉' : '💡'}</div>
                  <div><h3>{picked === q.answer ? 'Nice!' : 'Not quite.'}</h3><p className="small muted">{q.why}</p></div>
                </div>
                <button className="primary" style={{ alignSelf: 'flex-start' }} onClick={next}>Continue →</button>
              </>
            )}
          </div>
        )}

        {finished && (
          <div className="stack" style={{ marginTop: 10, textAlign: 'center', alignItems: 'center' }}>
            <h2>Lesson complete! 🎓</h2>
            <p>You got <strong>{correct}/{lesson.quiz.length}</strong> right{alreadyDone ? '' : ` and earned ${lesson.xp} XP`}.</p>
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
