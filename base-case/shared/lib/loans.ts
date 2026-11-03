/**
 * Debt amortization engine: monthly steps aggregated to plan years.
 *
 * Payment rules per Debt
 *  - payment override wins everywhere; extraPayment is added to principal every month; graceMonths delay the start
 *    (interest accrues and capitalizes monthly during grace).
 *  - Level payment from termMonths; defaults: federal 'standard' 120, private student 120, auto 60, personal 36,
 *    medical 36, HELOC 240 (repayment phase), other 60. SBLOC: interest-only (demand loan, no maturity); principal falls
 *    only through extraPayment or a payment override. Credit cards: 3% of balance, $25 minimum, recomputed monthly.
 *  - 'tiered_standard': term from TIERED_STANDARD by originalBalance ?? balance (10/15/20/25 years).
 *  - 'rap': payment = max($10, tier% * AGI / 12 - $50 * dependents); the tier applies to the WHOLE AGI (cliffs).
 *    RAP is a per-BORROWER payment, so when several loans are on RAP the payment (and the $50 principal match) is
 *    prorated across them by outstanding balance.
 *    AGI is the plan year's gross wages minus pre-tax deductions (passed in by the ledger). Unpaid interest is waived
 *    (balance never grows); if principal paid < $50 the government adds up to $50 so principal falls by >= $50.
 *    Forgiveness after 360 payments (flagged advisory: tax treatment of RAP forgiveness).
 *  - 'ibr': payment = 10% * max(0, AGI - 1.5 * poverty guideline(household)) / 12, capped at the 10-year standard
 *    payment on the balance at entry; negative amortization allowed; forgiveness after 20 years (240 payments).
 *    (The 15%/25-year legacy terms apply to pre-2014 borrowers, which the Debt shape does not identify.)
 *  - 'custom': the given payment.
 *  - Employer loan repayment (benefits.employerLoanRepayment) is applied monthly to student loans (federal first) as
 *    principal; the §127 exclusion cap is handled by the ledger (excess is taxable).
 *  - Snowball: when a debt is paid off its payment stops, so the freed cash shows up in the ledger surplus, where the
 *    order of operations allocates it.
 */
import { IBR, RAP, TIERED_STANDARD } from '../data/loans';
import { INFLATION_DEFAULT } from '../data/cma';
import { CURRENT_YEAR, type Debt, type FederalPlan } from './inputs';

export interface LoanInput extends Debt {
  /** Plan-year index at which the debt comes into existence (e.g. a grad-school loan); default 0 */
  startYearIndex?: number;
}

/** Level monthly payment that amortizes `balance` at `annualRate` over `months`. */
export function levelPayment(balance: number, annualRate: number, months: number): number {
  const b = Math.max(0, balance);
  const n = Math.max(1, Math.round(months));
  if (b === 0) return 0;
  const r = Math.max(0, annualRate) / 12;
  if (r === 0) return b / n;
  return (b * r) / (1 - Math.pow(1 + r, -n));
}

/** Tiered Standard Plan term in months for the amount borrowed. */
export function tieredStandardTermMonths(borrowed: number): number {
  for (const t of TIERED_STANDARD.value) if (borrowed < t.borrowedUnder) return t.years * 12;
  return TIERED_STANDARD.value[TIERED_STANDARD.value.length - 1].years * 12;
}

/** RAP tier (fraction of AGI) for an AGI; the tier applies to the whole AGI. */
export function rapTierPct(agi: number): number {
  const a = Math.max(0, agi);
  for (const t of RAP.tiers.value) if (a <= t.agiUpTo) return t.pct;
  return RAP.tiers.value[RAP.tiers.value.length - 1].pct;
}

/** RAP monthly payment: max($10, tier% * AGI / 12 - $50 per dependent). */
export function rapMonthlyPayment(agi: number, dependents: number): number {
  const a = Math.max(0, agi);
  const raw = (rapTierPct(a) * a) / 12 - RAP.dependentReductionMonthly.value * Math.max(0, Math.floor(dependents));
  return Math.max(RAP.minimumMonthly.value, raw);
}

