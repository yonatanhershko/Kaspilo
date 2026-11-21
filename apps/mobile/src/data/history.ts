import type { GoalDeposit, HistoryRow, Transaction } from '@kaspilo/shared';

import type { ListedTransaction } from './outbox';

/**
 * History in pages (docs/spec.md "Wallets": history list, upcoming, complete export).
 * The server merges transactions and goal deposits in `wallet_history`; the app keeps
 * the raw rows in the cache (plain JSON, so the offline cache can save them).
 */

/** Rows per page of the History list. */
export const HISTORY_PAGE = 50;
/** Rows per read when the app needs everything (export, upcoming). The server returns at most 1000 per read. */
export const HISTORY_BATCH = 1000;
/** Months of History the phone keeps for offline use (owner 2026-11-21). */
export const OFFLINE_HISTORY_MONTHS = 3;

/** Keyset cursor: the last row already loaded. null = start from the newest. */
export type HistoryCursor = { date: string; at: string; id: string } | null;

export const historyKeys = {
  all: (wallet: string) => ['history', wallet] as const,
  past: (wallet: string) => ['history', wallet, 'past'] as const,
  upcoming: (wallet: string) => ['history', wallet, 'upcoming'] as const,
};

export const cursorOf = (row: HistoryRow): HistoryCursor => ({ date: row.date, at: row.created_at, id: row.id });

export type HistoryEntry =
  | { kind: 'tx'; key: string; date: string; at: string; tx: ListedTransaction }
  | { kind: 'deposit'; key: string; date: string; at: string; d: GoalDeposit };

export function asTransaction(row: HistoryRow): Transaction {
  return {
    id: row.id,
    user_id: row.user_id,
    wallet_id: row.wallet_id,
    type: row.type ?? 'expense',
    amount: row.amount,
    description: row.description,
    date: row.date,
    category_id: row.category_id ?? '',
    recurring_rule_id: row.recurring_rule_id,
    created_at: row.created_at,
  };
}

export function asDeposit(row: HistoryRow): GoalDeposit {
  return {
    id: row.id,
    user_id: row.user_id,
    wallet_id: row.wallet_id,
    goal_id: row.goal_id ?? '',
    amount: row.amount,
    date: row.date,
    created_at: row.created_at,
  };
}

/** A transaction as a history row, for putting a just-sent one into the cached list. */
export function rowOf(tx: Transaction): HistoryRow {
  return {
    kind: 'tx',
    id: tx.id,
    date: tx.date,
    created_at: tx.created_at,
    type: tx.type,
    amount: tx.amount,
    description: tx.description,
    category_id: tx.category_id,
    recurring_rule_id: tx.recurring_rule_id,
    goal_id: null,
    wallet_id: tx.wallet_id,
    user_id: tx.user_id,
  };
}

export const txEntry = (tx: ListedTransaction): HistoryEntry => ({
  kind: 'tx',
  key: `t-${tx.id}`,
  date: tx.date,
  at: tx.created_at,
  tx,
});

export function entryOf(row: HistoryRow): HistoryEntry {
  if (row.kind === 'tx') return txEntry(asTransaction(row));
  return { kind: 'deposit', key: `d-${row.id}`, date: row.date, at: row.created_at, d: asDeposit(row) };
}

/** Newest first, the same order as the server. */
export const newestFirst = (a: HistoryEntry, b: HistoryEntry) =>
  a.date === b.date ? b.at.localeCompare(a.at) : b.date.localeCompare(a.date);

/** Split rows into list pages, with the cursor each page was read from. */
export function toPages(rows: HistoryRow[]): { pages: HistoryRow[][]; pageParams: HistoryCursor[] } {
  const pages: HistoryRow[][] = [];
  for (let i = 0; i < rows.length; i += HISTORY_PAGE) pages.push(rows.slice(i, i + HISTORY_PAGE));
  if (pages.length === 0) pages.push([]);
  const pageParams = pages.map((_, i) => (i === 0 ? null : cursorOf(pages[i - 1][pages[i - 1].length - 1])));
  return { pages, pageParams };
}
