/**
 * Quick expenses on home (docs/spec.md "Quick expenses"): the (category, amount) pairs
 * the user adds most, so one tap saves them again.
 */
import { subDays } from 'date-fns/subDays';

import type { Transaction } from './database.types';
import { fromISODate, type ISODate, type Period, toISODate } from './period';

export const QUICK_DAYS = 60;
export const QUICK_MIN_COUNT = 2;
export const QUICK_MAX = 6;

export type QuickExpense = { category_id: string; amount: number };

/** The last 60 days, today included. */
export function quickWindow(today: ISODate): Period {
  return { start: toISODate(subDays(fromISODate(today), QUICK_DAYS - 1)), end: today };
}

type Row = Pick<Transaction, 'type' | 'amount' | 'date' | 'category_id' | 'recurring_rule_id' | 'created_at'>;

/**
 * Most used pairs first; a tie goes to the one used last (date, then time added).
 * `activeCategories` holds the expense categories that are not archived.
 */
export function pickQuickExpenses(rows: Row[], activeCategories: Set<string>, today: ISODate): QuickExpense[] {
  const { start, end } = quickWindow(today);
  const pairs = new Map<string, { pair: QuickExpense; count: number; last: string }>();
  for (const row of rows) {
    if (row.type !== 'expense' || row.recurring_rule_id !== null) continue;
    if (row.date < start || row.date > end || !activeCategories.has(row.category_id)) continue;
    const key = `${row.category_id}:${row.amount}`;
    const last = `${row.date} ${row.created_at}`;
    const seen = pairs.get(key);
    if (seen) {
      seen.count += 1;
      if (last > seen.last) seen.last = last;
    } else {
      pairs.set(key, { pair: { category_id: row.category_id, amount: row.amount }, count: 1, last });
    }
  }
  return [...pairs.values()]
    .filter((x) => x.count >= QUICK_MIN_COUNT)
    .sort((a, b) => b.count - a.count || b.last.localeCompare(a.last))
    .slice(0, QUICK_MAX)
    .map((x) => x.pair);
}