/** HHS poverty guideline for a household size, indexed by inflation after 2026. */
export function povertyGuideline(householdSize: number, year = CURRENT_YEAR, inflation = INFLATION_DEFAULT): number {
  const hh = Math.max(1, Math.floor(householdSize));
  const base = IBR.povertyGuideline2026.value + IBR.povertyPerAdditionalPerson2026.value * (hh - 1);
  const n = Math.max(0, Math.floor(year) - CURRENT_YEAR);
  return base * Math.pow(1 + inflation, n);
}

/** Amended IBR monthly payment (10% of discretionary income), optionally capped at the standard payment. */
export function ibrMonthlyPayment(
  agi: number,
  householdSize: number,
  year = CURRENT_YEAR,
  opts: { inflation?: number; standardCap?: number; legacyPre2014?: boolean } = {},
): number {
  const pct = opts.legacyPre2014 ? IBR.pctOld : IBR.pctNew;
  const disc = Math.max(0, agi - IBR.povertyMultiple * povertyGuideline(householdSize, year, opts.inflation ?? INFLATION_DEFAULT));
  const p = (pct * disc) / 12;
  return opts.standardCap !== undefined ? Math.min(p, opts.standardCap) : p;
}

/** Default amortization term when the debt has none. */
export function defaultTermMonths(d: Debt): number {
  if (d.termMonths && d.termMonths > 0) return Math.round(d.termMonths);
  switch (d.kind) {
    case 'federal_student':
      return d.federalPlan === 'tiered_standard' ? tieredStandardTermMonths(d.originalBalance ?? d.balance) : 120;
    case 'private_student':
      return 120;
    case 'auto':
      return 60;
    case 'personal':
      return 36;
    case 'medical':
      return 36;
    case 'heloc':
      return 240;
    default:
      return 60;
  }
}

export function effectivePlan(d: Debt): FederalPlan | 'amortizing' | 'card' | 'interest_only' {
  if (d.kind === 'credit_card') return 'card';
  if (d.kind === 'sbloc') return 'interest_only';
  if (d.kind !== 'federal_student') return 'amortizing';
  return d.federalPlan ?? 'standard';
}

/** Scheduled monthly payment a debt starts with (for action items / plan comparison); RAP/IBR need AGI. */
export function initialMonthlyPayment(d: Debt, ctx: { agi: number; dependents: number; householdSize: number }): number {
  if (d.payment !== undefined && d.payment > 0) return d.payment;
  const plan = effectivePlan(d);
  switch (plan) {
    case 'card':
      return Math.max(25, 0.03 * d.balance);
    case 'interest_only':
      return (d.balance * d.rate) / 12;
    case 'rap':
      return rapMonthlyPayment(ctx.agi, ctx.dependents);
    case 'ibr':
      return ibrMonthlyPayment(ctx.agi, ctx.householdSize, CURRENT_YEAR, { standardCap: levelPayment(d.balance, d.rate, 120) });
    case 'custom':
      return d.payment ?? levelPayment(d.balance, d.rate, 120);
    default:
      return levelPayment(d.balance, d.rate, defaultTermMonths(d));
  }
}

export function isStudentLoan(d: Debt): boolean {
  return d.kind === 'federal_student' || d.kind === 'private_student';
}

export interface LoanYearContext {
  yearIndex: number;
  year: number;
  /** Gross wages minus pre-tax deductions for the year */
  agi: number;
  dependents: number;
  householdSize: number;
  /** Employer student-loan repayment benefit for the year (applied to student loans) */
  employerLoanRepayment?: number;
  inflation?: number;
}

export interface DebtYearLine {
  id: string;
  name: string;
  kind: Debt['kind'];
  plan: ReturnType<typeof effectivePlan>;
  balance: number;
  /** Borrower payments this year (scheduled + extra) */
  paid: number;
  interest: number;
  forgiven: number;
  paidOffThisYear: boolean;
}

export interface YearDebtResult {
  /** Borrower cash out: scheduled payments + extra payments (employer repayments excluded) */
  debtService: number;
  /** Scheduled payments only */
  scheduled: number;
  extraPrincipal: number;
  interest: number;
  forgiven: number;
  principal: number;
  employerPaid: number;
  /** Payments on student loans that qualify for a SECURE 2.0 §110 match */
  studentLoanPayments: number;
  /** Principal reduction supplied by the RAP match */
  rapMatch: number;
  totalBalance: number;
  lines: DebtYearLine[];
  paidOff: string[];
  flags: string[];
}

