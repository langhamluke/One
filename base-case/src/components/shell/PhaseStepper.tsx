import { useRef } from 'react';
import { NavLink, useLocation, useNavigate } from 'react-router-dom';
import { Check } from 'lucide-react';
import { cx } from '@/components/ui';
import { usePlanStore } from '@/state/plan';
import { QUESTIONS } from '@shared/data/questionnaire';

export const PHASES = [
  { key: 'profile', label: 'Profile' },
  { key: 'risk', label: 'Risk' },
  { key: 'career', label: 'Career' },
  { key: 'plan', label: 'Plan' },
  { key: 'future', label: 'Future' },
  { key: 'summary', label: 'Summary' },
] as const;

export function PhaseStepper({ basePath }: { basePath: string }) {
  const loc = useLocation();
  const navigate = useNavigate();
  const ref = useRef<HTMLElement>(null);
  const state = usePlanStore((s) => s.state);
  const current = PHASES.findIndex((p) => loc.pathname.startsWith(`${basePath}/${p.key}`));
  const complete: Record<string, boolean> = {
    profile: state.profile.nickname.trim().length > 0,
    risk: QUESTIONS.every((q) => state.answers[q.id] != null),
    career: state.careerPaths.length > 0 && current > 2,
    plan: current > 3,
    future: current > 4,
    summary: false,
  };
  const onKey = (e: React.KeyboardEvent) => {
    if (e.key !== 'ArrowRight' && e.key !== 'ArrowLeft') return;
    e.preventDefault();
    const next = Math.max(0, Math.min(PHASES.length - 1, current + (e.key === 'ArrowRight' ? 1 : -1)));
    navigate(`${basePath}/${PHASES[next].key}`);
    requestAnimationFrame(() => ref.current?.querySelectorAll<HTMLAnchorElement>('a')[next]?.focus());
  };
  return (
    <nav ref={ref} data-stepper aria-label="Planning phases" className="flex gap-1 overflow-x-auto border-b border-line" onKeyDown={onKey}>
      {PHASES.map((p, i) => (
        <NavLink
          key={p.key}
          to={`${basePath}/${p.key}`}
          aria-current={i === current ? 'step' : undefined}
          className={({ isActive }) =>
            cx(
              'relative flex items-center gap-1.5 px-3 py-2 text-xs font-semibold uppercase tracking-wider whitespace-nowrap focus-visible:ring-2 focus-visible:ring-edit focus-visible:outline-none',
              isActive ? 'text-ink' : 'text-ink-3 hover:text-ink-2',
            )
          }
        >
          {({ isActive }) => (
            <>
              <span className={cx('num text-xxs', isActive ? 'text-rec' : 'text-ink-4')}>{i + 1}</span>
              {p.label}
              {complete[p.key] && !isActive && <Check className="h-3 w-3 text-ok" aria-label="complete" />}
              {isActive && <span className="absolute left-2 right-2 -bottom-px h-0.5 bg-rec" aria-hidden />}
            </>
          )}
        </NavLink>
      ))}
    </nav>
  );
}
