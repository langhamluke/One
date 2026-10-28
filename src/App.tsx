import { useRef, useState } from 'react';
import { PERSONAS } from './data/personas';
import { PfdStrip } from './components/PfdStrip';
import { PhaseStepper } from './components/PhaseStepper';
import { Segmented } from './components/ui';
import { DerivedProvider } from './state/derived';
import { PHASES, useStore } from './state/store';
import { Preflight } from './screens/Preflight';
import { Checklist } from './screens/Checklist';
import { FlightPlan } from './screens/FlightPlan';
import { Cruise } from './screens/Cruise';
import { Landing } from './screens/Landing';
import { Briefing } from './screens/Briefing';

function TopBar() {
  const ui = useStore((s) => s.ui);
  const setUI = useStore((s) => s.setUI);
  const loadPersona = useStore((s) => s.loadPersona);
  const newClient = useStore((s) => s.newClient);
  const exportJSON = useStore((s) => s.exportJSON);
  const importJSON = useStore((s) => s.importJSON);
  const name = useStore((s) => s.profile.name);
  const fileRef = useRef<HTMLInputElement>(null);
  const [msg, setMsg] = useState<string | null>(null);

  const doExport = () => {
    const blob = new Blob([exportJSON()], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `flight-plan-${name.trim().replace(/\s+/g, '-').toLowerCase() || 'client'}.json`;
    a.click();
    setTimeout(() => URL.revokeObjectURL(url), 1000);
  };
  const doImport = async (f: File) => {
    const r = importJSON(await f.text());
    setMsg(r.ok ? 'Client profile imported' : `Import failed: ${r.error}`);
    setTimeout(() => setMsg(null), 3500);
  };

  return (
    <header className="no-print flex flex-wrap items-center gap-x-4 gap-y-2 border-b border-edge bg-[#090D12] px-4 py-2.5 lg:px-6">
      <div className="flex items-center gap-3">
        <svg width="26" height="26" viewBox="0 0 32 32" aria-hidden="true">
          <rect width="32" height="32" rx="6" fill="#121821" stroke="#243042" />
          <path d="M5 21 L12 14 L19 17 L27 9" stroke="#FF4FD8" strokeWidth="2.2" fill="none" />
          <circle cx="27" cy="9" r="2.2" fill="#FF4FD8" />
        </svg>
        <div className="leading-tight">
          <div className="text-[15px] font-bold tracking-[0.22em]">FLIGHT PLAN</div>
          <div className="text-[10px] tracking-[0.12em] text-dim">LIFECYCLE PLANNING FOR AIRLINE PILOTS</div>
        </div>
      </div>

      <div className="flex items-center gap-2">
        <label htmlFor="persona" className="text-[10px] uppercase tracking-[0.14em] text-dim">Load demo pilot</label>
        <select id="persona" className="inp w-auto py-1 font-sans text-[12px]" value={ui.personaId ?? ''} onChange={(e) => e.target.value && loadPersona(e.target.value)}>
          <option value="" disabled>— Select —</option>
          {PERSONAS.map((p) => <option key={p.id} value={p.id}>{p.label}</option>)}
        </select>
      </div>

      <div className="ml-auto flex flex-wrap items-center gap-2">
        <Segmented size="sm" ariaLabel="Dollar basis" value={ui.dollars} onChange={(v) => setUI({ dollars: v })} options={[{ value: 'real', label: "Today's $" }, { value: 'nominal', label: 'Nominal' }]} />
        <Segmented size="sm" ariaLabel="Display mode" value={ui.mode} onChange={(v) => setUI({ mode: v })} options={[{ value: 'client', label: 'Client' }, { value: 'advisor', label: 'Advisor' }]} />
        <button type="button" className="btn" onClick={doExport} title="Save this client profile as JSON">Export</button>
        <button type="button" className="btn" onClick={() => fileRef.current?.click()} title="Load a saved client profile">Import</button>
        <input ref={fileRef} type="file" accept="application/json,.json" className="hidden" aria-hidden="true" tabIndex={-1}
          onChange={(e) => { const f = e.target.files?.[0]; if (f) void doImport(f); e.target.value = ''; }} />
        <button type="button" className="btn" onClick={() => { if (confirm('Start a new client? Unsaved changes will be cleared.')) newClient(); }}>New</button>
      </div>
      {msg && <div role="status" className="w-full text-right text-[12px] text-ok">{msg}</div>}
    </header>
  );
}

function Screen() {
  const phase = useStore((s) => s.ui.phase);
  switch (phase) {
    case 'preflight': return <Preflight />;
    case 'checklist': return <Checklist />;
    case 'flightplan': return <FlightPlan />;
    case 'cruise': return <Cruise />;
    case 'landing': return <Landing />;
    case 'briefing': return <Briefing />;
  }
}

function NextPrev() {
  const phase = useStore((s) => s.ui.phase);
  const setUI = useStore((s) => s.setUI);
  const i = PHASES.findIndex((p) => p.id === phase);
  const prev = PHASES[i - 1], next = PHASES[i + 1];
  return (
    <div className="no-print mt-6 flex justify-between">
      {prev ? <button type="button" className="btn" onClick={() => { setUI({ phase: prev.id }); window.scrollTo({ top: 0 }); }}>← {prev.label}</button> : <span />}
      {next && <button type="button" className="btn btn-primary" onClick={() => { setUI({ phase: next.id }); window.scrollTo({ top: 0 }); }}>{next.label} →</button>}
    </div>
  );
}

export default function App() {
  const phase = useStore((s) => s.ui.phase);
  return (
    <DerivedProvider>
      <div className="min-h-screen">
        <TopBar />
        <div className="mx-auto max-w-[1440px] px-3 pb-10 sm:px-4 lg:px-6">
          {phase !== 'briefing' && <div className="no-print pt-4"><PfdStrip /></div>}
          <div className="pt-3"><PhaseStepper /></div>
          <main className="pt-5">
            <Screen />
            <NextPrev />
          </main>
        </div>
      </div>
    </DerivedProvider>
  );
}
