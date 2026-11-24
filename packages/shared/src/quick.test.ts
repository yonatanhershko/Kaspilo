import { describe, expect, it } from 'vitest';

import { pickQuickExpenses, quickWindow } from './quick';

const today = '2026-11-23';
const active = new Set(['coffee', 'food', 'fuel', 'a', 'b', 'c', 'd', 'e', 'f', 'g']);

function row(category_id: string, amount: number, date = today, extra: Partial<{ type: 'income' | 'expense'; recurring_rule_id: string | null; created_at: string }> = {}) {
  return { type: 'expense' as const, amount, date, category_id, recurring_rule_id: null, created_at: `${date}T10:00:00Z`, ...extra };
}

describe('quickWindow', () => {
  it('covers 60 days, today included', () => {
    expect(quickWindow(today)).toEqual({ start: '2026-09-25', end: today });
  });
});

describe('pickQuickExpenses', () => {
  it('needs a pair at least twice', () => {
    expect(pickQuickExpenses([row('coffee', 1800)], active, today)).toEqual([]);
    expect(pickQuickExpenses([row('coffee', 1800), row('coffee', 1800)], active, today)).toEqual([
      { category_id: 'coffee', amount: 1800 },
    ]);
  });

  it('a different amount is a different pair', () => {
    expect(pickQuickExpenses([row('coffee', 1800), row('coffee', 1600)], active, today)).toEqual([]);
  });

  it('orders by count, then by last use', () => {
    const rows = [
      row('food', 25000, '2026-11-01'),
      row('food', 25000, '2026-11-02'),
      row('coffee', 1800, '2026-11-20'),
      row('coffee', 1800, '2026-11-21'),
      row('coffee', 1800, '2026-11-22'),
      row('fuel', 20000, '2026-11-10'),
      row('fuel', 20000, '2026-11-15'),
    ];
    expect(pickQuickExpenses(rows, active, today).map((x) => x.category_id)).toEqual(['coffee', 'fuel', 'food']);
  });

  it('same day: the one added later wins the tie', () => {
    const rows = [
      row('food', 100, today, { created_at: '2026-11-23T09:00:00Z' }),
      row('food', 100, '2026-11-01'),
      row('fuel', 100, today, { created_at: '2026-11-23T12:00:00Z' }),
      row('fuel', 100, '2026-11-01'),
    ];
    expect(pickQuickExpenses(rows, active, today).map((x) => x.category_id)).toEqual(['fuel', 'food']);
  });

  it('skips income, rule rows, archived categories, old and future rows', () => {
    const rows = [
      row('coffee', 1, today, { type: 'income' }),
      row('coffee', 1, today, { type: 'income' }),
      row('food', 2, today, { recurring_rule_id: 'r' }),
      row('food', 2, today, { recurring_rule_id: 'r' }),
      row('gone', 3),
      row('gone', 3),
      row('fuel', 4, '2026-09-24'),
      row('fuel', 4, '2026-09-24'),
      row('fuel', 5, '2026-11-24'),
      row('fuel', 5, '2026-11-24'),
    ];
    expect(pickQuickExpenses(rows, active, today)).toEqual([]);
  });

  it('keeps at most 6', () => {
    const rows = ['a', 'b', 'c', 'd', 'e', 'f', 'g'].flatMap((c) => [row(c, 100), row(c, 100)]);
    expect(pickQuickExpenses(rows, active, today)).toHaveLength(6);
  });
});
