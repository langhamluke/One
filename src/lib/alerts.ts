import { AIRLINES } from '../data/airlines';
import { IRS_2026 } from '../data/irs2026';
import { fmtK, fmtPct, fmtDate } from './format';
import type { PlanState } from './inputs';
import type { MCResult } from './montecarlo';
import type { PlanResult } from './plan';

export type AlertLevel = 'warning' | 'caution' | 'advisory';
export interface Alert { id: string; level: AlertLevel; text: string; detail: string; advisorOnly?: boolean }

const ORDER: Record<AlertLevel, number> = { warning: 0, caution: 1, advisory: 2 };

export function countUnverified(plan: PlanResult): number {
  const seen = new Set<string>();
  for (const r of plan.rows) if (r.rate && !r.rate.verified) seen.add(`${r.airline}-${r.seat}-${r.fleet}-${r.longevity}`);
  for (const id of new Set(plan.rows.map((r) => r.airline))) {
    if (!id) continue;
    const a = AIRLINES[id];
    if (!a.retirement.companyPct.verified) seen.add(`${id}-companyPct`);
    if (!a.retirement.excessHandling.verified) seen.add(`${id}-excess`);
  }
  return seen.size;
}

export function buildAlerts(s: PlanState, plan: PlanResult, mc: MCResult | null): Alert[] {
  const p = s.profile;
  const out: Alert[] = [];
  const first = plan.rows[0];
  const add = (a: Alert) => out.push(a);

  if (mc) {
    if (mc.successProb < 0.7)
      add({ id: 'shortfall', level: 'warning', text: `PROJECTED SHORTFALL — P(SUCCESS) ${fmtPct(mc.successProb)}`, detail: `Target income is funded through age ${s.assumptions.planToAge} in ${fmtPct(mc.successProb)} of ${mc.nSims.toLocaleString()} simulations.` });
    else if (mc.successProb < 0.85)
      add({ id: 'shortfall', level: 'caution', text: `RETIREMENT MARGIN THIN — P(SUCCESS) ${fmtPct(mc.successProb)}`, detail: 'Below the 85% comfort threshold. Consider higher savings, a lower target, or a later landing.' });
  }
  if (plan.firstNegativeCash)
    add({ id: 'cashflow', level: 'warning', text: `CASH FLOW SHORTFALL — AGE ${plan.firstNegativeCash.age}`, detail: `Take-home does not cover expenses + debt service (loan term ${s.assumptions.debtTermYears} yrs). Consider an income-driven or extended repayment plan during time-building.` });

  const efMonths = p.monthlyExpenses > 0 ? p.cash / p.monthlyExpenses : 99;
  if (efMonths < plan.efMonths)
    add({ id: 'ef', level: efMonths < 1 ? 'warning' : 'caution', text: `EMERGENCY FUND ${efMonths.toFixed(1)} MO < ${plan.efMonths} MO TGT`, detail: `Target ${fmtK(plan.efMonths * p.monthlyExpenses)} (${plan.efMonths} months of expenses, from the Pilot Supplement).` });

  if (!p.lol) add({ id: 'lol', level: 'caution', text: 'NO LOSS-OF-LICENSE COVERAGE', detail: 'A medical certificate denial ends pilot income even when a general disability policy would not pay.' });
  if (!p.ltd) add({ id: 'ltd', level: 'caution', text: 'NO LONG-TERM DISABILITY COVERAGE', detail: 'Own-occupation LTD protects the largest asset: future pilot earnings.' });
  const dependents = p.marital === 'married' || p.kids.length > 0;
  if (dependents && first && p.lifeInsurance < 10 * first.gross)
    add({ id: 'life', level: 'caution', text: 'LIFE INSURANCE < 10× INCOME', detail: `${fmtK(p.lifeInsurance)} in force vs. ${fmtK(10 * first.gross)} rule of thumb with dependents.` });

  if (p.schoolDebt > 0 && first && p.schoolRate / 100 > first.expReturn)
    add({ id: 'debt', level: 'caution', text: `FLIGHT-SCHOOL LOAN ${p.schoolRate.toFixed(1)}% > EXP RETURN ${fmtPct(first.expReturn, 1)}`, detail: 'A guaranteed return from paying down the loan beats the expected portfolio return. Prioritize after the company match / emergency fund.' });

  if (plan.firstSpill) {
    const h = plan.firstSpill.excessHandling;
    const text = h === 'cash' ? '415(c) LIMIT — COMPANY $ SPILLS TO TAXABLE' : h === 'mbcb' ? '415(c) LIMIT — EXCESS TO CASH BALANCE PLAN' : '415(c) LIMIT — EXCESS FORFEITED';
    add({ id: '415c', level: 'caution', text, detail: `Binds from age ${plan.firstSpill.age} (${AIRLINES[plan.firstSpill.airline!].code}); with ${fmtPct(plan.firstSpill.companyPct)} company + max deferral the cap binds near ${fmtK(plan.bindPay415)} of pay (2026 $).` });
  }
  if (plan.firstBackdoor || plan.firstPartialRoth) {
    const r = plan.firstPartialRoth ?? plan.firstBackdoor!;
    add({ id: 'roth', level: 'caution', text: 'ROTH IRA INCOME PHASE-OUT — USE BACKDOOR', detail: `MAGI enters the ${p.marital === 'married' ? 'MFJ' : 'single'} phase-out (${fmtK(IRS_2026.rothPhaseOut[plan.status].start)}–${fmtK(IRS_2026.rothPhaseOut[plan.status].end)}, indexed) at age ${r.age}.` });
    if (p.pretaxIra > 0)
      add({ id: 'prorata', level: 'caution', text: 'PRO-RATA RULE — PRE-TAX IRA BALANCE', detail: `${fmtK(p.pretaxIra)} in pre-tax IRAs makes a backdoor Roth partly taxable. Consider rolling it into the 401(k).` });
  }
  const earning = plan.rows.find((r) => r.phase === 'regional' || r.phase === 'major') ?? plan.rows.find((r) => r.gross > 0);
  const shortfall = earning ? Math.max(0, Math.min(IRS_2026.electiveDeferral, earning.gross) - earning.employeeDeferral) : 0;
  if (shortfall > 1000)
    add({ id: 'deferral', level: 'advisory', text: '401(k) DEFERRAL BELOW IRS MAX', detail: `${fmtK(shortfall)} of ${earning?.year} deferral room unused at the current ${p.deferralPct}% election.` });

  const unalloc = plan.rows.slice(0, 10);
  const avgUnalloc = unalloc.reduce((a, r) => a + r.unallocated / r.index, 0) / Math.max(1, unalloc.length);
  if (avgUnalloc > 20_000)
    add({ id: 'unsaved', level: 'advisory', text: `UNSAVED CASH FLOW ≈${fmtK(avgUnalloc)}/YR`, detail: 'Average over the next 10 years (today’s $) after expenses and planned savings. Assumed spent; directing part of it to savings raises P(success).' });

  if (s.supplement.s2 === 2)
    add({ id: 'stock', level: 'caution', text: 'EMPLOYER STOCK / PROFIT-SHARING RELIANCE', detail: 'Income and investments tied to one airline compound career risk.' });

  const ids = new Set(plan.rows.map((r) => r.airline));
  if (ids.has('envoy'))
    add({ id: 'envoy', level: 'advisory', text: `ENVOY PREMIUM PAY ENDS ${fmtDate(AIRLINES.envoy.premium!.ends)}`, detail: '50% pilot supply premium is not projected after 2026.' });
  if (p.employer === 'fedex' && (p.stage === 'cargo_fo' || p.stage === 'cargo_ca'))
    add({ id: 'fdx', level: 'caution', text: 'FDX PENSION ELECTION APR–MAY 2027', detail: `${AIRLINES.fedex.retirement.pension!.electionWindow.value}. One-time, irrevocable: legacy pension vs. Market Based Cash Balance plan.` });
  for (const id of ids) {
    if (!id) continue;
    const a = AIRLINES[id];
    if (/^\d{4}/.test(a.amendable.value) && (a.kind === 'major' || a.kind === 'cargo'))
      add({ id: `amend-${id}`, level: 'advisory', text: `${a.code} CONTRACT AMENDABLE ${fmtDate(a.amendable.value)}`, detail: 'Pay beyond the contract term uses the pay-growth assumption.' });
  }
  if (plan.rows.some((r) => r.catchUpRoth))
    add({ id: 'rothcatch', level: 'advisory', text: 'AGE 50+ CATCH-UP MUST BE ROTH', detail: `Prior-year FICA wages above ${fmtK(IRS_2026.rothCatchUpWageThreshold)} (indexed) require catch-ups to be Roth.` });
  if (s.whatIf.retireAt60 || p.retireAge < 65)
    add({ id: 'early', level: 'advisory', text: `EARLY RETIREMENT — AGE ${plan.retireAge}`, detail: 'Social Security and pension timing assumptions matter more with an earlier landing.' });

  const unv = countUnverified(plan);
  if (unv > 0)
    add({ id: 'verify', level: 'advisory', text: `${unv} UNVERIFIED DATA POINTS IN USE`, detail: 'Interpolated or unconfirmed pay/benefit values. See amber VERIFY tags.', advisorOnly: true });

  return out.sort((a, b) => ORDER[a.level] - ORDER[b.level]);
}

