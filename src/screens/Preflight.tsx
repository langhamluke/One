import { useEffect, useState } from 'react';
import { AIRLINES, PATH_IDS, PATHS, type AirlineId, type PathId } from '../data/airlines';
import { STATE_TAX_OPTIONS } from '../data/tax2026';
import { Eicas } from '../components/Eicas';
import { AdvisorOnly, Field, NumberInput, Panel, Select, Slider, TextInput, Toggle } from '../components/ui';
import { milestonesFor, type Milestones } from '../lib/inputs';
import { pathLabel, pathShort } from '../lib/payroll';
import type { Stage } from '../lib/types';
import { useDerived } from '../state/derived';
import { useStore } from '../state/store';

const STAGES: { value: Stage; label: string }[] = [
  { value: 'student', label: 'Student pilot' },
  { value: 'cfi', label: 'CFI (time-building)' },
  { value: 'regional_fo', label: 'Regional FO' },
  { value: 'regional_ca', label: 'Regional CA' },
  { value: 'major_fo', label: 'Major FO' },
  { value: 'major_ca', label: 'Major CA' },
  { value: 'cargo_fo', label: 'Cargo FO' },
  { value: 'cargo_ca', label: 'Cargo CA' },
];

const EMPLOYERS: Record<string, AirlineId[]> = {
  student: ['cfi'], cfi: ['cfi'],
  regional_fo: ['envoy', 'regional'], regional_ca: ['envoy', 'regional'],
  major_fo: ['american', 'southwest', 'united', 'delta'], major_ca: ['american', 'southwest', 'united', 'delta'],
  cargo_fo: ['fedex'], cargo_ca: ['fedex'],
};

const MILESTONE_COLS: { key: keyof Milestones; label: string; help: string; earlyOnly?: boolean }[] = [
  { key: 'toRegional', label: 'To regional', help: 'Years of time-building until regional hire (CFI/student only).', earlyOnly: true },
  { key: 'regionalCaUpgrade', label: 'Regional CA', help: 'Years from regional hire to captain upgrade.', earlyOnly: true },
  { key: 'toMajor', label: 'To major / flow', help: 'Years from regional hire to major/flow.', earlyOnly: true },
  { key: 'majorCaUpgrade', label: 'Major CA', help: 'Years from major hire to captain upgrade.' },
  { key: 'widebody', label: 'Widebody CA', help: 'Years after captain upgrade to a widebody seat (0 = stay narrowbody). Ignored where the scale has no widebody step.' },
];

