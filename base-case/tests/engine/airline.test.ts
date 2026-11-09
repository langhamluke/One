import { describe, expect, it } from 'vitest';
import { simulatePath } from '../../shared/lib/career';
import { FAA_RETIREMENT_AGE, simulateAirlinePath } from '../../shared/lib/airline';
import { computeDerived } from '../../shared/lib/engine';
import { runLedger } from '../../shared/lib/plan';
import { estimateSocialSecurity } from '../../shared/lib/ss';
import { emergencyMonths } from '../../shared/lib/scoring';
import { defaultAirlinePath, defaultPlanStateFor, type PlanState } from '../../shared/lib/inputs';
import { AIRLINES, AIRLINE_PATHS, bindingPay415c, contractMultiplier, milestonesFor, rateFor, resolveAirlines, scale } from '../../shared/data/airlines';
import { LIMITS_2026 } from '../../shared/data/irs2026';
import { PILOT_PERSONAS } from '../../shared/data/personasPilot';
import { sourced } from '../../shared/lib/types';
import { nonFinitePaths } from './fixtures';

/** Regional FO, 1 year in, Envoy → American, zero inflation so nominal = real. */
function pilotState(overrides: Partial<PlanState['profile']['pilot']> = {}): PlanState {
  const s = defaultPlanStateFor('flight-plan');
  s.profile.age = 27;
  s.profile.retirementAge = 65;
  s.assumptions.inflation = 0;
  s.assumptions.indexing = 0;
  s.profile.pilot = { stage: 'regional_fo', employer: 'envoy', hours: 1800, yearsAtEmployer: 1, creditHours: 80, domicile: 'DFW', ...overrides };
  s.careerPaths = [defaultAirlinePath('p1', 'envoy-aa', 'Envoy → American')];
  s.activePathId = 'p1';
  return s;
}

describe('airline data helpers', () => {
  it('interpolates missing pay-scale steps and flags them unverified', () => {
    const steps = scale({ 1: sourced(100, 'A', '2026-01', true), 12: sourced(210, 'A', '2026-01', true) }, 'X FO');
    expect(steps).toHaveLength(12);
    expect(steps[0].value).toBe(100);
    expect(steps[11].value).toBe(210);
    expect(steps[5].value).toBe(150);
    expect(steps[5].verified).toBe(false);
    expect(steps[5].source).toContain('Interpolated (X FO yr 1→12)');
    const flat = scale({ 1: sourced(45000, 'B', '2026-01', false) }, 'CFI');
    expect(flat[11].value).toBe(45000);
    expect(flat[11].source).toContain('Held flat');
  });

  it('applies dated contract raises first, then the growth assumption', () => {
    // Southwest: +4% in 2027, +3.25% in 2028, then growth
    const swa = AIRLINES.southwest;
    expect(contractMultiplier(swa, 2026, 0.03)).toBe(1);
    expect(contractMultiplier(swa, 2027, 0.03)).toBeCloseTo(1.04, 9);
    expect(contractMultiplier(swa, 2028, 0.03)).toBeCloseTo(1.04 * 1.0325, 9);
    expect(contractMultiplier(swa, 2029, 0.03)).toBeCloseTo(1.04 * 1.0325 * 1.03, 9);
    // American: +3% in 2027 then growth from 2028
    expect(contractMultiplier(AIRLINES.american, 2028, 0.02)).toBeCloseTo(1.03 * 1.02, 9);
    // No raises listed: growth from 2027
    expect(contractMultiplier(AIRLINES.regional, 2027, 0.03)).toBeCloseTo(1.03, 9);
  });

  it('clamps longevity to the 12-step scale and falls back to narrowbody when no widebody scale exists', () => {
    expect(rateFor(AIRLINES.american, 'CA', 'NB', 40).value).toBe(402.01);
    expect(rateFor(AIRLINES.american, 'FO', 'NB', 0).value).toBe(113);
    expect(rateFor(AIRLINES.southwest, 'CA', 'WB', 12).value).toBe(343.14);
    expect(rateFor(AIRLINES.american, 'CA', 'WB', 12).value).toBe(483.74);
  });

  it('resolves carriers from the pilot position', () => {
    expect(resolveAirlines('envoy-aa', 'cfi', 'none')).toEqual({ regional: 'envoy', major: 'american' });
    // a pilot already at a regional keeps it
    expect(resolveAirlines('envoy-aa', 'regional_fo', 'regional')).toEqual({ regional: 'regional', major: 'american' });
    // a pilot at a major stays there on every path
    expect(resolveAirlines('regional-swa', 'cargo_fo', 'fedex')).toEqual({ regional: null, major: 'fedex' });
    expect(resolveAirlines('stay', 'regional_ca', 'envoy')).toEqual({ regional: 'envoy', major: null });
    expect(resolveAirlines('stay', 'cfi', 'none')).toEqual({ regional: 'regional', major: null });
  });

  it('overlays milestone edits on the path defaults', () => {
    expect(milestonesFor('envoy-aa', {})).toEqual(AIRLINE_PATHS['envoy-aa'].defaults);
    expect(milestonesFor('envoy-aa', { toMajor: 2, widebody: -3 })).toMatchObject({ toMajor: 2, widebody: 0 });
  });

  it('computes the pay at which an 18% company contribution binds §415(c)', () => {
    const bind = bindingPay415c(0.18, LIMITS_2026.electiveDeferral.value, LIMITS_2026.annualAdditions415c.value);
    expect(bind).toBeCloseTo((72000 - 24500) / 0.18, 6); // ≈ $263,889
    expect(bindingPay415c(0, 24500, 72000)).toBe(Infinity);
  });
});

