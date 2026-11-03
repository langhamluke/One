import { Plus, Trash2 } from 'lucide-react';
import { usePlanStore } from '@/state/plan';
import { useDerived } from '@/state/derived';
import { useAdvisorView } from './PlanLayout';
import { Button, Chip, Field, HelpTip, Note, NumberInput, Panel, Select, Stat, TextInput, Toggle, VerifyTag } from '@/components/ui';
import { EngineUnavailable } from '@/components/EngineUnavailable';
import { AlertLedger } from '@/components/AlertLedger';
import { listStates } from '@shared/data/states';
import { listMetros } from '@shared/data/careers';
import { CURRENT_YEAR, type Debt, type DebtKind, type FederalPlan, type Goal, type GoalKind } from '@shared/lib/inputs';
import { fmtMoney, fmtPct } from '@/lib/format';

const DEBT_KINDS: { value: DebtKind; label: string }[] = [
  { value: 'federal_student', label: 'Federal student loan' }, { value: 'private_student', label: 'Private student loan' }, { value: 'credit_card', label: 'Credit card' },
  { value: 'auto', label: 'Auto loan' }, { value: 'personal', label: 'Personal loan' }, { value: 'medical', label: 'Medical' },
  { value: 'heloc', label: 'HELOC (home equity line)' }, { value: 'sbloc', label: 'SBLOC (securities-based line)' }, { value: 'other', label: 'Other' },
];
const FED_PLANS: { value: FederalPlan; label: string }[] = [
  { value: 'tiered_standard', label: 'Tiered standard' }, { value: 'standard', label: 'Standard (legacy 10-yr)' }, { value: 'rap', label: 'RAP' }, { value: 'ibr', label: 'IBR (legacy)' }, { value: 'custom', label: 'Custom payment' },
];
const GOAL_KINDS: { value: GoalKind; label: string }[] = [
  { value: 'home', label: 'Home' }, { value: 'car', label: 'Car' }, { value: 'wedding', label: 'Wedding' }, { value: 'gradschool', label: 'Grad school' }, { value: 'travel', label: 'Travel' }, { value: 'other', label: 'Other' },
];

function uid(prefix: string): string {
  return `${prefix}-${Math.random().toString(36).slice(2, 8)}`;
}

