import AsyncStorage from '@react-native-async-storage/async-storage';
import type { CategoryTotal, HistoryRow, Transaction, TransactionType } from '@kaspilo/shared';
import { todayISO } from '@kaspilo/shared';
import { type InfiniteData, notifyManager, type QueryClient } from '@tanstack/react-query';
import { useSyncExternalStore } from 'react';

import { isTransient } from '@/lib/network';
import { outboxKey } from '@/lib/offlineCache';
import { supabase } from '@/lib/supabase';

import { historyKeys, rowOf } from './history';

/**
 * Transactions added without internet, kept on the phone until the server has them
 * (docs/spec.md "Offline"). Each one carries its own id (made on the phone, so a
 * second send never makes a second row) and the wallet it was added to.
 *   queued   - waiting to be sent; counted in totals and lists, tagged "not synced"
 *   rejected - the server refused it; not counted, the user retries or deletes it
 */
export type QueuedTransaction = {
  id: string;
  wallet_id: string;
  type: TransactionType;
  amount: number;
  description: string;
  date: string;
  category_id: string;
  created_at: string;
  state: 'queued' | 'rejected';
};

/** A transaction as lists show it: from the server, or still on the phone. */
export type ListedTransaction = Transaction & { sync?: QueuedTransaction['state'] };

let owner: string | null = null;
let items: QueuedTransaction[] = [];
const listeners = new Set<() => void>();
let sending: Promise<void> | null = null;

function set(next: QueuedTransaction[]) {
  items = next;
  listeners.forEach((l) => l());
  if (owner) void AsyncStorage.setItem(outboxKey(owner), JSON.stringify(next)).catch(() => undefined);
}

/** Load the signed-in user's queue from the phone. */
export async function openOutbox(userId: string) {
  if (owner === userId) return;
  owner = userId;
  let saved: QueuedTransaction[] = [];
  try {
    const raw = await AsyncStorage.getItem(outboxKey(userId));
    saved = raw ? (JSON.parse(raw) as QueuedTransaction[]) : [];
  } catch {
    saved = [];
  }
  if (owner !== userId) return;
  items = saved;
  listeners.forEach((l) => l());
}

/** Forget the queue in memory (sign out). The stored copy is removed by clearOfflineData. */
export function resetOutbox() {
  owner = null;
  items = [];
  listeners.forEach((l) => l());
}

export function enqueue(tx: Omit<QueuedTransaction, 'state' | 'created_at'>) {
  set([...items, { ...tx, created_at: new Date().toISOString(), state: 'queued' }]);
}

/** Drop one from the phone (never sent, or refused). */
export function removeQueued(id: string) {
  set(items.filter((x) => x.id !== id));
}

export function retryQueued(id: string) {
  set(items.map((x) => (x.id === id ? { ...x, state: 'queued' as const } : x)));
}

function subscribe(listener: () => void) {
  listeners.add(listener);
  return () => listeners.delete(listener);
}

export function useOutbox(): QueuedTransaction[] {
  return useSyncExternalStore(subscribe, () => items);
}

export function asListed(tx: QueuedTransaction): ListedTransaction {
  const { state, ...row } = tx;
  return { ...row, user_id: owner ?? '', recurring_rule_id: null, sync: state };
}

/**
 * Send every queued transaction, oldest first. Stops at the first one that fails
 * for a passing reason (no connection) and tries again later; one the server
 * refuses is marked rejected and the rest go on. One run at a time.
 */
export function flushOutbox(client: QueryClient): Promise<void> {
  sending ??= (async () => {
    try {
      // Also picks up ones added while sending.
      const tried = new Set<string>();
      for (;;) {
        const tx = items.find((x) => x.state === 'queued' && !tried.has(x.id));
        if (!tx) return;
        tried.add(tx.id);
        const { state: _state, created_at: _created, ...row } = tx;
        const result = await supabase
          .from('transactions')
          .upsert(row, { onConflict: 'id', ignoreDuplicates: true });
        if (!result.error) {
          handOver(client, tx);
          continue;
        }
        if (isTransient(result)) return;
        set(items.map((x) => (x.id === tx.id ? { ...x, state: 'rejected' as const } : x)));
      }
    } finally {
      sending = null;
    }
  })();
  return sending;
}

/**
 * The server has it: put it in the cached totals and lists and drop it from the
 * queue in the same update, so it is never counted twice or missing for a moment.
 * Then refresh from the server.
 */
function handOver(client: QueryClient, tx: QueuedTransaction) {
  const listed: ListedTransaction = { ...asListed(tx), sync: undefined };
  notifyManager.batch(() => {
    for (const query of client.getQueryCache().findAll({ queryKey: ['totals', tx.wallet_id] })) {
      const [, , start, end] = query.queryKey as [string, string, string, string];
      if (tx.date < start || tx.date > end) continue;
      client.setQueryData<CategoryTotal[]>(query.queryKey, (old) => (old ? addToTotals(old, [tx]) : old));
    }
    for (const query of client.getQueryCache().findAll({ queryKey: ['transactions', tx.wallet_id] })) {
      const [, , start, end, category] = query.queryKey as [string, string, string, string, string];
      if (start !== 'all' && (tx.date < start || tx.date > end)) continue;
      if (category !== 'all' && category !== tx.category_id) continue;
      client.setQueryData<Transaction[]>(query.queryKey, (old) =>
        old && !old.some((x) => x.id === tx.id) ? [listed, ...old] : old,
      );
    }
    // History: on the first page, unless already there (an upcoming one is refetched below).
    client.setQueryData<InfiniteData<HistoryRow[]>>(historyKeys.past(tx.wallet_id), (old) =>
      old && tx.date <= todayISO() && old.pages.length > 0 && !old.pages.some((page) => page.some((row) => row.id === tx.id))
        ? { ...old, pages: [[rowOf(listed), ...old.pages[0]], ...old.pages.slice(1)] }
        : old,
    );
    notifyManager.schedule(() => removeQueued(tx.id));
  });
  void client.invalidateQueries({ queryKey: ['totals', tx.wallet_id] });
  void client.invalidateQueries({ queryKey: ['transactions', tx.wallet_id] });
  void client.invalidateQueries({ queryKey: historyKeys.all(tx.wallet_id) });
}

/** Totals per category with the given transactions added in. */
export function addToTotals(totals: CategoryTotal[], extra: Pick<QueuedTransaction, 'category_id' | 'type' | 'amount'>[]) {
  if (extra.length === 0) return totals;
  const next = totals.map((t) => ({ ...t }));
  for (const tx of extra) {
    const hit = next.find((t) => t.category_id === tx.category_id && t.type === tx.type);
    if (hit) {
      hit.total += tx.amount;
      hit.count += 1;
    } else {
      next.push({ category_id: tx.category_id, type: tx.type, total: tx.amount, count: 1 });
    }
  }
  return next;
}