describe('airline career simulation', () => {
  it('pays rate × credit × 12 with the Envoy CA-rate rule from longevity year 2', () => {
    const s = pilotState();
    const sim = simulatePath(s, s.careerPaths[0], s.whatIf);
    expect(sim.airline).toMatchObject({ regional: 'envoy', major: 'american', retireAt: 65 });
    // year 0: longevity 2 at Envoy (1 year in), FO paid at the CA rate: 165/hr × 80 × 12
    expect(sim.rows[0].levelTitle).toBe('ENVOY FO @CA rate');
    expect(sim.rows[0].wages).toBeCloseTo(165 * 80 * 12, 6);
    expect(sim.rows[0].caRateAsFo).toBe(true);
    expect(sim.rows[0].employerPctOverride).toBeCloseTo(0.07, 9);
    expect(sim.rows[0].seat).toBe('FO');
    expect(sim.firstIncomeYearIndex).toBe(0);
  });

  it('upgrades, flows to the major with longevity reset, then captain and widebody per the milestones', () => {
    const s = pilotState();
    const sim = simulatePath(s, s.careerPaths[0], s.whatIf);
    // defaults: regionalCaUpgrade 2 -> CA at index 1 (regionalStart -1 + 2), toMajor 4 -> major at index 3, majorCaUpgrade 8 -> index 11, widebody 6 -> index 17
    expect(sim.rows[1].seat).toBe('CA');
    expect(sim.rows[1].airline).toBe('envoy');
    expect(sim.rows[3].airline).toBe('american');
    expect(sim.rows[3].longevity).toBe(1);
    expect(sim.rows[3].seat).toBe('FO');
    // AA yr-1 FO: $113 × 1.03 (2027 raise) × 1.03^2 growth (2028, 2029) ... year index 3 = 2029
    const mult = contractMultiplier(AIRLINES.american, 2029, 0.03);
    expect(sim.rows[3].wages).toBeCloseTo(113 * mult * 80 * 12, 6);
    expect(sim.rows[10].seat).toBe('FO');
    expect(sim.rows[11].seat).toBe('CA');
    expect(sim.rows[16].fleet).toBe('NB');
    expect(sim.rows[17].fleet).toBe('WB');
    const labels = sim.waypoints.map((w) => w.label);
    expect(labels).toEqual(expect.arrayContaining(['ENVOY FO', 'CA upgrade', 'Flow → AA', 'AA CA', 'Widebody']));
    expect(sim.rows[3].employerPctOverride).toBeCloseTo(0.18, 9);
    expect(sim.rows[3].excessHandling).toBe('mbcb');
  });

  it('delays both captain upgrades with upgradeDelayYears', () => {
    const s = pilotState();
    s.whatIf.upgradeDelayYears = 2;
    const sim = simulatePath(s, s.careerPaths[0], s.whatIf);
    expect(sim.rows[2].seat).toBe('FO');
    expect(sim.rows[3].airline).toBe('american'); // flow timing unchanged
    expect(sim.rows[12].seat).toBe('FO');
    expect(sim.rows[13].seat).toBe('CA');
  });

  it('inserts furlough years after joining the major and freezes seniority', () => {
    const s = pilotState();
    s.whatIf.furloughYears = 2;
    const sim = simulatePath(s, s.careerPaths[0], s.whatIf);
    expect(sim.rows[3].airline).toBe('american');
    expect(sim.rows[4].stage).toBe('gap');
    expect(sim.rows[4].wages).toBe(0);
    expect(sim.rows[5].stage).toBe('gap');
    expect(sim.rows[6].stage).toBe('working');
    expect(sim.rows[6].longevity).toBe(2); // resumes at the step after the one before the furlough
    expect(sim.rows[13].seat).toBe('CA'); // CA upgrade pushed by the two furlough years
    expect(sim.waypoints.some((w) => w.kind === 'gap' && w.label === 'Furlough')).toBe(true);
    expect(sim.waypoints.some((w) => w.label.startsWith('Recall'))).toBe(true);
  });

  it('starts students and CFIs on the time-building salary and ends airline pay at the FAA age limit', () => {
    const s = pilotState({ stage: 'cfi', employer: 'none', yearsAtEmployer: 0, hours: 600 });
    s.profile.age = 23;
    s.profile.retirementAge = 67;
    s.careerPaths[0].airline!.milestones = { toRegional: 2 };
    const sim = simulatePath(s, s.careerPaths[0], s.whatIf);
    expect(sim.rows[0].levelTitle).toBe('CFI');
    expect(sim.rows[0].wages).toBe(45000);
    expect(sim.rows[1].levelTitle).toBe('CFI');
    expect(sim.rows[2].airline).toBe('envoy');
    expect(sim.rows[2].longevity).toBe(1);
    expect(sim.rows[2].wages).toBeCloseTo(90 * contractMultiplier(AIRLINES.envoy, 2028, 0.03) * 80 * 12, 6);
    const last = sim.rows.filter((r) => r.stage !== 'retired').pop()!;
    expect(last.age).toBe(FAA_RETIREMENT_AGE - 1);
    expect(sim.flags).toContain('faa-age-65');
    expect(sim.airline?.retireAt).toBe(FAA_RETIREMENT_AGE);
    const student = pilotState({ stage: 'student', employer: 'none', yearsAtEmployer: 0 });
    const sim2 = simulatePath(student, student.careerPaths[0], student.whatIf);
    expect(sim2.rows[0].stage).toBe('pre-start');
    expect(sim2.rows[0].wages).toBe(0);
    expect(sim2.rows[1].levelTitle).toBe('CFI');
  });

  it('keeps a pilot already at a major on that carrier, honouring years at employer', () => {
    const s = pilotState({ stage: 'major_fo', employer: 'southwest', yearsAtEmployer: 5 });
    s.careerPaths[0].airline = { ...s.careerPaths[0].airline!, pathId: 'stay', milestones: {} };
    const sim = simulatePath(s, s.careerPaths[0], s.whatIf);
    expect(sim.rows[0].airline).toBe('southwest');
    expect(sim.rows[0].longevity).toBe(6);
    expect(sim.rows[0].seat).toBe('FO');
    // STAY_DEFAULTS majorCaUpgrade 8 from majorStart -5 -> index 3, but never before index 1
    expect(sim.rows[3].seat).toBe('CA');
    expect(sim.rows[0].mbcbCredit).toBeCloseTo(sim.rows[0].wages * 0.02, 6);
    expect(sim.waypoints[0].label).toBe('SWA FO');
  });

  it('models the FedEx legacy pension for pre-CBA hires and the MBCB for new hires', () => {
    const legacy = pilotState({ stage: 'cargo_fo', employer: 'fedex', yearsAtEmployer: 3 });
    legacy.profile.age = 34;
    legacy.careerPaths[0].airline = { ...legacy.careerPaths[0].airline!, pathId: 'stay', milestones: { majorCaUpgrade: 10 }, fedexOption: 'legacy' };
    const simL = simulateAirlinePath(legacy, legacy.careerPaths[0], legacy.whatIf);
    expect(simL.rows[0].airline).toBe('fedex');
    expect(simL.rows[0].mbcbCredit).toBeUndefined();
    const retiredL = simL.rows.find((r) => r.stage === 'retired')!;
    expect(retiredL.pensionIncome).toBeGreaterThan(0);
    expect(retiredL.pensionIncome).toBeLessThanOrEqual(169000 + 1e-6);
    expect(retiredL.yearsOfService).toBeGreaterThan(30);
    expect(simL.flags).toContain('fedex-pension');

    const mbcb = structuredClone(legacy);
    mbcb.careerPaths[0].airline!.fedexOption = 'mbcb';
    const simM = simulateAirlinePath(mbcb, mbcb.careerPaths[0], mbcb.whatIf);
    expect(simM.rows[0].mbcbCredit).toBeUndefined(); // 2026-2027 still on the pension
    expect(simM.rows[2].mbcbCredit).toBeCloseTo(simM.rows[2].wages * 0.09, 6); // 2028: 9%
    expect(simM.rows[3].mbcbCredit).toBeCloseTo(simM.rows[3].wages * 0.1, 6); // 2029+: 10%
    const retiredM = simM.rows.find((r) => r.stage === 'retired')!;
    expect(retiredM.pensionIncome).toBeLessThan(retiredL.pensionIncome); // service years stop accruing in 2028
    expect(retiredM.yearsOfService).toBe(3 + 2);

    const newHire = pilotState({ stage: 'regional_fo', employer: 'regional', yearsAtEmployer: 2 });
    newHire.careerPaths[0].airline = { ...newHire.careerPaths[0].airline!, pathId: 'regional-fdx', milestones: { toMajor: 1 } };
    const simN = simulateAirlinePath(newHire, newHire.careerPaths[0], newHire.whatIf);
    const fdxRow = simN.rows.find((r) => r.airline === 'fedex')!;
    expect(fdxRow.mbcbCredit).toBeGreaterThan(0);
    expect(simN.rows.find((r) => r.stage === 'retired')!.pensionIncome).toBe(0);
  });

  it('records every rate step, company contribution and raise in the data-quality ledger', () => {
    const s = pilotState();
    const sim = simulatePath(s, s.careerPaths[0], s.whatIf);
    const keys = sim.dataQuality.map((d) => d.key);
    expect(new Set(keys).size).toBe(keys.length);
    expect(keys).toContain('airline:p1:envoy:companyPct');
    expect(keys).toContain('airline:p1:american:excess');
    expect(keys).toContain('airline:p1:american:raise:2027-01-01');
    expect(keys.filter((k) => k.startsWith('rate:p1:american:FO:NB:')).length).toBeGreaterThanOrEqual(8);
    // interpolated AA FO steps are unverified; the published 12-year step is verified
    const yr5 = sim.dataQuality.find((d) => d.key === 'rate:p1:american:FO:NB:5')!;
    expect(yr5.verified).toBe(false);
    expect(yr5.source).toContain('Interpolated');
    const yr12 = sim.dataQuality.find((d) => d.key === 'rate:p1:american:CA:WB:12');
    expect(yr12?.verified).toBe(true);
  });
});

