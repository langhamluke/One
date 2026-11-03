/**
 * 4 (risk) x 3 (horizon) model portfolio matrix: equity percentage, plus the sleeve mix inside equity and fixed income.
 * Generic asset classes only (never tickers or fund brands).
 */
import type { Allocation, HorizonCategory, RiskCategory } from '../lib/types';

export const MODEL_EQUITY: Record<RiskCategory, Record<HorizonCategory, number>> = {
  Conservative: { 'Short-term': 0.22, Intermediate: 0.3, 'Long-term': 0.4 },
  Moderate: { 'Short-term': 0.35, Intermediate: 0.5, 'Long-term': 0.6 },
  Assertive: { 'Short-term': 0.5, Intermediate: 0.65, 'Long-term': 0.8 },
  Aggressive: { 'Short-term': 0.6, Intermediate: 0.8, 'Long-term': 0.95 },
};

/** Fractions of the EQUITY sleeve */
export const EQUITY_MIX = { uslc: 0.5, ussmid: 0.15, intl: 0.25, em: 0.1 } as const;
/** Fractions of the FIXED-INCOME sleeve */
export const FIXED_MIX = { bonds: 0.7, tips: 0.2, cash: 0.1 } as const;

/** Build a full allocation from an equity fraction, keeping sleeve proportions. */
export function allocationFromEquity(equity: number): Allocation {
  const e = Math.min(1, Math.max(0, equity));
  const f = 1 - e;
  const a: Allocation = {
    uslc: e * EQUITY_MIX.uslc,
    ussmid: e * EQUITY_MIX.ussmid,
    intl: e * EQUITY_MIX.intl,
    em: e * EQUITY_MIX.em,
    bonds: f * FIXED_MIX.bonds,
    tips: f * FIXED_MIX.tips,
    cash: f * FIXED_MIX.cash,
  };
  return a;
}

export function modelEquity(risk: RiskCategory, horizon: HorizonCategory): number {
  return MODEL_EQUITY[risk][horizon];
}
