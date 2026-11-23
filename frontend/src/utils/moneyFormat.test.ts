import { describe, it, expect } from 'vitest';
import { formatMoney } from './moneyFormat';

describe('formatMoney', () => {
  it('adds thousands separators for amounts over 999', () => {
    expect(formatMoney(2490)).toBe('$2,490.00');
    expect(formatMoney(1000)).toBe('$1,000.00');
  });

  it('always shows exactly two decimal places', () => {
    expect(formatMoney(5)).toBe('$5.00');
    expect(formatMoney(5.5)).toBe('$5.50');
    expect(formatMoney(5.999)).toBe('$6.00');
  });

  it('formats zero and negative amounts', () => {
    expect(formatMoney(0)).toBe('$0.00');
    expect(formatMoney(-150)).toBe('-$150.00');
  });

  it('handles large amounts with multiple thousands separators', () => {
    expect(formatMoney(1234567.89)).toBe('$1,234,567.89');
  });
});