export function ProfilePage() {
  const state = usePlanStore((s) => s.state);
  const update = usePlanStore((s) => s.update);
  const { derived, error } = useDerived();
  const advisor = useAdvisorView();
  const p = state.profile;
  const bs = state.balanceSheet;
  const b = state.benefits;
  const sv = state.savings;
  const ins = state.insurance;
  const states = listStates();
  const metros = listMetros();

  return (
    <div className="grid gap-4 lg:grid-cols-12">
      <div className="lg:col-span-7 flex flex-col gap-4 min-w-0">
        <Note tone="rec">Use a nickname and ballpark numbers. Never enter SSNs, account numbers or health details.</Note>

        <Panel title="About you" collapseKey="profile.about">
          <div className="grid gap-3 sm:grid-cols-2">
            <Field label="Nickname" htmlFor="pf-nick"><TextInput id="pf-nick" value={p.nickname} onChange={(e) => update((s) => { s.profile.nickname = e.target.value; })} placeholder="e.g. Sam" maxLength={40} /></Field>
            <Field label="Age" htmlFor="pf-age"><NumberInput id="pf-age" value={p.age} min={16} max={80} step={1} suffix="yrs" onChange={(v) => update((s) => { s.profile.age = v ?? 22; })} /></Field>
            <Field label="Retirement age" htmlFor="pf-ret"><NumberInput id="pf-ret" value={p.retirementAge} min={40} max={80} step={1} suffix="yrs" onChange={(v) => update((s) => { s.profile.retirementAge = v ?? 67; })} /></Field>
            <Field label="Filing status" htmlFor="pf-filing"><Select id="pf-filing" value={p.filingStatus} onChange={(e) => update((s) => { s.profile.filingStatus = e.target.value as typeof p.filingStatus; })} options={[{ value: 'single', label: 'Single' }, { value: 'mfj', label: 'Married filing jointly' }, { value: 'hoh', label: 'Head of household' }]} /></Field>
            <Field label="State" htmlFor="pf-state" help="State income tax preset. Pick Custom to enter a flat effective rate.">
              <Select id="pf-state" value={p.stateCode} onChange={(e) => update((s) => { s.profile.stateCode = e.target.value; if (e.target.value === 'CUSTOM' && s.profile.customStateRate == null) s.profile.customStateRate = 0.04; })} options={[...states.map((st) => ({ value: st.code, label: st.name })), { value: 'CUSTOM', label: 'Custom rate' }]} />
            </Field>
            {p.stateCode === 'CUSTOM' ? (
              <Field label="Custom state rate" htmlFor="pf-staterate"><NumberInput id="pf-staterate" value={p.customStateRate ?? 0} scale={100} digits={2} min={0} max={0.15} step={0.0025} suffix="%" onChange={(v) => update((s) => { s.profile.customStateRate = v ?? 0; })} /></Field>
            ) : (
              <Field label="Metro" htmlFor="pf-metro" help="Adjusts wage bands by metro cost-of-labor index."><Select id="pf-metro" value={p.metro} onChange={(e) => update((s) => { s.profile.metro = e.target.value; })} options={metros.map((m) => ({ value: m.key, label: m.name }))} /></Field>
            )}
            {p.stateCode === 'CUSTOM' && (
              <Field label="Metro" htmlFor="pf-metro2"><Select id="pf-metro2" value={p.metro} onChange={(e) => update((s) => { s.profile.metro = e.target.value; })} options={metros.map((m) => ({ value: m.key, label: m.name }))} /></Field>
            )}
            <Field label="Dependents" htmlFor="pf-dep"><NumberInput id="pf-dep" value={p.dependents} min={0} max={10} step={1} onChange={(v) => update((s) => { s.profile.dependents = v ?? 0; })} /></Field>
            <Field label="Spouse / partner income" htmlFor="pf-spouse" help="Annual wages of a partner included in the household plan; 0 if none."><NumberInput id="pf-spouse" value={p.spouseIncome} min={0} max={5_000_000} step={1000} prefix="$" suffix="/yr" onChange={(v) => update((s) => { s.profile.spouseIncome = v ?? 0; })} /></Field>
            <Field label="Graduation year" htmlFor="pf-grad"><NumberInput id="pf-grad" value={p.graduationYear} min={CURRENT_YEAR - 15} max={CURRENT_YEAR + 8} step={1} onChange={(v) => update((s) => { s.profile.graduationYear = v ?? CURRENT_YEAR; })} /></Field>
            <Field label="Degree" htmlFor="pf-degree"><Select id="pf-degree" value={p.degree} onChange={(e) => update((s) => { s.profile.degree = e.target.value as typeof p.degree; })} options={[{ value: 'bachelor', label: "Bachelor's" }, { value: 'associate', label: "Associate's" }, { value: 'master', label: "Master's" }, { value: 'professional', label: 'Professional (JD/MD)' }, { value: 'doctoral', label: 'Doctoral' }, { value: 'trade', label: 'Trade / certificate' }, { value: 'none', label: 'No degree' }]} /></Field>
            <Field label="Field of study" htmlFor="pf-field"><TextInput id="pf-field" value={p.fieldOfStudy ?? ''} onChange={(e) => update((s) => { s.profile.fieldOfStudy = e.target.value || undefined; })} placeholder="optional" maxLength={60} /></Field>
          </div>
        </Panel>

        <Panel title="Spending" collapseKey="profile.spending">
          <div className="grid gap-3 sm:grid-cols-2">
            <Field label="Living expenses" htmlFor="sp-living" help="Annual spending excluding debt payments, payroll deductions and savings, in today's dollars."><NumberInput id="sp-living" value={p.livingExpenses} min={0} max={2_000_000} step={500} prefix="$" suffix="/yr" onChange={(v) => update((s) => { s.profile.livingExpenses = v ?? 0; })} /></Field>
            <Field label="Housing cost (included above)" htmlFor="sp-housing" help="Rent or mortgage plus utilities, as part of living expenses."><NumberInput id="sp-housing" value={p.housingCost} min={0} max={p.livingExpenses} step={500} prefix="$" suffix="/yr" onChange={(v) => update((s) => { s.profile.housingCost = v ?? 0; })} /></Field>
          </div>
        </Panel>

        <Panel title="Balance sheet" collapseKey="profile.balance">
          <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
            {([
              ['cash', 'Cash (checking + savings)', 'Your emergency fund lives here.'],
              ['taxable', 'Taxable brokerage', ''],
              ['preTax', 'Pre-tax retirement (401k/IRA)', ''],
              ['roth', 'Roth balances', ''],
              ['hsa', 'HSA balance', ''],
              ['otherAssets', 'Other assets (car, etc.)', 'Counted in net worth only.'],
            ] as const).map(([k, label, help]) => (
              <Field key={k} label={label} htmlFor={`bs-${k}`} help={help || undefined}>
                <NumberInput id={`bs-${k}`} value={bs[k]} min={0} max={50_000_000} step={500} prefix="$" onChange={(v) => update((s) => { s.balanceSheet[k] = v ?? 0; })} />
              </Field>
            ))}
          </div>
        </Panel>

        <Panel title="Debts" collapseKey="profile.debts" subtitle={state.debts.length ? `${state.debts.length} · ${fmtMoney(state.debts.reduce((a, d) => a + d.balance, 0))}` : undefined} actions={<Button size="sm" icon={<Plus className="h-3.5 w-3.5" aria-hidden />} onClick={() => update((s) => { s.debts.push({ id: uid('debt'), name: `Debt ${s.debts.length + 1}`, kind: 'federal_student', balance: 20000, rate: 0.0652, termMonths: 120, federalPlan: 'tiered_standard', legacyBorrower: false, graceMonths: 0 }); })}>Add debt</Button>}>
          {state.debts.length === 0 ? <p className="text-sm text-ink-3">No debts. Add student loans, cards or car loans to model payoff.</p> : (
            <div className="flex flex-col gap-3">
              {state.debts.map((d, i) => <DebtRow key={d.id} d={d} i={i} />)}
            </div>
          )}
          <Note className="mt-3">
            <span className="font-medium">Federal plans after July 1, 2026.</span> <span className="font-medium">Tiered standard</span>: fixed payments over 10–25 years depending on how much you borrowed. <span className="font-medium">RAP</span>: payment is a share of your income (1–10%), unpaid interest is waived, and the balance is forgiven after 30 years of payments.
          </Note>
        </Panel>

        <Panel title="Benefits" collapseKey="profile.benefits" defaultCollapsed>
          <div className="grid gap-3 sm:grid-cols-2">
            <Field label="Employer match rate" htmlFor="bn-match" help="1.0 = dollar for dollar; 0.5 = fifty cents per dollar."><NumberInput id="bn-match" value={b.matchRate} scale={100} min={0} max={3} step={0.25} suffix="%" onChange={(v) => update((s) => { s.benefits.matchRate = v ?? 0; })} /></Field>
            <Field label="Match applies up to" htmlFor="bn-cap" help="Deferrals up to this share of pay are matched."><NumberInput id="bn-cap" value={b.matchCapPct} scale={100} min={0} max={0.25} step={0.005} digits={1} suffix="% of pay" onChange={(v) => update((s) => { s.benefits.matchCapPct = v ?? 0; })} /></Field>
            <Field label="Non-elective contribution" htmlFor="bn-ne" help="Employer puts this in regardless of what you defer."><NumberInput id="bn-ne" value={b.nonElectivePct} scale={100} min={0} max={0.25} step={0.005} digits={1} suffix="% of pay" onChange={(v) => update((s) => { s.benefits.nonElectivePct = v ?? 0; })} /></Field>
            <Field label="Employer HSA seed" htmlFor="bn-hsaseed"><NumberInput id="bn-hsaseed" value={b.employerHsaContribution} min={0} max={10000} step={50} prefix="$" suffix="/yr" disabled={!b.hsaEligible} onChange={(v) => update((s) => { s.benefits.employerHsaContribution = v ?? 0; })} /></Field>
            <Toggle id="bn-hsa" checked={b.hsaEligible} onChange={(v) => update((s) => { s.benefits.hsaEligible = v; })} label="HSA-eligible health plan" description="High-deductible plan with a Health Savings Account" />
            <Toggle id="bn-slm" checked={b.studentLoanMatch} onChange={(v) => update((s) => { s.benefits.studentLoanMatch = v; })} label="Student-loan payment match" description="Employer matches loan payments into the 401(k) (SECURE 2.0 §110)" />
            <Field label="Employer loan repayment" htmlFor="bn-elr" help="Educational assistance under IRC §127; up to $5,250 a year is tax-free."><NumberInput id="bn-elr" value={b.employerLoanRepayment} min={0} max={20000} step={250} prefix="$" suffix="/yr" onChange={(v) => update((s) => { s.benefits.employerLoanRepayment = v ?? 0; })} /></Field>
            <Field label="Life insurance (multiple of salary)" htmlFor="bn-life"><NumberInput id="bn-life" value={b.lifeCoverageMultiple} min={0} max={10} step={0.5} suffix="×" onChange={(v) => update((s) => { s.benefits.lifeCoverageMultiple = v ?? 0; })} /></Field>
            <Toggle id="bn-dis" checked={b.disabilityCoverage} onChange={(v) => update((s) => { s.benefits.disabilityCoverage = v; })} label="Employer long-term disability" />
          </div>
          <div className="mt-4 grid gap-4 md:grid-cols-2">
            <div className="rounded-md border border-line-2 p-3">
              <Toggle id="pn-on" checked={b.pension.enabled} onChange={(v) => update((s) => { s.benefits.pension.enabled = v; })} label="Pension (defined benefit)" description="Common in public sector and some unions" />
              {b.pension.enabled && (
                <div className="grid gap-3 sm:grid-cols-2 mt-3">
                  <Field label="Multiplier per year" htmlFor="pn-mult"><NumberInput id="pn-mult" value={b.pension.multiplier} scale={100} digits={2} min={0} max={0.05} step={0.0025} suffix="%" onChange={(v) => update((s) => { s.benefits.pension.multiplier = v ?? 0; })} /></Field>
                  <Field label="Employee contribution" htmlFor="pn-ee"><NumberInput id="pn-ee" value={b.pension.employeeContribPct} scale={100} digits={1} min={0} max={0.2} step={0.005} suffix="% of pay" onChange={(v) => update((s) => { s.benefits.pension.employeeContribPct = v ?? 0; })} /></Field>
                  <Field label="Vesting years" htmlFor="pn-vest"><NumberInput id="pn-vest" value={b.pension.vestingYears} min={0} max={15} step={1} suffix="yrs" onChange={(v) => update((s) => { s.benefits.pension.vestingYears = v ?? 0; })} /></Field>
                  <Field label="Normal retirement age" htmlFor="pn-nra"><NumberInput id="pn-nra" value={b.pension.normalRetirementAge} min={50} max={75} step={1} suffix="yrs" onChange={(v) => update((s) => { s.benefits.pension.normalRetirementAge = v ?? 65; })} /></Field>
                  <Toggle id="pn-ss" checked={b.pension.coveredBySocialSecurity} onChange={(v) => update((s) => { s.benefits.pension.coveredBySocialSecurity = v; })} label="Employer participates in Social Security" />
                </div>
              )}
            </div>
            <div className="rounded-md border border-line-2 p-3">
              <div className="text-sm font-medium text-ink-2 mb-2">Equity compensation</div>
              <div className="grid gap-3 sm:grid-cols-2">
                <Field label="Annual RSU vest value" htmlFor="eq-rsu"><NumberInput id="eq-rsu" value={b.equityComp.annualRsuValue} min={0} max={5_000_000} step={1000} prefix="$" suffix="/yr" onChange={(v) => update((s) => { s.benefits.equityComp.annualRsuValue = v ?? 0; })} /></Field>
                <Field label="ESPP discount" htmlFor="eq-disc"><NumberInput id="eq-disc" value={b.equityComp.esppDiscount} scale={100} min={0} max={0.15} step={0.05} suffix="%" onChange={(v) => update((s) => { s.benefits.equityComp.esppDiscount = v ?? 0; })} /></Field>
                <Field label="ESPP contribution" htmlFor="eq-contrib"><NumberInput id="eq-contrib" value={b.equityComp.esppContribPct} scale={100} min={0} max={0.15} step={0.01} suffix="% of pay" onChange={(v) => update((s) => { s.benefits.equityComp.esppContribPct = v ?? 0; })} /></Field>
              </div>
            </div>
          </div>
        </Panel>

        <Panel title="Savings habits" collapseKey="profile.savings">
          <div className="grid gap-3 sm:grid-cols-2">
            <Field label="401(k) deferral" htmlFor="sv-def"><NumberInput id="sv-def" value={sv.deferralPct} scale={100} digits={1} min={0} max={1} step={0.01} suffix="% of pay" onChange={(v) => update((s) => { s.savings.deferralPct = v ?? 0; })} /></Field>
            <Field label="Deferral type" htmlFor="sv-type"><Select id="sv-type" value={sv.deferralType} onChange={(e) => update((s) => { s.savings.deferralType = e.target.value as typeof sv.deferralType; })} options={[{ value: 'pretax', label: 'Pre-tax' }, { value: 'roth', label: 'Roth' }, { value: 'split', label: 'Split' }]} /></Field>
            {sv.deferralType === 'split' && <Field label="Share to Roth" htmlFor="sv-split"><NumberInput id="sv-split" value={sv.rothSplit} scale={100} min={0} max={1} step={0.05} suffix="%" onChange={(v) => update((s) => { s.savings.rothSplit = v ?? 0.5; })} /></Field>}
            <Field label="HSA contribution (payroll)" htmlFor="sv-hsa"><NumberInput id="sv-hsa" value={sv.hsaContribution} min={0} max={20000} step={100} prefix="$" suffix="/yr" disabled={!b.hsaEligible} onChange={(v) => update((s) => { s.savings.hsaContribution = v ?? 0; })} /></Field>
            <Field label="IRA contribution" htmlFor="sv-ira"><NumberInput id="sv-ira" value={sv.iraContribution} min={0} max={20000} step={100} prefix="$" suffix="/yr" onChange={(v) => update((s) => { s.savings.iraContribution = v ?? 0; })} /></Field>
            <Field label="IRA type" htmlFor="sv-iratype"><Select id="sv-iratype" value={sv.iraType} onChange={(e) => update((s) => { s.savings.iraType = e.target.value as typeof sv.iraType; })} options={[{ value: 'roth', label: 'Roth IRA' }, { value: 'traditional', label: 'Traditional IRA' }]} /></Field>
            <Field label="Taxable investing" htmlFor="sv-tax"><NumberInput id="sv-tax" value={sv.taxableContribution} min={0} max={1_000_000} step={100} prefix="$" suffix="/yr" onChange={(v) => update((s) => { s.savings.taxableContribution = v ?? 0; })} /></Field>
            <Field label="Emergency fund override" htmlFor="sv-ef" help="Leave blank to use the computed target."><NumberInput id="sv-ef" value={sv.emergencyFundMonthsOverride} allowEmpty placeholder="auto" min={0} max={24} step={1} suffix="mo" onChange={(v) => update((s) => { s.savings.emergencyFundMonthsOverride = v; })} /></Field>
          </div>
        </Panel>

        <Panel title="Goals" collapseKey="profile.goals" actions={<Button size="sm" icon={<Plus className="h-3.5 w-3.5" aria-hidden />} onClick={() => update((s) => { s.goals.push({ id: uid('goal'), name: 'New goal', kind: 'other', targetAmount: 10000, targetYear: CURRENT_YEAR + 3, priority: s.goals.length + 1, fundedSoFar: 0 }); })}>Add goal</Button>}>
          {state.goals.length === 0 ? <p className="text-sm text-ink-3">No goals yet. Add a home, car or other target so the plan can fund it.</p> : (
            <div className="flex flex-col gap-3">{state.goals.map((g, i) => <GoalRow key={g.id} g={g} i={i} />)}</div>
          )}
        </Panel>

        <Panel title="Insurance" collapseKey="profile.insurance" defaultCollapsed>
          <div className="grid gap-3 sm:grid-cols-2">
            <Field label="Health coverage" htmlFor="in-health"><Select id="in-health" value={ins.health} onChange={(e) => update((s) => { s.insurance.health = e.target.value as typeof ins.health; })} options={[{ value: 'employer', label: 'Employer plan' }, { value: 'parent', label: "Parent's plan (under 26)" }, { value: 'marketplace', label: 'Marketplace' }, { value: 'none', label: 'None' }]} /></Field>
            <div className="flex flex-col gap-2">
              <Toggle id="in-dis" checked={ins.disability} onChange={(v) => update((s) => { s.insurance.disability = v; })} label="Own disability policy" />
              <Toggle id="in-life" checked={ins.life} onChange={(v) => update((s) => { s.insurance.life = v; })} label="Own term life policy" />
              <Toggle id="in-rent" checked={ins.renters} onChange={(v) => update((s) => { s.insurance.renters = v; })} label="Renters / homeowners insurance" />
            </div>
          </div>
        </Panel>
      </div>

      <div className="lg:col-span-5 flex flex-col gap-4 min-w-0">
        {error ? <EngineUnavailable error={advisor ? error : undefined} /> : derived ? (
          <>
            <Panel title="Snapshot">
              <div className="grid grid-cols-2 gap-3">
                <Stat label="Net worth" value={fmtMoney(derived.headline.netWorth)} />
                <Stat label="Year-1 take-home" value={fmtMoney(derived.headline.year1TakeHome)} />
                <Stat label="Year-1 cash flow" value={<span className={derived.headline.year1CashFlow < 0 ? 'text-danger' : ''}>{fmtMoney(derived.headline.year1CashFlow)}</span>} sub="after spending, debt and planned savings" />
                <Stat label="Savings rate" value={fmtPct(derived.headline.savingsRate, 1)} sub={`${fmtPct(derived.headline.savingsRateWithEmployer, 1)} with employer`} />
              </div>
            </Panel>
            <Panel title={`Taxes · ${derived.tax.year}`} subtitle="first income year">
              <dl className="grid grid-cols-[1fr_auto] gap-x-3 gap-y-1 text-sm">
                {([
                  ['Gross income', derived.tax.gross], ['Pre-tax deductions', -derived.tax.pretaxDeductions], ['Standard deduction', -derived.tax.standardDeduction], ['Taxable income', derived.tax.taxableIncome],
                  ['Federal tax', -derived.tax.federalTax], ['State tax', -derived.tax.stateTax], ['FICA', -derived.tax.fica], ['Take-home', derived.tax.takeHome],
                ] as const).map(([k, v]) => (
                  <div key={k} className="contents"><dt className="text-ink-3">{k}</dt><dd className="num text-right">{fmtMoney(v)}</dd></div>
                ))}
              </dl>
              <div className="mt-2 flex gap-2 flex-wrap"><Chip>Effective {fmtPct(derived.tax.effectiveRate, 1)}</Chip><Chip>Marginal {fmtPct(derived.tax.marginalFederalRate, 0)}</Chip></div>
            </Panel>
            <Panel title="Alerts"><AlertLedger alerts={derived.alerts} advisor={advisor} compact limit={6} /></Panel>
            {advisor && derived.dataQuality.userProvidedCount > 0 && (
              <Note tone="warn"><span className="inline-flex items-center gap-2"><VerifyTag label="Self-reported" source="Client inputs" asOf={String(CURRENT_YEAR)} /> {derived.dataQuality.userProvidedCount} self-reported figures in use.</span></Note>
            )}
          </>
        ) : <Panel title="Snapshot"><p className="text-sm text-ink-3">Computing…</p></Panel>}
      </div>
    </div>
  );
}

