import { describe, expect, it } from 'vitest';
import { checkInDue, checkInWeeks, daysBetween, freshStart, futureSelf, monthlyAmount } from './habits';

describe('habits', () => {
  it('converts plan frequency to a monthly amount', () => {
    expect(monthlyAmount({ amount: 12, frequency: 'monthly' })).toBe(12);
    expect(monthlyAmount({ amount: 12, frequency: 'weekly' })).toBeCloseTo(52);
    expect(monthlyAmount({ amount: 12, frequency: 'biweekly' })).toBeCloseTo(26);
  });

  it('knows when a weekly check-in is due', () => {
    expect(daysBetween('2026-09-24', '2026-10-01')).toBe(7);
    expect(checkInDue([], '2026-10-01')).toBe(true);
    expect(checkInDue(['2026-09-28'], '2026-10-01')).toBe(false);
    expect(checkInDue(['2026-09-20', '2026-09-24'], '2026-10-01')).toBe(true);
  });

  it('counts consecutive check-in weeks', () => {
    expect(checkInWeeks(['2026-10-01', '2026-09-25', '2026-09-18'], '2026-10-01')).toBe(3);
    expect(checkInWeeks(['2026-10-01', '2026-09-10'], '2026-10-01')).toBe(1);
    expect(checkInWeeks([], '2026-10-01')).toBe(0);
  });

  it('finds fresh-start moments', () => {
    expect(freshStart(new Date(2027, 0, 2))?.id).toBe('newyear-2027');
    expect(freshStart(new Date(2026, 7, 25))?.title).toMatch(/semester/);
    expect(freshStart(new Date(2026, 5, 3))?.title).toMatch(/Summer/);
    expect(freshStart(new Date(2026, 9, 1))?.id).toBe('month-2026-9');
    expect(freshStart(new Date(2026, 9, 20))).toBeNull();
  });

  it('shows that starting now beats waiting five years', () => {
    const f = futureSelf({ current: 500, monthly: 100, age: 18, targetAge: 30, rate: 0.06 });
    expect(f.years).toBe(12);
    expect(f.contributed).toBe(500 + 100 * 144);
    expect(f.now).toBeGreaterThan(f.contributed);
    expect(f.costOfWaiting).toBeGreaterThan(5 * 12 * 100);
  });
});