export function Preflight() {
  const p = useStore((s) => s.profile);
  const setProfile = useStore((s) => s.setProfile);
  const setMilestone = useStore((s) => s.setMilestone);
  const selected = useStore((s) => s.selectedPaths);
  const setSelectedPaths = useStore((s) => s.setSelectedPaths);
  const { alerts } = useDerived();
  const isMajor = ['major_fo', 'major_ca', 'cargo_fo', 'cargo_ca'].includes(p.stage);
  const early = p.stage === 'student' || p.stage === 'cfi';
  const pathOptions: PathId[] = isMajor ? ['stay'] : PATH_IDS;

  const togglePath = (id: PathId) => {
    const on = selected.includes(id);
    if (on && selected.length === 1) return;
    if (!on && selected.length >= 4) return;
    setSelectedPaths(on ? selected.filter((x) => x !== id) : [...selected, id]);
  };

  return (
    <div className="grid gap-4 xl:grid-cols-[1fr_360px]">
      <div className="grid content-start gap-4 lg:grid-cols-2">
        <div className="grid content-start gap-4">
        <Panel title="Pilot Profile">
          <div className="grid grid-cols-2 gap-3">
            <Field label="Name" className="col-span-2"><TextInput ariaLabel="Name" value={p.name} onChange={(v) => setProfile({ name: v })} /></Field>
            <Field label="Current age"><NumberInput ariaLabel="Current age" value={p.age} min={17} max={64} step={1} onChange={(v) => setProfile({ age: v, retireAge: Math.max(p.retireAge, v + 1) })} /></Field>
            <Field label="Retirement age" help="FAA mandatory retirement for Part 121 pilots is 65. Inputs above 65 are capped.">
              <NumberInput ariaLabel="Retirement age" value={p.retireAge} min={p.age + 1} max={65} step={1} onChange={(v) => setProfile({ retireAge: v })} />
            </Field>
            <Field label="Marital status">
              <Select ariaLabel="Marital status" value={p.marital} onChange={(v) => setProfile({ marital: v })} options={[{ value: 'single', label: 'Single' }, { value: 'married', label: 'Married (MFJ)' }]} />
            </Field>
            <Field label="Spouse income">
              <NumberInput ariaLabel="Spouse income" kind="usd" value={p.marital === 'married' ? p.spouseIncome : 0} min={0} onChange={(v) => setProfile({ spouseIncome: v })} />
            </Field>
            <Field label="Kids (ages)" help="Comma-separated ages, e.g. 4, 7">
              <KidsInput value={p.kids} onChange={(kids) => setProfile({ kids })} />
            </Field>
            <Field label="Domicile / base"><TextInput ariaLabel="Domicile" value={p.domicile} onChange={(v) => setProfile({ domicile: v })} /></Field>
            <Field label="State of residence"><TextInput ariaLabel="State of residence" value={p.stateOfResidence} onChange={(v) => setProfile({ stateOfResidence: v })} /></Field>
            <Field label="State tax assumption" help="Texas has no personal income tax. Other states are modelled as a flat effective rate on federal taxable income.">
              <Select ariaLabel="State tax" value={p.stateTaxId} onChange={(v) => setProfile({ stateTaxId: v })} options={STATE_TAX_OPTIONS.map((o) => ({ value: o.id, label: o.label }))} />
            </Field>
            {p.stateTaxId === 'custom' && (
              <Field label="Custom state rate" className="col-span-2">
                <NumberInput ariaLabel="Custom state rate" kind="pct" suffix="%" value={p.stateCustomRate * 100} min={0} max={15} step={0.25} onChange={(v) => setProfile({ stateCustomRate: v / 100 })} />
              </Field>
            )}
          </div>
        </Panel>

        <Panel title="Balance Sheet">
          <div className="grid grid-cols-2 gap-3">
            <Field label="Cash"><NumberInput ariaLabel="Cash" kind="usd" value={p.cash} min={0} onChange={(v) => setProfile({ cash: v })} /></Field>
            <Field label="Retirement accounts" help="401(k), IRAs, etc. Treated as pre-tax unless noted."><NumberInput ariaLabel="Retirement accounts" kind="usd" value={p.retirementAccounts} min={0} onChange={(v) => setProfile({ retirementAccounts: v })} /></Field>
            <Field label="Taxable investments"><NumberInput ariaLabel="Taxable investments" kind="usd" value={p.taxable} min={0} onChange={(v) => setProfile({ taxable: v })} /></Field>
            <Field label="Monthly living expenses"><NumberInput ariaLabel="Monthly living expenses" kind="usd" value={p.monthlyExpenses} min={0} onChange={(v) => setProfile({ monthlyExpenses: v })} /></Field>
            <Field label="Flight-school debt"><NumberInput ariaLabel="Flight-school debt" kind="usd" value={p.schoolDebt} min={0} onChange={(v) => setProfile({ schoolDebt: v })} /></Field>
            <Field label="Flight-school rate"><NumberInput ariaLabel="Flight-school rate" kind="pct" suffix="%" value={p.schoolRate} min={0} max={30} step={0.25} onChange={(v) => setProfile({ schoolRate: v })} /></Field>
            <Field label="Other debt"><NumberInput ariaLabel="Other debt" kind="usd" value={p.otherDebt} min={0} onChange={(v) => setProfile({ otherDebt: v })} /></Field>
            <Field label="Other debt rate"><NumberInput ariaLabel="Other debt rate" kind="pct" suffix="%" value={p.otherRate} min={0} max={30} step={0.25} onChange={(v) => setProfile({ otherRate: v })} /></Field>
            <Field label="Other debt payoff" help="Years left on the car loan / other debt. Sets the annual payment."><NumberInput ariaLabel="Other debt payoff years" suffix="yr" value={p.otherDebtYears} min={1} max={30} step={1} onChange={(v) => setProfile({ otherDebtYears: v })} /></Field>
            <AdvisorOnly>
              <Field label="Pre-tax IRA balance" help="Part of retirement accounts held in traditional/rollover IRAs. Triggers the backdoor-Roth pro-rata alert." className="col-span-2">
                <NumberInput ariaLabel="Pre-tax IRA balance" kind="usd" value={p.pretaxIra} min={0} onChange={(v) => setProfile({ pretaxIra: v })} />
              </Field>
            </AdvisorOnly>
          </div>
        </Panel>

        </div>
        <div className="grid content-start gap-4">
        <Panel title="Career Position">
          <div className="grid grid-cols-2 gap-3">
            <Field label="Current stage">
              <Select ariaLabel="Current stage" value={p.stage} options={STAGES}
                onChange={(v) => setProfile({ stage: v, employer: EMPLOYERS[v].includes(p.employer as AirlineId) ? p.employer : EMPLOYERS[v][0] })} />
            </Field>
            <Field label="Current employer">
              <Select ariaLabel="Current employer" value={p.employer} onChange={(v) => setProfile({ employer: v as AirlineId })}
                options={EMPLOYERS[p.stage].map((id) => ({ value: id, label: AIRLINES[id].name }))} />
            </Field>
            <Field label="Total flight hours"><NumberInput ariaLabel="Total flight hours" kind="usd" value={p.hours} min={0} onChange={(v) => setProfile({ hours: v })} /></Field>
            <Field label="Years at employer" help="Drives longevity (pay step) at the current airline.">
              <NumberInput ariaLabel="Years at employer" value={p.yearsAtEmployer} min={0} max={40} step={1} onChange={(v) => setProfile({ yearsAtEmployer: v })} />
            </Field>
            <Field label="Monthly credit hours" className="col-span-2" help="Paid credit hours per month (Southwest: TFP per month). Default 80; typical range 65–100.">
              <Slider ariaLabel="Monthly credit hours" value={p.creditHours} min={65} max={100} onChange={(v) => setProfile({ creditHours: v })} format={(v) => `${v} hr`} />
            </Field>
          </div>

          <div className="mt-4">
            <div className="mb-1.5 flex items-center justify-between">
              <span className="text-[11px] uppercase tracking-[0.1em] text-dim">{isMajor ? 'Career path' : 'Target paths (compare up to 4)'}</span>
            </div>
            <div className="flex flex-wrap gap-2" role="group" aria-label="Target paths">
              {pathOptions.map((id) => {
                const on = selected.includes(id);
                return (
                  <button key={id} type="button" aria-pressed={on} onClick={() => togglePath(id)}
                    className={`rounded border px-2.5 py-1 text-[12px] transition-colors ${on ? 'border-sel bg-sel/10 text-sel' : 'border-edge text-dim hover:text-white'}`}>
                    {on ? '✓ ' : ''}{pathLabel(id, p.stage, p.employer)}{id !== 'stay' && PATHS[id as Exclude<PathId, 'stay'>].reference ? ' · ref' : ''}
                  </button>
                );
              })}
            </div>
          </div>

          <div className="mt-4 overflow-x-auto">
            <table className="w-full text-[12px]">
              <caption className="mb-1.5 text-left text-[11px] uppercase tracking-[0.1em] text-dim">Expected years to each milestone <span className="normal-case tracking-normal">(pre-filled from airlines.ts; editable)</span></caption>
              <thead>
                <tr className="text-left text-[10px] uppercase tracking-wider text-dim">
                  <th className="py-1 pr-2 font-normal">Path</th>
                  {MILESTONE_COLS.filter((c) => !c.earlyOnly || !isMajor).filter((c) => c.key !== 'toRegional' || early).map((c) => (
                    <th key={c.key} className="px-1 py-1 font-normal" title={c.help}>{c.label}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {selected.map((id) => {
                  const m = milestonesFor(p, id);
                  return (
                    <tr key={id} className="border-t border-edge/60">
                      <td className="num whitespace-nowrap py-1.5 pr-2 text-white" title={pathLabel(id, p.stage, p.employer)}>{pathShort(id, p.stage, p.employer)}</td>
                      {MILESTONE_COLS.filter((c) => !c.earlyOnly || !isMajor).filter((c) => c.key !== 'toRegional' || early).map((c) => (
                        <td key={c.key} className="w-[86px] px-1 py-1">
                          <NumberInput ariaLabel={`${c.label} years for ${id}`} value={m[c.key]} min={0} max={30} step={1} suffix="yr" onChange={(v) => setMilestone(id, c.key, v)} />
                        </td>
                      ))}
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </Panel>

          <Panel title="Insurance">
            <div className="grid grid-cols-2 gap-3">
              <Field label="Life insurance" className="col-span-2"><NumberInput ariaLabel="Life insurance" kind="usd" value={p.lifeInsurance} min={0} onChange={(v) => setProfile({ lifeInsurance: v })} /></Field>
              <Field label="Long-term disability" help="Own-occupation LTD coverage (employer or individual)."><Toggle ariaLabel="Long-term disability" checked={p.ltd} onChange={(v) => setProfile({ ltd: v })} label={p.ltd ? 'Covered' : 'None'} /></Field>
              <Field label="LTD monthly benefit"><NumberInput ariaLabel="LTD monthly benefit" kind="usd" value={p.ltdMonthly} min={0} onChange={(v) => setProfile({ ltdMonthly: v })} /></Field>
              <Field label="Loss of license" help="Pays if the FAA medical certificate is lost — a pilot-specific risk general LTD may not cover."><Toggle ariaLabel="Loss of license" checked={p.lol} onChange={(v) => setProfile({ lol: v })} label={p.lol ? 'Covered' : 'None'} /></Field>
              <Field label="LOL monthly benefit"><NumberInput ariaLabel="Loss of license monthly benefit" kind="usd" value={p.lolMonthly} min={0} onChange={(v) => setProfile({ lolMonthly: v })} /></Field>
            </div>
          </Panel>

          <Panel title="Savings Behavior">
            <div className="grid grid-cols-2 gap-3">
              <Field label="401(k) deferral" help="Elective deferral as % of pay. Capped at the IRS limit ($24,500 in 2026; catch-ups at 50+)."><NumberInput ariaLabel="401k deferral percent" kind="pct" suffix="%" value={p.deferralPct} min={0} max={75} step={1} onChange={(v) => setProfile({ deferralPct: v })} /></Field>
              <Field label="Roth share of deferral"><NumberInput ariaLabel="Roth share of deferral" kind="pct" suffix="%" value={p.rothPct} min={0} max={100} step={10} onChange={(v) => setProfile({ rothPct: v })} /></Field>
              <Field label="Roth IRA"><Toggle ariaLabel="Roth IRA" checked={p.rothIra} onChange={(v) => setProfile({ rothIra: v })} label={p.rothIra ? 'Yes' : 'No'} /></Field>
              <Field label="HSA eligible" help="Enrolled in a high-deductible health plan."><Toggle ariaLabel="HSA eligible" checked={p.hsaEligible} onChange={(v) => setProfile({ hsaEligible: v })} label={p.hsaEligible ? 'Yes' : 'No'} /></Field>
              <Field label="Monthly taxable investing" className="col-span-2"><NumberInput ariaLabel="Monthly taxable investing" kind="usd" value={p.monthlyTaxable} min={0} onChange={(v) => setProfile({ monthlyTaxable: v })} /></Field>
            </div>
          </Panel>
        </div>
      </div>

      <aside className="grid content-start gap-4">
        <Eicas alerts={alerts} compact />
        <Panel title="Planning Notes">
          <ul className="space-y-2 text-[12px] leading-relaxed text-dim">
            <li><span className="text-white">Plan year 1 = 2027.</span> 2026 contract rates are indexed by dated raises; Envoy's 2026 premium is not projected.</li>
            <li><span className="text-sel">Cyan</span> values are editable. <span className="text-plan">Magenta</span> is the recommended flight plan. <span className="text-caution">Amber</span> means caution or unverified data.</li>
            <li>Southwest pays per Trip for Pay (TFP); credit hours are read as TFP/month for that path.</li>
          </ul>
        </Panel>
      </aside>
    </div>
  );
}

function KidsInput({ value, onChange }: { value: number[]; onChange: (v: number[]) => void }) {
  const [text, setText] = useState(value.join(', '));
  useEffect(() => setText(value.join(', ')), [value]);
  const commit = () => onChange(text.split(',').map((x) => x.trim()).filter((x) => x !== '').map(Number).filter((n) => Number.isFinite(n) && n >= 0 && n < 30));
  return <input type="text" aria-label="Kids ages" className="inp" placeholder="none" value={text} onChange={(e) => setText(e.target.value)} onBlur={commit} onKeyDown={(e) => e.key === 'Enter' && commit()} />;
}
