import { findSecurity } from './securities';
import { uid, today, useStore } from '../store';
import type { Holding } from '../lib/types';

export function holdingFrom(symbol: string, value: number): Holding {
  const s = findSecurity(symbol)!;
  return { id: uid(), symbol: s.symbol, name: s.name, kind: s.kind, value, exposure: s.exposure, sectors: s.sectors, expenseRatio: s.expenseRatio };
}

/** A realistic first-year college student, with a few common mistakes to learn from. */
export function loadSampleData() {
  const s = useStore.getState();
  s.setHoldings([
    holdingFrom('VOO', 800),
    holdingFrom('AAPL', 600),
    holdingFrom('NVDA', 450),
    holdingFrom('TSLA', 300),
    holdingFrom('BTC', 250),
    holdingFrom('CASH', 150),
  ]);
  useStore.setState({
    income: 1200,
    budget: [
      { id: uid(), label: 'Rent / housing', amount: 450, type: 'need', category: 'Housing' },
      { id: uid(), label: 'Groceries', amount: 180, type: 'need', category: 'Food' },
      { id: uid(), label: 'Phone bill', amount: 45, type: 'need', category: 'Bills' },
      { id: uid(), label: 'Eating out & coffee', amount: 190, type: 'want', category: 'Food' },
      { id: uid(), label: 'Streaming & subscriptions', amount: 38, type: 'want', category: 'Subscriptions' },
      { id: uid(), label: 'Going out & events', amount: 120, type: 'want', category: 'Fun' },
      { id: uid(), label: 'Emergency fund', amount: 75, type: 'save', category: 'Savings' },
      { id: uid(), label: 'Investing', amount: 50, type: 'save', category: 'Investing' },
    ],
    goals: [
      { id: 'g-emergency', name: 'Emergency fund', target: 1000, saved: 320, deadline: '' },
      { id: 'g-trip', name: 'Spring break trip', target: 600, saved: 150, deadline: nextMarch() },
    ],
    deposits: [{ id: uid(), goalId: 'g-emergency', amount: 20, date: today() }],
    cards: [{ id: uid(), name: 'Student card', balance: 420, limit: 1500, apr: 0.2399 }],
    credit: { hasCredit: true, missedPayments: 0, oldestAccountYears: 1, hardInquiries: 1, accountTypes: 1 },
  });
}

function nextMarch() {
  const d = new Date();
  const year = d.getMonth() >= 2 ? d.getFullYear() + 1 : d.getFullYear();
  return `${year}-03-15`;
}
