import type { ReactNode } from 'react';
import { fmtK, fmtPct } from '../lib/format';
import { useDerived } from '../state/derived';
import { useStore } from '../state/store';

const STAGE_LABEL: Record<string, string> = {
  student: 'STUDENT', cfi: 'CFI', regional_fo: 'REGIONAL FO', regional_ca: 'REGIONAL CA',
  major_fo: 'MAJOR FO', major_ca: 'MAJOR CA', cargo_fo: 'CARGO FO', cargo_ca: 'CARGO CA',
};

function Box({ label, children, sub, tone = 'text-white', bar }: { label: string; children: ReactNode; sub?: ReactNode; tone?: string; bar?: { value: number; color: string; marker?: number } }) {
  return (
    <div className="relative min-w-0 flex-1 border-b border-r border-edge px-3 py-2 [&:nth-child(3n)]:border-r-0 lg:border-b-0 lg:[&:nth-child(3n)]:border-r lg:last:border-r-0 sm:px-4">
      <div className="truncate text-[10px] uppercase tracking-[0.16em] text-dim">{label}</div>
      <div className={`num mt-0.5 truncate text-[19px] leading-tight sm:text-[22px] ${tone}`}>{children}</div>
      <div className="mt-0.5 truncate text-[10.5px] text-dim">{sub ?? ' '}</div>
      {bar && (
        <div className="absolute bottom-0 left-0 right-0 h-[3px] bg-[#0B1118]">
          <div className="h-full transition-[width] duration-700" style={{ width: `${Math.min(100, Math.max(0, bar.value * 100))}%`, background: bar.color }} />
          {bar.marker !== undefined && <div className="absolute top-[-3px] h-[9px] w-[2px] bg-plan" style={{ left: `${Math.min(100, bar.marker * 100)}%` }} />}
        </div>
      )}
    </div>
  );
}

export function PfdStrip() {
  const { state, plan, mc } = useDerived();
  const dollars = useStore((s) => s.ui.dollars);
  const p = state.profile;
  const y0 = plan.rows[0];
  const netWorth = p.cash + p.retirementAccounts + p.taxable - p.schoolDebt - p.otherDebt;
  const idx = plan.retirement.indexAtRetirement;
  const p50 = dollars === 'real' ? mc.atRetirement.p50 / idx : mc.atRetirement.p50;
  const required = plan.retirement.requiredBalanceReal * (dollars === 'real' ? 1 : idx);
  const success = mc.successProb;
  const tone = success >= 0.85 ? 'text-ok' : success >= 0.7 ? 'text-caution' : 'text-warn';
  const save = y0?.savingsRate ?? 0;
  const whatIfActive = state.whatIf.upgradeDelay || state.whatIf.furloughYears || state.whatIf.retireAt60 || state.whatIf.pathOverride || state.whatIf.deferralBump;

  return (
    <div className="panel grid grid-cols-3 overflow-hidden lg:flex" role="region" aria-label="Primary flight display — key readouts">
      <Box label="Age" sub={`Landing ${plan.retireAge}${plan.retireAge === 65 ? ' · FAA max' : ''}`}>{p.age}</Box>
      <Box label="Seniority Phase" sub={p.stage === 'cfi' ? `time-building · ${p.hours.toLocaleString()} hrs` : y0 ? `${y0.label}${y0.longevity ? ` · yr ${y0.longevity}` : ''}` : ''}>
        <span className="text-[15px] sm:text-[17px]">{STAGE_LABEL[p.stage]}</span>
      </Box>
      <Box label="Annual Comp" sub={`${plan.rows[0]?.year ?? ''} projected gross`}>{fmtK(y0?.gross ?? 0)}</Box>
      <Box label="Savings Rate" sub={`${fmtPct(y0?.savingsRateWithCompany ?? 0)} incl. company`} tone={save >= 0.15 ? 'text-ok' : save >= 0.1 ? 'text-white' : 'text-caution'}
        bar={{ value: save / 0.3, color: save >= 0.15 ? '#3DDC84' : '#FFB020', marker: 0.15 / 0.3 }}>
        {fmtPct(save)}
      </Box>
      <Box label="Net Worth" tone={netWorth < 0 ? 'text-caution' : 'text-white'} sub="assets − debts today">{fmtK(netWorth)}</Box>
      <Box label="Proj. Ret · P50" tone={tone}
        sub={<>{dollars === 'real' ? "today's $" : 'nominal'} · P(s) <span className={tone}>{fmtPct(success)}</span>{whatIfActive ? <span className="ml-1 text-sel">· WHAT-IF</span> : null}</>}
        bar={{ value: Math.min(1, p50 / Math.max(1, required * 1.5)), color: success >= 0.85 ? '#3DDC84' : success >= 0.7 ? '#FFB020' : '#FF4D4D', marker: 1 / 1.5 }}>
        {fmtK(p50)}
      </Box>
    </div>
  );
}