interface DebtState {
  d: LoanInput;
  plan: ReturnType<typeof effectivePlan>;
  balance: number;
  r: number;
  graceLeft: number;
  started: boolean;
  payment: number;
  standardCap: number;
  paymentsMade: number;
  forgiveAfter: number;
  paidOff: boolean;
  interestTotal: number;
  forgivenTotal: number;
}

function num(x: number | undefined, d = 0): number {
  return x !== undefined && Number.isFinite(x) ? x : d;
}

/** Monthly-stepping multi-debt simulator. Construct once per ledger run and call stepYear for each plan year. */
export class LoanSimulator {
  private readonly states: DebtState[];
  readonly hasDebts: boolean;

  constructor(debts: LoanInput[]) {
    this.states = debts
      .filter((d) => num(d.balance) > 0)
      .map((d) => ({
        d,
        plan: effectivePlan(d),
        balance: num(d.balance),
        r: Math.max(0, num(d.rate)) / 12,
        graceLeft: Math.max(0, Math.floor(num(d.graceMonths))),
        started: false,
        payment: 0,
        standardCap: 0,
        paymentsMade: 0,
        forgiveAfter: 0,
        paidOff: false,
        interestTotal: 0,
        forgivenTotal: 0,
      }));
    // Employer repayments and reporting go federal first, then private, then everything else.
    this.states.sort((a, b) => rank(a.d) - rank(b.d));
    this.hasDebts = this.states.length > 0;
  }

  totalBalance(yearIndex = Infinity): number {
    let s = 0;
    for (const st of this.states) if ((st.d.startYearIndex ?? 0) <= yearIndex) s += st.balance;
    return s;
  }

  get totalInterest(): number {
    return this.states.reduce((s, st) => s + st.interestTotal, 0);
  }

  get forgivenTotal(): number {
    return this.states.reduce((s, st) => s + st.forgivenTotal, 0);
  }

