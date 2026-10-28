import { PHASES, useStore, type Phase } from '../state/store';
import { useDerived } from '../state/derived';

export function PhaseStepper() {
  const phase = useStore((s) => s.ui.phase);
  const setUI = useStore((s) => s.setUI);
  const { plan } = useDerived();
  const idx = PHASES.findIndex((p) => p.id === phase);
  const complete = (id: Phase, i: number) => (id === 'checklist' ? plan.score.complete : i < idx);

  return (
    <nav aria-label="Phases of flight" className="no-print">
      <ol className="flex items-stretch overflow-x-auto">
        {PHASES.map((p, i) => {
          const active = p.id === phase;
          const done = complete(p.id, i) && !active;
          return (
            <li key={p.id} className="flex min-w-0 flex-1 items-stretch">
              <button
                type="button"
                onClick={() => setUI({ phase: p.id })}
                aria-current={active ? 'step' : undefined}
                className={`group flex h-full w-full min-w-[120px] flex-col items-start border-b-2 px-3 py-2 text-left transition-colors ${active ? 'border-sel' : 'border-edge hover:border-[#3a4c63]'}`}
              >
                <span className="flex items-center gap-2">
                  <span className={`num flex h-5 w-5 items-center justify-center rounded-full border text-[10px] ${active ? 'border-sel text-sel' : done ? 'border-ok text-ok' : 'border-edge text-dim'}`}>
                    {done ? '✓' : i + 1}
                  </span>
                  <span className={`text-[12px] font-bold tracking-[0.14em] ${active ? 'text-white' : done ? 'text-ok' : 'text-dim group-hover:text-white'}`}>{p.label}</span>
                </span>
                <span className="mt-0.5 hidden truncate pl-7 text-[10.5px] text-dim xl:block">{p.hint}</span>
              </button>
            </li>
          );
        })}
      </ol>
    </nav>
  );
}
