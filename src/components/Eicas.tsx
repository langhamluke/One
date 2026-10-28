import { useState } from 'react';
import type { Alert } from '../lib/alerts';
import { useStore } from '../state/store';

const COLOR = { warning: 'text-warn', caution: 'text-caution', advisory: 'text-white' } as const;

export function Eicas({ alerts, compact = false, max }: { alerts: Alert[]; compact?: boolean; max?: number }) {
  const mode = useStore((s) => s.ui.mode);
  const [open, setOpen] = useState<string | null>(null);
  const shown = alerts.filter((a) => mode === 'advisor' || !a.advisorOnly);
  const list = max ? shown.slice(0, max) : shown;
  const nWarn = shown.filter((a) => a.level === 'warning').length;
  const nCaut = shown.filter((a) => a.level === 'caution').length;

  return (
    <section className="panel overflow-hidden" aria-label="Planning alerts (EICAS)">
      <header className="flex items-center justify-between gap-2 border-b border-edge px-4 py-2.5">
        <h2 className="panel-title whitespace-nowrap">EICAS · Alerts</h2>
        <div className="flex gap-1.5">
          <span className={`whitespace-nowrap rounded-sm border px-1.5 py-0.5 text-[10px] font-bold tracking-widest ${nWarn ? 'border-warn bg-warn/15 text-warn' : 'border-edge text-faint'}`}>WARNING{nWarn ? ` ${nWarn}` : ''}</span>
          <span className={`whitespace-nowrap rounded-sm border px-1.5 py-0.5 text-[10px] font-bold tracking-widest ${nCaut ? 'border-caution bg-caution/15 text-caution' : 'border-edge text-faint'}`}>CAUTION{nCaut ? ` ${nCaut}` : ''}</span>
        </div>
      </header>
      <ul className="bg-[#080B10] py-1.5">
        {list.length === 0 && <li className="num px-4 py-1.5 text-ok">ALL SYSTEMS NORMAL</li>}
        {list.map((a) => (
          <li key={a.id}>
            <button
              type="button"
              aria-expanded={open === a.id}
              onClick={() => setOpen(open === a.id ? null : a.id)}
              className={`num w-full px-4 py-1 text-left ${compact ? 'text-[12px]' : 'text-[13px]'} leading-snug tracking-wide ${COLOR[a.level]} hover:bg-white/[0.03]`}
            >
              {a.text}
            </button>
            {open === a.id && <p className="px-4 pb-2 pt-0.5 text-[12px] leading-snug text-dim">{a.detail}</p>}
          </li>
        ))}
        {max && shown.length > max && <li className="num px-4 py-1 text-[11px] text-dim">+{shown.length - max} MORE</li>}
      </ul>
    </section>
  );
}
