import { describe, expect, it } from 'vitest';

import {
  amountToInput,
  budgetRemaining,
  formatAmount,
  formatMoney,
  parseAmount,
  percentOf,
  periodBalance,
  splitInstallments,
} from './money';

describe('parseAmount', () => {
  it('parses whole and decimal amounts into minor units', () => {
    expect(parseAmount('250')).toBe(25000);
    expect(parseAmount('12.5')).toBe(1250);
    expect(parseAmount('12.50')).toBe(1250);
    expect(parseAmount('0.01')).toBe(1);
    expect(parseAmount(' 1,234.56 ')).toBe(123456);
    expect(parseAmount('007')).toBe(700);
  });
  it('has no floating point drift', () => {
    expect(parseAmount('0.29')).toBe(29);
    expect(parseAmount('19.99')).toBe(1999);
    expect(parseAmount('1.15')).toBe(115);
    expect(parseAmount('999999999.99')).toBe(99999999999);
  });
  it('rejects bad input', () => {
    for (const bad of ['', '0', '0.00', '-5', '1.234', 'abc', '1e3', '12.', '.5', '1000000000', '1.2.3']) {
      expect(parseAmount(bad)).toBeNull();
    }
  });
});

describe('formatting', () => {
  it('formats with thousands and only needed decimals', () => {
    expect(formatAmount(185000)).toBe('1,850');
    expect(formatAmount(1250)).toBe('12.50');
    expect(formatAmount(1)).toBe('0.01');
    expect(formatAmount(0)).toBe('0');
    expect(formatAmount(-5000)).toBe('-50');
    expect(formatAmount(123456789)).toBe('1,234,567.89');
  });
  it('adds the currency sign without converting', () => {
    expect(formatMoney(185000, 'ILS')).toBe('₪ 1,850');
    expect(formatMoney(185000, 'USD')).toBe('$ 1,850');
    expect(formatMoney(900, 'EUR')).toBe('€ 9');
  });
  it('round-trips through input', () => {
    for (const minor of [1, 99, 100, 1250, 25000, 123456789]) {
      expect(parseAmount(amountToInput(minor))).toBe(minor);
    }
  });
});

describe('percentOf', () => {
  it('matches the reference screen', () => {
    expect(percentOf(60000, 185000)).toBe(32.4);
    expect(percentOf(42000, 185000)).toBe(22.7);
    expect(percentOf(35000, 185000)).toBe(18.9);
    expect(percentOf(48000, 185000)).toBe(25.9);
  });
  it('rounds half up and handles edges', () => {
    expect(percentOf(1, 2000)).toBe(0.1); // 0.05 -> 0.1
    expect(percentOf(1, 3)).toBe(33.3);
    expect(percentOf(2, 3)).toBe(66.7);
    expect(percentOf(5, 5)).toBe(100);
    expect(percentOf(0, 100)).toBe(0);
    expect(percentOf(10, 0)).toBe(0);
  });
});

describe('budgetRemaining', () => {
  it('is negative when over budget', () => {
    expect(budgetRemaining(150000, 60000)).toBe(90000);
    expect(budgetRemaining(30000, 35000)).toBe(-5000);
    expect(budgetRemaining(30000, 30000)).toBe(0);
  });
});

describe('splitInstallments', () => {
  it('always sums to the total, remainder on the first payment', () => {
    expect(splitInstallments(10000, 3)).toEqual([3334, 3333, 3333]);
    expect(splitInstallments(100, 3)).toEqual([34, 33, 33]);
    expect(splitInstallments(1200, 12)).toEqual(Array(12).fill(100));
    expect(splitInstallments(5, 1)).toEqual([5]);
    for (const [total, count] of [[99999, 7], [1, 5], [123456789, 36]]) {
      expect(splitInstallments(total, count).reduce((a, b) => a + b, 0)).toBe(total);
    }
  });
  it('rejects bad input', () => {
    expect(() => splitInstallments(0, 3)).toThrow();
    expect(() => splitInstallments(100, 0)).toThrow();
    expect(() => splitInstallments(10.5, 2)).toThrow();
  });
});

describe('periodBalance', () => {
  it('is income minus deposits minus expenses', () => {
    expect(periodBalance(800000, 50000, 400000)).toBe(350000);
  });
  it('can go negative', () => {
    expect(periodBalance(100, 0, 250)).toBe(-150);
  });
});