function DebtRow({ d, i }: { d: Debt; i: number }) {
  const update = usePlanStore((s) => s.update);
  const set = <K extends keyof Debt>(k: K, v: Debt[K]) => update((s) => { (s.debts[i] as Debt)[k] = v; });
  const fed = d.kind === 'federal_student';
  return (
    <div className="rounded-md border border-line-2 p-3">
      <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
        <Field label="Kind" htmlFor={`db-kind-${d.id}`}><Select id={`db-kind-${d.id}`} value={d.kind} onChange={(e) => set('kind', e.target.value as DebtKind)} options={DEBT_KINDS} /></Field>
        <Field label="Name" htmlFor={`db-name-${d.id}`}><TextInput id={`db-name-${d.id}`} value={d.name} onChange={(e) => set('name', e.target.value)} maxLength={40} /></Field>
        <Field label="Balance" htmlFor={`db-bal-${d.id}`}><NumberInput id={`db-bal-${d.id}`} value={d.balance} min={0} max={5_000_000} step={500} prefix="$" onChange={(v) => set('balance', v ?? 0)} /></Field>
        <Field label="Rate" htmlFor={`db-rate-${d.id}`}><NumberInput id={`db-rate-${d.id}`} value={d.rate} scale={100} digits={2} min={0} max={0.5} step={0.0025} suffix="%" onChange={(v) => set('rate', v ?? 0)} /></Field>
        {!(fed && d.federalPlan && d.federalPlan !== 'custom') && (
          <Field label="Term" htmlFor={`db-term-${d.id}`}><NumberInput id={`db-term-${d.id}`} value={d.termMonths} allowEmpty placeholder="auto" min={1} max={480} step={12} suffix="mo" onChange={(v) => set('termMonths', v)} /></Field>
        )}
        <Field label="Payment override" htmlFor={`db-pay-${d.id}`} help="Leave blank to derive the payment from the term or plan rules."><NumberInput id={`db-pay-${d.id}`} value={d.payment} allowEmpty placeholder="auto" min={0} max={100000} step={25} prefix="$" suffix="/mo" onChange={(v) => set('payment', v)} /></Field>
        <Field label="Extra payment" htmlFor={`db-extra-${d.id}`}><NumberInput id={`db-extra-${d.id}`} value={d.extraPayment ?? 0} min={0} max={100000} step={25} prefix="$" suffix="/mo" onChange={(v) => set('extraPayment', v ?? 0)} /></Field>
        {fed && (
          <>
            <Field label="Federal plan" htmlFor={`db-plan-${d.id}`} help="Tiered standard: fixed payments over 10–25 years by amount borrowed. RAP: income-based payment with interest waived and forgiveness after 30 years."><Select id={`db-plan-${d.id}`} value={d.federalPlan ?? 'tiered_standard'} onChange={(e) => set('federalPlan', e.target.value as FederalPlan)} options={FED_PLANS.map((o) => ({ ...o, disabled: (o.value === 'standard' || o.value === 'ibr') && !d.legacyBorrower }))} /></Field>
            <Field label="Original balance" htmlFor={`db-orig-${d.id}`} help="Amount borrowed; sets the tiered-standard term."><NumberInput id={`db-orig-${d.id}`} value={d.originalBalance} allowEmpty placeholder="= balance" min={0} max={5_000_000} step={500} prefix="$" onChange={(v) => set('originalBalance', v)} /></Field>
            <Field label="Grace months" htmlFor={`db-grace-${d.id}`}><NumberInput id={`db-grace-${d.id}`} value={d.graceMonths ?? 0} min={0} max={36} step={1} suffix="mo" onChange={(v) => set('graceMonths', v ?? 0)} /></Field>
            <div className="flex items-end"><Toggle id={`db-legacy-${d.id}`} checked={!!d.legacyBorrower} onChange={(v) => { set('legacyBorrower', v); if (!v && (d.federalPlan === 'standard' || d.federalPlan === 'ibr')) set('federalPlan', 'tiered_standard'); }} label="Legacy borrower" description="First loan before July 1, 2026" /></div>
          </>
        )}
      </div>
      <div className="mt-2 flex justify-end">
        <Button size="sm" variant="ghost" icon={<Trash2 className="h-3.5 w-3.5" aria-hidden />} onClick={() => update((s) => { s.debts.splice(i, 1); })} aria-label={`Remove ${d.name}`}>Remove</Button>
      </div>
    </div>
  );
}

