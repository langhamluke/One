/**
 * Zod schema mirroring shared/lib/inputs.ts (coarse but strict on types), followed by mergePlanState.
 * Limits: finite numbers within +/-1e9, strings <= 2,000 chars, arrays <= 50 items, nesting <= 16 levels.
 */
import { z } from 'zod';
import { mergePlanState, type PlanState } from '../../shared/lib/inputs';
import { badRequest } from '../errors';

export const NUM_LIMIT = 1e9;
export const STR_LIMIT = 2000;
export const ARR_LIMIT = 50;
export const MAX_DEPTH = 16;

const num = z.number().finite().min(-NUM_LIMIT).max(NUM_LIMIT);
const optNum = num.optional();
const str = z.string().max(STR_LIMIT);
const shortStr = z.string().max(120);
const bool = z.boolean();
const nullableNum = num.nullable();
const numRecord = z.record(shortStr, nullableNum).refine((r) => Object.keys(r).length <= ARR_LIMIT, 'too many keys');

const profile = z
  .object({
    nickname: str,
    age: num,
    retirementAge: num,
    filingStatus: z.enum(['single', 'mfj', 'hoh']),
    stateCode: shortStr,
    customStateRate: optNum,
    metro: shortStr,
    dependents: num,
    spouseIncome: num,
    livingExpenses: num,
    housingCost: num,
    graduationYear: num,
    degree: z.enum(['associate', 'bachelor', 'master', 'professional', 'doctoral', 'trade', 'none']),
    fieldOfStudy: str.optional(),
  })
  .passthrough();

const balanceSheet = z.object({ cash: num, taxable: num, preTax: num, roth: num, hsa: num, otherAssets: num }).passthrough();

const debt = z
  .object({
    id: shortStr,
    name: str,
    kind: z.enum(['federal_student', 'private_student', 'credit_card', 'auto', 'personal', 'medical', 'other']),
    balance: num,
    rate: num,
    termMonths: optNum,
    payment: optNum,
    extraPayment: optNum,
    federalPlan: z.enum(['standard', 'tiered_standard', 'rap', 'ibr', 'custom']).optional(),
    legacyBorrower: bool.optional(),
    originalBalance: optNum,
    graceMonths: optNum,
  })
  .passthrough();

const pension = z
  .object({ enabled: bool, multiplier: num, employeeContribPct: num, vestingYears: num, normalRetirementAge: num, coveredBySocialSecurity: bool })
  .passthrough();
const equityComp = z.object({ annualRsuValue: num, esppDiscount: num, esppContribPct: num }).passthrough();
const benefits = z
  .object({
    matchRate: num,
    matchCapPct: num,
    nonElectivePct: num,
    hsaEligible: bool,
    employerHsaContribution: num,
    studentLoanMatch: bool,
    employerLoanRepayment: num,
    pension,
    equityComp,
    disabilityCoverage: bool,
    lifeCoverageMultiple: num,
  })
  .passthrough();

const savings = z
  .object({
    deferralPct: num,
    deferralType: z.enum(['pretax', 'roth', 'split']),
    rothSplit: num,
    hsaContribution: num,
    iraContribution: num,
    iraType: z.enum(['roth', 'traditional']),
    taxableContribution: num,
    emergencyFundMonthsOverride: optNum,
  })
  .passthrough();

const goal = z
  .object({
    id: shortStr,
    name: str,
    kind: z.enum(['home', 'car', 'wedding', 'gradschool', 'travel', 'other']),
    targetAmount: num,
    targetYear: num,
    priority: num,
    fundedSoFar: num,
    home: z
      .object({ price: num, downPct: num, mortgageRate: num, termYears: num, propertyTaxPct: num, maintenancePct: num })
      .passthrough()
      .optional(),
  })
  .passthrough();

const insurance = z
  .object({ disability: bool, life: bool, health: z.enum(['employer', 'parent', 'marketplace', 'none']), renters: bool })
  .passthrough();

const sourcedBand = z
  .object({
    value: z.object({ p10: num, p25: num, p50: num, p75: num, p90: num }).passthrough(),
    source: str,
    url: str.optional(),
    asOf: shortStr,
    verified: bool,
    note: str.optional(),
  })
  .passthrough();
const ladderLevel = z.object({ title: str, years: num, band: sourcedBand, bonusPct: num }).passthrough();

const careerPath = z
  .object({
    id: shortStr,
    name: str,
    occupationCode: shortStr,
    metro: shortStr,
    track: z.enum(['low', 'mid', 'high']),
    startLevelIndex: num,
    yearsOverrides: z.record(shortStr, num).refine((r) => Object.keys(r).length <= ARR_LIMIT, 'too many keys'),
    customLevels: z.array(ladderLevel).max(ARR_LIMIT).optional(),
    meritRaise: num,
    bonusPctOverride: optNum,
    startYearOffset: num,
    preStartIncome: num,
    industryDrift: num,
  })
  .passthrough();

