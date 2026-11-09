import { useRef } from 'react';
import { NavLink, useLocation, useNavigate } from 'react-router-dom';
import { Check } from 'lucide-react';
import { Button, cx } from '@/components/ui';
import { usePlanStore } from '@/state/plan';
import { useProduct } from '@/state/session';
import { QUESTIONS } from '@shared/data/questionnaire';
import { PRODUCTS } from '@shared/product';

/** Base Case phase labels (Flight Plan renames them PREFLIGHT → CHECKLIST → FLIGHT PLAN → CRUISE → LANDING → BRIEFING). */
export const PHASES = PRODUCTS['base-case'].phases;

function usePhases() {
  const loc = useLocation();
  const state = usePlanStore((s) => s.state);
  const product = useProduct();
  // Labels follow the plan's product when it differs from the deployment's (an advisor opening a pilot plan on Base Case).
  const phases = (state.product && PRODUCTS[state.product] ? PRODUCTS[state.product] : product).phases;
  const cockpit = (state.product ?? product.key) === 'flight-plan';
  return { phases, cockpit, loc, state };
}

export function PhaseStepper({ basePath }: { basePath: string }) {
  const navigate = useNavigate();
  const ref = useRef<HTMLElement>(null);
  const { phases: PHASES, cockpit, loc, state } = usePhases();
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

  if (cockpit) {
    // The original's phase tabs: numbered circle, uppercase label, one-line hint, cyan underline on the active phase.
    return (
      <nav ref={ref} data-stepper aria-label="Planning phases" className="grid grid-cols-3 md:grid-cols-6 border-b border-line" onKeyDown={onKey}>
        {PHASES.map((p, i) => {
          const done = complete[p.key] && i !== current;
          return (
            <NavLink
              key={p.key}
              to={`${basePath}/${p.key}`}
              aria-current={i === current ? 'step' : undefined}
              className={({ isActive }) => cx('relative flex items-start gap-2.5 px-3 py-2.5 focus-visible:ring-2 focus-visible:ring-edit focus-visible:outline-none', isActive ? 'text-ink' : done ? 'text-ok' : 'text-ink-3 hover:text-ink-2')}
            >
              {({ isActive }) => (
                <>
                  <span className={cx('mt-px flex h-[18px] w-[18px] shrink-0 items-center justify-center rounded-full border text-[10px] num', isActive ? 'border-edit text-edit' : done ? 'border-ok text-ok' : 'border-line text-ink-3')} aria-hidden>
                    {done ? <Check className="h-3 w-3" /> : i + 1}
                  </span>
                  <span className="min-w-0 leading-tight">
                    <span className="block text-[12px] font-bold uppercase tracking-[0.14em] whitespace-nowrap">{p.label}</span>
                    <span className="block text-[11px] text-ink-3 truncate">{p.hint}</span>
                  </span>
                  {done && <span className="sr-only">complete</span>}
                  {isActive && <span className="absolute left-0 right-0 -bottom-px h-0.5 bg-edit" aria-hidden />}
                </>
              )}
            </NavLink>
          );
        })}
      </nav>
    );
  }

  return (
    <nav ref={ref} data-stepper aria-label="Planning phases" className="flex gap-1 overflow-x-auto border-b border-line" onKeyDown={onKey}>
      {PHASES.map((p, i) => (
        <NavLink
          key={p.key}
          to={`${basePath}/${p.key}`}
          title={p.hint}
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

/** Previous / next phase buttons under each planning screen (the original's "← PREFLIGHT · CHECKLIST →"). */
export function PhaseNav({ basePath }: { basePath: string }) {
  const navigate = useNavigate();
  const { phases: PHASES, loc } = usePhases();
  const current = PHASES.findIndex((p) => loc.pathname.startsWith(`${basePath}/${p.key}`));
  const prev = current > 0 ? PHASES[current - 1] : null;
  const next = current >= 0 && current < PHASES.length - 1 ? PHASES[current + 1] : null;
  return (
    <div className="no-print mt-4 flex items-center justify-between gap-2">
      <div>{prev && <Button onClick={() => navigate(`${basePath}/${prev.key}`)}>← {prev.label}</Button>}</div>
      <div>{next && <Button variant="primary" onClick={() => navigate(`${basePath}/${next.key}`)}>{next.label} →</Button>}</div>
    </div>
  );
}