describe('airline ledger and engine', () => {
  it('uses the carrier contribution instead of the match and routes §415(c) excess per the contract', () => {
    const s = pilotState({ stage: 'major_ca', employer: 'american', yearsAtEmployer: 15 });
    s.profile.age = 50;
    s.savings.deferralPct = 0.2; // hits the deferral limit; 18% company on ~$386k pay binds §415(c)
    s.careerPaths[0].airline = { ...s.careerPaths[0].airline!, pathId: 'stay', milestones: { widebody: 0 } };
    const sim = simulatePath(s, s.careerPaths[0], s.whatIf);
    const ss = estimateSocialSecurity(s, sim.rows);
    const out = runLedger(s, sim, { modelEquity: 0.6, ss });
    const r0 = out.path.rows[0];
    expect(sim.rows[0].wages).toBeCloseTo(402.01 * 80 * 12, 6);
    expect(r0.employerLoanMatch401k).toBe(0);
    // employer trimmed to the cap: deferral 24,500 (+ catch-up outside the cap) leaves 47,500 of room
    expect(r0.employer401k).toBeCloseTo(72000 - 24500, 2);
    expect(r0.limits.s415cCapped).toBe(true);
    expect(out.usage.s415cSpill).toBeGreaterThan(0);
    expect(out.usage.s415cHandling).toBe('mbcb'); // American routes excess to the cash balance plan
    expect(r0.employerCashBalance).toBeGreaterThan(0);
    expect(r0.cashInLieu).toBe(0);
    expect(r0.employerCashBalance).toBeCloseTo(0.18 * Math.min(sim.rows[0].wages, 360000) - (72000 - 24500), 2);

    const cash = structuredClone(s);
    cash.careerPaths[0].airline!.excessHandlingOverride = 'cash';
    const simC = simulatePath(cash, cash.careerPaths[0], cash.whatIf);
    const outC = runLedger(cash, simC, { modelEquity: 0.6, ss });
    const c0 = outC.path.rows[0];
    expect(c0.cashInLieu).toBeCloseTo(r0.employerCashBalance, 2);
    expect(c0.employerCashBalance).toBe(0);
    expect(c0.grossIncome).toBeGreaterThan(r0.grossIncome);
    expect(c0.fica).toBeGreaterThan(r0.fica);
    expect(outC.usage.s415cHandling).toBe('cash');

    const forfeit = structuredClone(s);
    forfeit.careerPaths[0].airline!.excessHandlingOverride = 'forfeit';
    const outF = runLedger(forfeit, simulatePath(forfeit, forfeit.careerPaths[0], forfeit.whatIf), { modelEquity: 0.6, ss });
    expect(outF.path.rows[0].cashInLieu).toBe(0);
    expect(outF.path.rows[0].employerCashBalance).toBe(0);
    expect(outF.usage.s415cHandling).toBe('forfeit');
  });

  it('runs the whole engine on a pilot plan with pilot alerts and finite numbers', () => {
    const s = pilotState();
    s.insurance.lossOfLicense = false;
    s.supplement = { s1: 2, s2: 2, s3: 0, s4: 0 };
    const d = computeDerived(s, { sims: 200 });
    expect(nonFinitePaths(d)).toEqual([]);
    expect(d.alerts.find((a) => a.id === 'engine-error')).toBeUndefined();
    const ids = d.alerts.map((a) => a.id);
    expect(ids).toContain('loss-of-license');
    expect(ids).toContain('employer-stock');
    expect(ids).toContain('envoy-premium');
    expect(ids).toContain('amendable-american');
    expect(d.actions.some((a) => a.id === 'action-insurance-pilot')).toBe(true);
    expect(d.mc.retirementAge).toBe(65);
    expect(d.active.waypoints.some((w) => w.label === 'Flow → AA')).toBe(true);
    expect(d.dataQuality.items.some((i) => i.key.startsWith('rate:p1:envoy'))).toBe(true);
    expect(d.dataQuality.unverifiedCount).toBeGreaterThan(0);
    // single income + regional (early career) + high exposure -> 12 months
    expect(emergencyMonths(s)).toMatchObject({ months: 12, rule: 'single-early-exposed' });
    expect(d.emergency.monthsTarget).toBe(12);
  });

  it('flags a retirement age above 65 and a FedEx election for current FedEx pilots', () => {
    const s = pilotState({ stage: 'cargo_fo', employer: 'fedex', yearsAtEmployer: 3 });
    s.profile.retirementAge = 67;
    s.careerPaths[0].airline = { ...s.careerPaths[0].airline!, pathId: 'stay', milestones: {} };
    const d = computeDerived(s, { sims: 100 });
    const ids = d.alerts.map((a) => a.id);
    expect(ids).toContain('faa-65');
    expect(ids).toContain('fedex-election');
    expect(d.actions.some((a) => a.id === 'action-fedex-election')).toBe(true);
    expect(d.mc.retirementAge).toBe(67); // the plan's retirement age; airline pay stops at 65 inside the rows
    expect(d.active.rows.find((r) => r.age === 65)?.stage).toBe('retired');
  });

  it('every pilot persona computes with finite outputs and a pilot profile', () => {
    for (const p of PILOT_PERSONAS) {
      const d = computeDerived(p.state, { sims: 150 });
      expect(nonFinitePaths(d), p.key).toEqual([]);
      expect(d.alerts.find((a) => a.id === 'engine-error'), p.key).toBeUndefined();
      expect(p.state.product).toBe('flight-plan');
      expect(p.state.profile.pilot, p.key).toBeDefined();
      expect(p.state.careerPaths.every((c) => c.kind === 'airline'), p.key).toBe(true);
      expect(d.mc.retirementAge, p.key).toBeLessThanOrEqual(65);
      expect(d.active.firstIncomeYearIndex, p.key).toBeGreaterThanOrEqual(0);
      expect(d.headline.year1TakeHome, p.key).toBeGreaterThanOrEqual(0);
    }
    const dale = PILOT_PERSONAS.find((p) => p.key === 'senior-captain')!;
    const d = computeDerived(dale.state, { sims: 150 });
    expect(d.mc.retirementAge).toBe(60);
    expect(d.alerts.some((a) => a.id === 'early-retirement')).toBe(true);
    const morgan = PILOT_PERSONAS.find((p) => p.key === 'cargo-fo')!;
    const dm = computeDerived(morgan.state, { sims: 150 });
    expect(dm.alerts.some((a) => a.id === 'fedex-election')).toBe(true);
    expect(dm.paths).toHaveLength(2);
  });
});