const gradSchool = z
  .object({
    enabled: bool,
    startYearOffset: num,
    years: num,
    annualCost: num,
    financedPct: num,
    loanRate: num,
    incomeDuring: num,
    postOccupationCode: shortStr.optional(),
    postLevelIndex: num,
    postPremium: num,
  })
  .passthrough();

const whatIf = z
  .object({
    promotionDelayYears: num,
    layoffGapMonths: num,
    layoffYearOffset: num,
    gradSchool,
    extraSavingsRatePct: num,
    retireAtOverride: optNum,
    spendingCut: num,
  })
  .passthrough();

const cmaEntry = z.object({ ret: num, vol: num }).passthrough();
const assumptions = z
  .object({
    inflation: num,
    cma: z.object({ uslc: cmaEntry, ussmid: cmaEntry, intl: cmaEntry, em: cmaEntry, bonds: cmaEntry, tips: cmaEntry, cash: cmaEntry }).passthrough(),
    glideYears: num,
    landingEquity: num,
    equityOverride: optNum,
    mcSims: num,
    seed: num,
    incomeReplacement: num,
    retirementSpendingOverride: optNum,
    ssClaimAge: num,
    ssOverrideAnnual: optNum,
    ssHaircut: num,
    taxGrossUp: num,
    lifeExpectancy: num,
    emergencyMonthsDefault: num,
    cashYield: num,
    lifestyleCreep: num,
    indexing: optNum,
  })
  .passthrough();

/** Full PlanState (every field required, matching the shape produced by mergePlanState). */
export const planStateSchema = z
  .object({
    version: num,
    profile,
    balanceSheet,
    debts: z.array(debt).max(ARR_LIMIT),
    benefits,
    savings,
    goals: z.array(goal).max(ARR_LIMIT),
    insurance,
    answers: numRecord,
    portfolioAmount: num,
    supplement: numRecord,
    careerPaths: z.array(careerPath).min(1).max(ARR_LIMIT),
    activePathId: shortStr,
    whatIf,
    assumptions,
    notes: str,
  })
  .passthrough();

/** Partial PlanState accepted on input (any depth): missing fields are filled from defaults by mergePlanState. */
export const planStateInputSchema = planStateSchema.deepPartial();

/** Generic size/type limits applied to the whole JSON tree (covers passthrough keys). */
export function deepCheckLimits(value: unknown, path = '$', depth = 0): string | null {
  if (depth > MAX_DEPTH) return `${path}: nesting too deep`;
  if (typeof value === 'number') {
    if (!Number.isFinite(value)) return `${path}: number must be finite`;
    if (Math.abs(value) > NUM_LIMIT) return `${path}: number out of range`;
    return null;
  }
  if (typeof value === 'string') return value.length > STR_LIMIT ? `${path}: string too long` : null;
  if (value === null || typeof value === 'boolean' || value === undefined) return null;
  if (Array.isArray(value)) {
    if (value.length > ARR_LIMIT) return `${path}: array too long (max ${ARR_LIMIT})`;
    for (let i = 0; i < value.length; i++) {
      const e = deepCheckLimits(value[i], `${path}[${i}]`, depth + 1);
      if (e) return e;
    }
    return null;
  }
  if (typeof value === 'object') {
    const keys = Object.keys(value as object);
    if (keys.length > 200) return `${path}: too many keys`;
    for (const k of keys) {
      if (k.length > 120) return `${path}: key too long`;
      if (k === '__proto__' || k === 'constructor' || k === 'prototype') return `${path}: forbidden key`;
      const e = deepCheckLimits((value as Record<string, unknown>)[k], `${path}.${k}`, depth + 1);
      if (e) return e;
    }
    return null;
  }
  return `${path}: unsupported value`;
}

/** Validate an incoming plan state (partial or full), returning a fully hydrated PlanState. Throws HttpError(400). */
export function validatePlanState(input: unknown): PlanState {
  if (typeof input !== 'object' || input === null || Array.isArray(input)) throw badRequest('Plan state must be an object', 'invalid_plan');
  const limitErr = deepCheckLimits(input);
  if (limitErr) throw badRequest(`Invalid plan state: ${limitErr}`, 'invalid_plan');
  const parsed = planStateInputSchema.safeParse(input);
  if (!parsed.success) {
    const issue = parsed.error.issues[0];
    const where = issue?.path?.length ? issue.path.join('.') : 'root';
    throw badRequest(`Invalid plan state at ${where}: ${issue?.message ?? 'invalid'}`, 'invalid_plan');
  }
  let merged: PlanState;
  try {
    merged = mergePlanState(parsed.data);
  } catch {
    throw badRequest('Invalid plan state: could not merge with defaults', 'invalid_plan');
  }
  const full = planStateSchema.safeParse(merged);
  if (!full.success) {
    const issue = full.error.issues[0];
    const where = issue?.path?.length ? issue.path.join('.') : 'root';
    throw badRequest(`Invalid plan state at ${where}: ${issue?.message ?? 'invalid'}`, 'invalid_plan');
  }
  return merged;
}