function GoalRow({ g, i }: { g: Goal; i: number }) {
  const update = usePlanStore((s) => s.update);
  const set = <K extends keyof Goal>(k: K, v: Goal[K]) => update((s) => { (s.goals[i] as Goal)[k] = v; });
  return (
    <div className="rounded-md border border-line-2 p-3">
      <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
        <Field label="Name" htmlFor={`gl-name-${g.id}`}><TextInput id={`gl-name-${g.id}`} value={g.name} onChange={(e) => set('name', e.target.value)} maxLength={40} /></Field>
        <Field label="Kind" htmlFor={`gl-kind-${g.id}`}><Select id={`gl-kind-${g.id}`} value={g.kind} onChange={(e) => { const k = e.target.value as GoalKind; update((s) => { s.goals[i].kind = k; if (k === 'home' && !s.goals[i].home) s.goals[i].home = { price: 400000, downPct: 0.1, mortgageRate: 0.065, termYears: 30, propertyTaxPct: 0.011, maintenancePct: 0.01 }; }); }} options={GOAL_KINDS} /></Field>
        <Field label="Target (today's $)" htmlFor={`gl-amt-${g.id}`}><NumberInput id={`gl-amt-${g.id}`} value={g.targetAmount} min={0} max={10_000_000} step={500} prefix="$" onChange={(v) => set('targetAmount', v ?? 0)} /></Field>
        <Field label="Year needed" htmlFor={`gl-year-${g.id}`}><NumberInput id={`gl-year-${g.id}`} value={g.targetYear} min={CURRENT_YEAR} max={CURRENT_YEAR + 50} step={1} onChange={(v) => set('targetYear', v ?? CURRENT_YEAR + 1)} /></Field>
        <Field label="Priority" htmlFor={`gl-pri-${g.id}`} help="1 = fund first."><NumberInput id={`gl-pri-${g.id}`} value={g.priority} min={1} max={20} step={1} onChange={(v) => set('priority', v ?? 1)} /></Field>
        <Field label="Funded so far" htmlFor={`gl-fund-${g.id}`}><NumberInput id={`gl-fund-${g.id}`} value={g.fundedSoFar} min={0} max={10_000_000} step={500} prefix="$" onChange={(v) => set('fundedSoFar', v ?? 0)} /></Field>
        {g.kind === 'home' && g.home && (
          <>
            <Field label="Home price" htmlFor={`gl-price-${g.id}`}><NumberInput id={`gl-price-${g.id}`} value={g.home.price} min={0} max={20_000_000} step={5000} prefix="$" onChange={(v) => update((s) => { s.goals[i].home!.price = v ?? 0; })} /></Field>
            <Field label="Down payment" htmlFor={`gl-down-${g.id}`}><NumberInput id={`gl-down-${g.id}`} value={g.home.downPct} scale={100} min={0} max={1} step={0.05} suffix="%" onChange={(v) => update((s) => { s.goals[i].home!.downPct = v ?? 0; })} /></Field>
            <Field label="Mortgage rate" htmlFor={`gl-mrate-${g.id}`}><NumberInput id={`gl-mrate-${g.id}`} value={g.home.mortgageRate} scale={100} digits={2} min={0} max={0.2} step={0.00125} suffix="%" onChange={(v) => update((s) => { s.goals[i].home!.mortgageRate = v ?? 0; })} /></Field>
            <Field label="Term" htmlFor={`gl-term-${g.id}`}><NumberInput id={`gl-term-${g.id}`} value={g.home.termYears} min={5} max={40} step={5} suffix="yrs" onChange={(v) => update((s) => { s.goals[i].home!.termYears = v ?? 30; })} /></Field>
            <Field label="Property tax" htmlFor={`gl-ptax-${g.id}`}><NumberInput id={`gl-ptax-${g.id}`} value={g.home.propertyTaxPct} scale={100} digits={2} min={0} max={0.05} step={0.001} suffix="%/yr" onChange={(v) => update((s) => { s.goals[i].home!.propertyTaxPct = v ?? 0; })} /></Field>
            <Field label="Maintenance" htmlFor={`gl-maint-${g.id}`}><NumberInput id={`gl-maint-${g.id}`} value={g.home.maintenancePct} scale={100} digits={2} min={0} max={0.05} step={0.0025} suffix="%/yr" onChange={(v) => update((s) => { s.goals[i].home!.maintenancePct = v ?? 0; })} /></Field>
          </>
        )}
      </div>
      <div className="mt-2 flex justify-end">
        <Button size="sm" variant="ghost" icon={<Trash2 className="h-3.5 w-3.5" aria-hidden />} onClick={() => update((s) => { s.goals.splice(i, 1); })} aria-label={`Remove ${g.name}`}>Remove</Button>
      </div>
    </div>
  );
}

export { HelpTip as _HelpTip };