  stepYear(ctx: LoanYearContext): YearDebtResult {
    const res: YearDebtResult = {
      debtService: 0,
      scheduled: 0,
      extraPrincipal: 0,
      interest: 0,
      forgiven: 0,
      principal: 0,
      employerPaid: 0,
      studentLoanPayments: 0,
      rapMatch: 0,
      totalBalance: 0,
      lines: [],
      paidOff: [],
      flags: [],
    };
    const perDebt = new Map<string, DebtYearLine>();
    for (const st of this.states) {
      perDebt.set(st.d.id, { id: st.d.id, name: st.d.name, kind: st.d.kind, plan: st.plan, balance: st.balance, paid: 0, interest: 0, forgiven: 0, paidOffThisYear: false });
    }
    const employerMonthly = Math.max(0, num(ctx.employerLoanRepayment)) / 12;
    const rapPayment = rapMonthlyPayment(ctx.agi, ctx.dependents);
    const active = this.states.filter((st) => (st.d.startYearIndex ?? 0) <= ctx.yearIndex && !st.paidOff);

    for (let m = 0; m < 12; m++) {
      let employerLeft = employerMonthly;
      const rapActive = active.filter((st) => st.plan === 'rap' && !st.paidOff && st.balance > 0 && st.graceLeft <= 0 && !(st.d.payment !== undefined && st.d.payment > 0));
      const rapBal = rapActive.reduce((s, st) => s + st.balance, 0);
      for (const st of active) {
        if (st.paidOff || st.balance <= 0) continue;
        const line = perDebt.get(st.d.id)!;
        const d = st.d;
        if (st.graceLeft > 0) {
          const interest = st.balance * st.r;
          st.balance += interest;
          st.interestTotal += interest;
          line.interest += interest;
          res.interest += interest;
          st.graceLeft--;
          continue;
        }
        if (!st.started) {
          st.started = true;
          const term = defaultTermMonths(d);
          st.payment = d.payment !== undefined && d.payment > 0 ? d.payment : levelPayment(st.balance, d.rate, term);
          st.standardCap = levelPayment(st.balance, d.rate, 120);
          if (st.plan === 'rap') st.forgiveAfter = RAP.forgivenessPayments.value;
          else if (st.plan === 'ibr') {
            st.forgiveAfter = IBR.forgivenessYearsNew * 12;
            if (!d.legacyBorrower) res.flags.push(`ibr-not-legacy:${d.id}`);
          }
        }
        const interest = st.balance * st.r;
        let scheduled: number;
        if (d.payment !== undefined && d.payment > 0) scheduled = d.payment;
        else if (st.plan === 'rap') scheduled = rapBal > 0 ? (rapPayment * st.balance) / rapBal : rapPayment;
        else if (st.plan === 'ibr') scheduled = ibrMonthlyPayment(ctx.agi, ctx.householdSize, ctx.year, { inflation: ctx.inflation, standardCap: st.standardCap });
        else if (st.plan === 'card') scheduled = Math.max(25, 0.03 * st.balance);
        else if (st.plan === 'interest_only') scheduled = interest;
        else scheduled = st.payment;
        scheduled = Math.max(0, Math.min(scheduled, st.balance + interest));

        let interestCounted: number;
        if (st.plan === 'rap') {
          const interestPaid = Math.min(scheduled, interest);
          const principal = scheduled - interestPaid;
          const matchCap = RAP.principalMatchMonthlyMax.value * (rapBal > 0 ? Math.min(1, st.balance / rapBal) : 1);
          const match = principal < matchCap ? Math.min(matchCap - principal, Math.max(0, st.balance - principal)) : 0;
          st.balance -= principal + match;
          res.rapMatch += match;
          res.principal += principal + match;
          interestCounted = interestPaid;
        } else if (st.plan === 'ibr') {
          const interestPaid = Math.min(scheduled, interest);
          const principal = scheduled - interestPaid;
          st.balance += interest - interestPaid - principal;
          res.principal += principal;
          interestCounted = interest;
        } else {
          st.balance = st.balance + interest - scheduled;
          res.principal += Math.max(0, scheduled - interest);
          interestCounted = interest;
        }
        st.interestTotal += interestCounted;
        line.interest += interestCounted;
        res.interest += interestCounted;
        res.scheduled += scheduled;
        line.paid += scheduled;
        let paidThisMonth = scheduled;

        const extra = Math.min(Math.max(0, num(d.extraPayment)), Math.max(0, st.balance));
        if (extra > 0) {
          st.balance -= extra;
          res.extraPrincipal += extra;
          res.principal += extra;
          line.paid += extra;
          paidThisMonth += extra;
        }
        if (employerLeft > 0 && isStudentLoan(d) && st.balance > 0) {
          const e = Math.min(employerLeft, st.balance);
          st.balance -= e;
          employerLeft -= e;
          res.employerPaid += e;
          res.principal += e;
        }
        if (isStudentLoan(d)) res.studentLoanPayments += paidThisMonth;
        res.debtService += paidThisMonth;
        st.paymentsMade++;

        if (st.forgiveAfter > 0 && st.paymentsMade >= st.forgiveAfter && st.balance > 0.005) {
          const f = st.balance;
          st.balance = 0;
          st.forgivenTotal += f;
          line.forgiven += f;
          res.forgiven += f;
          res.flags.push(`${st.plan}-forgiveness:${d.id}`);
        }
        if (st.balance <= 0.005) {
          st.balance = 0;
          st.paidOff = true;
          line.paidOffThisYear = true;
          res.paidOff.push(d.id);
        }
      }
    }
    for (const st of this.states) {
      const line = perDebt.get(st.d.id)!;
      line.balance = (st.d.startYearIndex ?? 0) <= ctx.yearIndex ? st.balance : 0;
      res.lines.push(line);
      res.totalBalance += line.balance;
    }
    return res;
  }
}

function rank(d: Debt): number {
  if (d.kind === 'federal_student') return 0;
  if (d.kind === 'private_student') return 1;
  return 2;
}

/** Pure convenience wrapper: run the simulator over a list of year contexts. */
export function simulateDebts(debts: LoanInput[], years: LoanYearContext[]): YearDebtResult[] {
  const sim = new LoanSimulator(debts);
  return years.map((y) => sim.stepYear(y));
}