export interface ActionItem { title: string; detail: string }

/** Top action items in order-of-operations priority. */
export function buildActions(s: PlanState, plan: PlanResult): ActionItem[] {
  const p = s.profile;
  const first = plan.rows[0];
  const items: ActionItem[] = [];
  const efTarget = plan.efMonths * p.monthlyExpenses;
  if (p.cash < efTarget) items.push({ title: `Build emergency fund to ${plan.efMonths} months (${fmtK(efTarget)})`, detail: `Currently ${fmtK(p.cash)}. Keep in high-yield savings / T-bills.` });
  if (p.schoolDebt > 0 && first && p.schoolRate / 100 > first.expReturn)
    items.push({ title: `Pay down the ${p.schoolRate}% flight-school loan aggressively`, detail: `Debt-free by age ${plan.debtFreeAge ?? '—'} on the base schedule; extra payments beat a ${fmtPct(first.expReturn, 1)} expected return.` });
  if (p.employer === 'fedex' && (p.stage === 'cargo_fo' || p.stage === 'cargo_ca'))
    items.push({ title: 'Model and make the FedEx pension election (Apr–May 30, 2027)', detail: 'Compare the legacy pension and the MBCB in the LANDING screen before the irrevocable deadline.' });
  if (!p.lol || !p.ltd) items.push({ title: `Add ${[!p.ltd && 'own-occupation disability', !p.lol && 'loss-of-license'].filter(Boolean).join(' + ')} coverage`, detail: 'Protects the pilot certificate — the engine of the whole plan.' });
  const earning = plan.rows.find((r) => r.phase === 'regional' || r.phase === 'major') ?? plan.rows.find((r) => r.gross > 0);
  if (earning && earning.employeeDeferral + 1000 < Math.min(IRS_2026.electiveDeferral, earning.gross))
    items.push(p.deferralPct > 0
      ? { title: `Step 401(k) deferral toward the ${fmtK(IRS_2026.electiveDeferral)} IRS max`, detail: `Raise ~2% per year or with each upgrade; currently ${p.deferralPct}% (${p.rothPct}% Roth).` }
      : { title: `Start 401(k) deferrals with the first airline paycheck (${earning!.year})`, detail: 'At least enough to get the full company match, then +2% per year or with each upgrade. Roth is attractive while income is low.' });
  if (p.hsaEligible) items.push({ title: 'Fund the HSA to the family/self limit', detail: 'Triple tax advantage; invest it rather than spending it.' });
  if (plan.firstBackdoor || plan.firstPartialRoth)
    items.push({ title: `Switch to a backdoor Roth from age ${(plan.firstPartialRoth ?? plan.firstBackdoor)!.age}`, detail: 'Non-deductible traditional IRA contribution, then convert. Watch the pro-rata rule.' });
  else if (p.rothIra) items.push({ title: 'Fund a Roth IRA every year', detail: `${fmtK(IRS_2026.ira)} limit in 2026; income is below the phase-out.` });
  else items.push({ title: 'Open a Roth IRA and fund it each year', detail: `Up to ${fmtK(IRS_2026.ira)}/yr (2026). Low-income years as a CFI/regional FO are the best years for Roth money.` });
  if (plan.firstSpill) items.push({ title: `Plan for §415(c) spillover from age ${plan.firstSpill.age}`, detail: 'Invest after-tax cash-in-lieu in a tax-efficient taxable account.' });
  items.push({ title: `Hold the ${plan.risk} / ${plan.horizon} model and follow the glide path`, detail: `Equity ${Math.round(plan.glide[0].equity)}% today → ${Math.round(plan.glide[plan.glide.length - 1].equity)}% at ${plan.retireAge}. Rebalance annually.` });
  return items;
}
