import type {
  Category,
  CategoryTotal,
  Goal,
  GoalDeposit,
  GoalTotal,
  HistoryRow,
  Period,
  RepeatFrequency,
  Transaction,
  TransactionType,
  UserSettings,
  Wallet,
} from '@kaspilo/shared';
import { fromISODate, todayISO, toISODate } from '@kaspilo/shared';
import {
  type InfiniteData,
  type QueryClient,
  useInfiniteQuery,
  useMutation,
  useQuery,
  useQueryClient,
} from '@tanstack/react-query';
import { subMonths } from 'date-fns/subMonths';
import { randomUUID } from '@/lib/uuid';
import { useMemo } from 'react';

import { isOnline, isTransient, OfflineError, RateLimitError } from '@/lib/network';
import { supabase } from '@/lib/supabase';

import {
  cursorOf,
  entryOf,
  HISTORY_BATCH,
  HISTORY_PAGE,
  type HistoryCursor,
  type HistoryEntry,
  historyKeys,
  newestFirst,
  OFFLINE_HISTORY_MONTHS,
  toPages,
  txEntry,
} from './history';
import { addToTotals, asListed, enqueue, type ListedTransaction, removeQueued, useOutbox } from './outbox';
import { useWalletId } from './walletContext';

/**
 * All reads and writes of the user's financial data. Amounts are integers in
 * minor units everywhere. Row Level Security scopes every call to the signed-in
 * user, so no user id is sent from here. Money data is also scoped to the current
 * wallet: every key holds its id, so switching wallets never shows another wallet's rows.
 */

function unwrap<T>(result: { data: T | null; error: { message: string; code?: string } | null; status?: number }): T {
  if (result.error) {
    if (result.status === 429) throw new RateLimitError();
    throw isTransient(result) ? new OfflineError() : new Error(result.error.message);
  }
  return result.data as T;
}

/** This wallet's transactions still on the phone (docs/spec.md "Offline"). */
function useWalletOutbox(wallet: string) {
  const all = useOutbox();
  return useMemo(() => all.filter((x) => x.wallet_id === wallet), [all, wallet]);
}

const keys = {
  settings: ['settings'] as const,
  wallets: ['wallets'] as const,
  categories: (w: string) => ['categories', w] as const,
  totals: (w: string, p: Period) => ['totals', w, p.start, p.end] as const,
  transactions: (w: string, p: Period | null, categoryId?: string) =>
    ['transactions', w, p?.start ?? 'all', p?.end ?? 'all', categoryId ?? 'all'] as const,
  /** Prefix of every goal and deposit query; invalidating it refreshes them all. */
  goals: ['goals'] as const,
  walletGoals: (w: string) => ['goals', w] as const,
};

/** After any change to transactions, every sum on screen may be stale. */
function useInvalidateMoney() {
  const client = useQueryClient();
  return () =>
    Promise.all([
      client.invalidateQueries({ queryKey: ['totals'] }),
      client.invalidateQueries({ queryKey: ['transactions'] }),
      client.invalidateQueries({ queryKey: ['history'] }),
    ]);
}

// ---- settings ---------------------------------------------------------------

export function useSettings() {
  return useQuery({
    queryKey: keys.settings,
    queryFn: async () => unwrap<UserSettings>(await supabase.from('user_settings').select('*').single()),
  });
}

export function useUpdateSettings() {
  const client = useQueryClient();
  return useMutation({
    mutationFn: async (patch: Partial<Omit<UserSettings, 'user_id' | 'updated_at'>>) => {
      const current = client.getQueryData<UserSettings>(keys.settings);
      if (!current) throw new Error('settings not loaded');
      return unwrap<UserSettings>(
        await supabase.from('user_settings').update(patch).eq('user_id', current.user_id).select().single(),
      );
    },
    onSuccess: (data) => client.setQueryData(keys.settings, data),
  });
}

// ---- wallets ----------------------------------------------------------------

export function useWallets(enabled = true) {
  return useQuery({
    queryKey: keys.wallets,
    enabled,
    queryFn: async () =>
      unwrap<Wallet[]>(await supabase.from('wallets').select('*').order('sort_order').order('created_at')),
  });
}

export type WalletPatch = Partial<
  Pick<Wallet, 'name' | 'color' | 'icon' | 'sort_order' | 'month_start_day' | 'overall_budget'>
>;

export function useUpdateWallet() {
  const client = useQueryClient();
  return useMutation({
    mutationFn: async (input: { id: string } & WalletPatch) => {
      const { id, ...patch } = input;
      return unwrap<Wallet>(await supabase.from('wallets').update(patch).eq('id', id).select().single());
    },
    onSuccess: (data) =>
      client.setQueryData<Wallet[]>(keys.wallets, (list) => list?.map((w) => (w.id === data.id ? data : w))),
  });
}

/** Move one wallet to a new place in the list. */
export function useMoveWallet() {
  const client = useQueryClient();
  return useMutation({
    mutationFn: async ({ list, from, to }: { list: Wallet[]; from: number; to: number }) => {
      const order = [...list];
      const [moved] = order.splice(from, 1);
      order.splice(to, 0, moved);
      // Write every wallet's new index, so equal or gapped orders straighten out too.
      const changed = order.map((w, index) => ({ w, index })).filter(({ w, index }) => w.sort_order !== index);
      const results = await Promise.all(
        changed.map(({ w, index }) => supabase.from('wallets').update({ sort_order: index }).eq('id', w.id)),
      );
      for (const result of results) if (result.error) throw new Error(result.error.message);
    },
    onSettled: () => client.invalidateQueries({ queryKey: keys.wallets }),
  });
}

export class WalletLimitError extends Error {}

/** New wallet with the default categories (server side). At most 4, enforced by the database. */
export function useCreateWallet() {
  const client = useQueryClient();
  return useMutation({
    mutationFn: async (input: { name: string; color: string; icon: string }) => {
      const { data, error, status } = await supabase.rpc('create_wallet', {
        p_name: input.name.trim(),
        p_color: input.color,
        p_icon: input.icon,
      });
      if (error && status === 429) throw new RateLimitError();
      if (error) throw error.message.includes('wallet_limit') ? new WalletLimitError() : new Error(error.message);
      return data as Wallet;
    },
    onSuccess: async (wallet) => {
      // In the list at once, so switching to it never falls back to another wallet.
      client.setQueryData<Wallet[]>(keys.wallets, (list) => (list ? [...list, wallet] : [wallet]));
      await client.invalidateQueries({ queryKey: keys.wallets });
    },
  });
}

/** Deletes a wallet and all its data for good. The database keeps the last one. */
export function useDeleteWallet() {
  const client = useQueryClient();
  return useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase.rpc('delete_wallet', { p_wallet_id: id });
      if (error) throw new Error(error.message);
      return id;
    },
    onSuccess: async (id) => {
      for (const prefix of ['categories', 'totals', 'transactions', 'goals']) {
        client.removeQueries({ queryKey: [prefix, id] });
      }
      await client.invalidateQueries({ queryKey: keys.wallets });
    },
  });
}

// ---- categories -------------------------------------------------------------

export function useCategories() {
  const wallet = useWalletId();
  return useQuery({
    queryKey: keys.categories(wallet),
    queryFn: async () =>
      unwrap<Category[]>(
        await supabase
          .from('categories')
          .select('*')
          .eq('wallet_id', wallet)
          .order('sort_order')
          .order('created_at'),
      ),
  });
}

export type CategoryInput = {
  type: TransactionType;
  name: string;
  icon: string;
  color: string;
  monthly_budget?: number | null;
};

export function useSaveCategory() {
  const client = useQueryClient();
  const wallet = useWalletId();
  return useMutation({
    mutationFn: async (input: { id?: string; sort_order?: number } & Partial<CategoryInput>) => {
      const { id, ...fields } = input;
      if (id) {
        return unwrap<Category>(
          await supabase.from('categories').update(fields).eq('id', id).select().single(),
        );
      }
      if (!fields.type) throw new Error('type is required');
      return unwrap<Category>(
        await supabase
          .from('categories')
          .insert({ ...fields, type: fields.type, wallet_id: wallet, sort_order: fields.sort_order ?? 999 })
          .select()
          .single(),
      );
    },
    onSuccess: () => client.invalidateQueries({ queryKey: ['categories'] }),
  });
}

/**
 * Remove a category. One that has transactions is archived instead (hidden
 * from pickers, history and totals keep it); an unused one is deleted.
 */
export function useRemoveCategory() {
  const client = useQueryClient();
  return useMutation({
    mutationFn: async (id: string) => {
      const used = await supabase
        .from('transactions')
        .select('id', { count: 'exact', head: true })
        .eq('category_id', id);
      if (used.error) throw new Error(used.error.message);
      if ((used.count ?? 0) > 0) {
        unwrap(await supabase.from('categories').update({ archived: true }).eq('id', id).select());
        return 'archived' as const;
      }
      const removed = await supabase.from('categories').delete().eq('id', id);
      if (removed.error) {
        // still referenced by a repeat rule: archive
        unwrap(await supabase.from('categories').update({ archived: true }).eq('id', id).select());
        return 'archived' as const;
      }
      return 'deleted' as const;
    },
    onSuccess: () => client.invalidateQueries({ queryKey: ['categories'] }),
  });
}

// ---- totals and transactions ------------------------------------------------

export function useCategoryTotals(period: Period) {
  const wallet = useWalletId();
  const pending = useWalletOutbox(wallet);
  const query = useQuery({
    queryKey: keys.totals(wallet, period),
    queryFn: async () =>
      unwrap<CategoryTotal[]>(
        await supabase.rpc('category_totals', { p_wallet_id: wallet, p_from: period.start, p_to: period.end }),
      ),
  });
  // Not yet sent ones count at once; refused ones do not.
  const { start, end } = period;
  const data = useMemo(() => {
    const extra = pending.filter((x) => x.state === 'queued' && x.date >= start && x.date <= end);
    return query.data ? addToTotals(query.data, extra) : query.data;
  }, [query.data, pending, start, end]);
  return { ...query, data };
}

function transactionsQuery(wallet: string, period: Period | null, categoryId?: string) {
  return {
    queryKey: keys.transactions(wallet, period, categoryId),
    queryFn: async () => {
      let query = supabase.from('transactions').select('*').eq('wallet_id', wallet);
      if (period) query = query.gte('date', period.start).lte('date', period.end);
      if (categoryId) query = query.eq('category_id', categoryId);
      return unwrap<Transaction[]>(
        await query.order('date', { ascending: false }).order('created_at', { ascending: false }).limit(2000),
      );
    },
  };
}

// ---- history (docs/spec.md "Wallets": history list, upcoming, complete export) ----

type HistoryData = InfiniteData<HistoryRow[], HistoryCursor>;

async function historyRead(
  wallet: string,
  opts: { upcoming?: boolean; since?: string | null; cursor?: HistoryCursor; limit: number },
): Promise<HistoryRow[]> {
  return unwrap<HistoryRow[]>(
    await supabase.rpc('wallet_history', {
      p_wallet_id: wallet,
      p_today: todayISO(),
      p_upcoming: !!opts.upcoming,
      p_since: opts.since ?? null,
      p_cursor_date: opts.cursor?.date ?? null,
      p_cursor_at: opts.cursor?.at ?? null,
      p_cursor_id: opts.cursor?.id ?? null,
      p_limit: opts.limit,
    }),
  );
}

/**
 * Every matching row, in batches. Stops only on an empty batch, so a server set to
 * return fewer rows per read than asked can never cut the result short.
 */
async function historyReadAll(wallet: string, opts: { upcoming?: boolean; since?: string | null }): Promise<HistoryRow[]> {
  const all: HistoryRow[] = [];
  let cursor: HistoryCursor = null;
  for (;;) {
    const rows = await historyRead(wallet, { ...opts, cursor, limit: HISTORY_BATCH });
    if (rows.length === 0) return all;
    all.push(...rows);
    cursor = cursorOf(rows[rows.length - 1]);
  }
}

/** The whole wallet for a CSV export: every row up to today and every upcoming one. */
export async function fetchWalletHistory(wallet: string): Promise<HistoryRow[]> {
  const [past, upcoming] = await Promise.all([
    historyReadAll(wallet, {}),
    historyReadAll(wallet, { upcoming: true }),
  ]);
  return [...past, ...upcoming];
}

const offlineSince = () => toISODate(subMonths(fromISODate(todayISO()), OFFLINE_HISTORY_MONTHS));

/**
 * Load the current wallet's last 3 months of History (and the upcoming rows) in the
 * background while online, so History has something to show offline (docs/spec.md "Offline").
 */
export function usePrefetchHistory() {
  const client = useQueryClient();
  const wallet = useWalletId();
  return async () => {
    try {
      const recent = await historyReadAll(wallet, { since: offlineSince() });
      // Fill the last page up to a full one, so the list knows whether older rows exist.
      const short = recent.length % HISTORY_PAGE;
      if (short > 0 || recent.length === 0) {
        const cursor = recent.length ? cursorOf(recent[recent.length - 1]) : null;
        recent.push(...(await historyRead(wallet, { cursor, limit: HISTORY_PAGE - short })));
      }
      const key = historyKeys.past(wallet);
      const current = client.getQueryData<HistoryData>(key);
      // Keep a longer list the user already scrolled to.
      if (!current || current.pages.flat().length <= recent.length) client.setQueryData<HistoryData>(key, toPages(recent));
      await client.prefetchQuery(upcomingQuery(wallet));
    } catch {
      // Offline or a passing error: keep what is on the phone.
    }
  };
}

/** Drop History pages older than the offline window, so the phone keeps about 3 months. */
export function trimHistory(client: QueryClient, wallet: string) {
  const since = offlineSince();
  client.setQueryData<HistoryData>(historyKeys.past(wallet), (data) => {
    if (!data) return data;
    // Keep every page that starts inside the window, plus the one that crosses it.
    let keep = data.pages.findIndex((page) => page.length > 0 && page[0].date < since);
    if (keep === -1) return data;
    keep = Math.max(keep, 1);
    if (keep >= data.pages.length) return data;
    return { pages: data.pages.slice(0, keep), pageParams: data.pageParams.slice(0, keep) };
  });
}

function upcomingQuery(wallet: string) {
  return {
    queryKey: historyKeys.upcoming(wallet),
    queryFn: () => historyReadAll(wallet, { upcoming: true }),
  };
}

/** Rows up to today, newest first, 50 at a time. Not yet sent transactions are listed too. */
export function useHistory() {
  const wallet = useWalletId();
  const pending = useWalletOutbox(wallet);
  const query = useInfiniteQuery({
    queryKey: historyKeys.past(wallet),
    initialPageParam: null as HistoryCursor,
    queryFn: ({ pageParam }) => historyRead(wallet, { cursor: pageParam, limit: HISTORY_PAGE }),
    getNextPageParam: (last: HistoryRow[]) =>
      last.length < HISTORY_PAGE ? undefined : cursorOf(last[last.length - 1]),
  });
  // Offline with nothing saved yet the query waits; still show what is on the phone.
  const waiting = query.fetchStatus === 'paused';
  const today = todayISO();
  const entries = useMemo((): HistoryEntry[] | undefined => {
    if (!query.data && !waiting) return undefined;
    const rows = query.data?.pages.flat() ?? [];
    const ids = new Set(rows.map((row) => row.id));
    const own = pending.filter((x) => x.date <= today && !ids.has(x.id)).map((x) => txEntry(asListed(x)));
    const list = rows.map(entryOf);
    return own.length ? [...own, ...list].sort(newestFirst) : list;
  }, [query.data, waiting, pending, today]);
  return { ...query, entries };
}

/** Rows after today (remaining installment payments), soonest first. */
export function useUpcoming() {
  const wallet = useWalletId();
  const pending = useWalletOutbox(wallet);
  const query = useQuery(upcomingQuery(wallet));
  const today = todayISO();
  const entries = useMemo((): HistoryEntry[] | undefined => {
    if (!query.data) return undefined;
    const ids = new Set(query.data.map((row) => row.id));
    const own = pending.filter((x) => x.date > today && !ids.has(x.id)).map((x) => txEntry(asListed(x)));
    const list = query.data.map(entryOf);
    return own.length ? [...own, ...list].sort((a, b) => newestFirst(b, a)) : list;
  }, [query.data, pending, today]);
  return { ...query, entries };
}

export function useTransactions(period: Period | null, categoryId?: string) {
  const wallet = useWalletId();
  const pending = useWalletOutbox(wallet);
  const query = useQuery(transactionsQuery(wallet, period, categoryId));
  const start = period?.start;
  const end = period?.end;
  // Offline with nothing saved yet the query waits; still show what is on the phone.
  const waiting = query.fetchStatus === 'paused';
  const data = useMemo((): ListedTransaction[] | undefined => {
    if (!query.data && !waiting) return query.data;
    const server = query.data ?? [];
    const own = pending.filter(
      (x) =>
        (!start || !end || (x.date >= start && x.date <= end)) &&
        (!categoryId || x.category_id === categoryId) &&
        !server.some((row) => row.id === x.id),
    );
    if (own.length === 0) return query.data;
    return [...own.map(asListed), ...server].sort((a, b) =>
      a.date === b.date ? b.created_at.localeCompare(a.created_at) : b.date.localeCompare(a.date),
    );
  }, [query.data, waiting, pending, start, end, categoryId]);
  return { ...query, data };
}

export function useTransaction(id: string | undefined) {
  return useQuery({
    queryKey: ['transactions', 'one', id],
    enabled: !!id,
    queryFn: async () =>
      unwrap<Transaction>(await supabase.from('transactions').select('*').eq('id', id as string).single()),
  });
}

export type Repeat =
  | { kind: 'none' }
  | { kind: 'recurring'; frequency: RepeatFrequency }
  | { kind: 'installments'; count: number };

export type TransactionInput = {
  type: TransactionType;
  /** minor units. For installments this is the full total. */
  amount: number;
  description: string;
  date: string;
  category_id: string;
  repeat: Repeat;
};

export function useAddTransaction() {
  const invalidate = useInvalidateMoney();
  const wallet = useWalletId();
  return useMutation({
    /** 'queued' = no internet: kept on the phone and sent later. */
    mutationFn: async (input: TransactionInput): Promise<'saved' | 'queued'> => {
      const description = input.description.trim();
      if (input.repeat.kind !== 'none' && !(await isOnline())) throw new OfflineError();
      if (input.repeat.kind === 'recurring') {
        unwrap(
          await supabase.rpc('create_recurring', {
            p_type: input.type,
            p_category_id: input.category_id,
            p_description: description,
            p_amount: input.amount,
            p_frequency: input.repeat.frequency,
            p_start_date: input.date,
          }),
        );
      } else if (input.repeat.kind === 'installments') {
        unwrap(
          await supabase.rpc('create_installments', {
            p_type: input.type,
            p_category_id: input.category_id,
            p_description: description,
            p_total: input.amount,
            p_count: input.repeat.count,
            p_first_date: input.date,
          }),
        );
      } else {
        // The id is made here, so a send that is repeated later never makes a second row.
        const row = {
          id: randomUUID(),
          wallet_id: wallet,
          type: input.type,
          amount: input.amount,
          description,
          date: input.date,
          category_id: input.category_id,
        };
        if (!(await isOnline())) {
          enqueue(row);
          return 'queued';
        }
        const result = await supabase.from('transactions').insert(row).select();
        if (result.error && isTransient(result)) {
          enqueue(row);
          return 'queued';
        }
        unwrap(result);
      }
      return 'saved';
    },
    onSuccess: (outcome) => (outcome === 'saved' ? invalidate() : undefined),
  });
}

export function useUpdateTransaction() {
  const invalidate = useInvalidateMoney();
  return useMutation({
    mutationFn: async (input: {
      id: string;
      amount: number;
      description: string;
      date: string;
      category_id: string;
    }) => {
      const { id, ...fields } = input;
      unwrap(
        await supabase
          .from('transactions')
          .update({ ...fields, description: fields.description.trim() })
          .eq('id', id)
          .select(),
      );
    },
    onSuccess: invalidate,
  });
}

export function useDeleteTransaction() {
  const invalidate = useInvalidateMoney();
  return useMutation({
    mutationFn: async (tx: Pick<ListedTransaction, 'id' | 'sync'>) => {
      // Still on the phone: the server never had it.
      if (tx.sync) return removeQueued(tx.id);
      unwrap(await supabase.from('transactions').delete().eq('id', tx.id).select());
      await invalidate();
    },
  });
}

/** Adds the recurring transactions that came due since the last visit. */
export async function materializeRecurring(): Promise<number> {
  const { data, error } = await supabase.rpc('materialize_recurring');
  return error ? 0 : (data ?? 0);
}

// ---- goals ------------------------------------------------------------------

export type GoalWithSaved = Goal & { saved: number };

export function useGoals() {
  const wallet = useWalletId();
  return useQuery({
    queryKey: keys.walletGoals(wallet),
    queryFn: async (): Promise<GoalWithSaved[]> => {
      // goal_totals sums every goal of the user; only this wallet's goals are listed.
      const [goals, totals] = await Promise.all([
        supabase.from('goals').select('*').eq('wallet_id', wallet).order('created_at'),
        supabase.rpc('goal_totals'),
      ]);
      const saved = new Map(unwrap<GoalTotal[]>(totals).map((t) => [t.goal_id, t.saved]));
      return unwrap<Goal[]>(goals).map((g) => ({ ...g, saved: saved.get(g.id) ?? 0 }));
    },
  });
}

/** Money deposited per goal inside one budget period. Never part of expense totals. */
export function useGoalDepositsInPeriod(period: Period) {
  const wallet = useWalletId();
  return useQuery({
    // Under the 'goals' key so a new deposit refreshes it.
    queryKey: [...keys.walletGoals(wallet), 'deposits', period.start, period.end] as const,
    // Kept as a plain object: the cache is saved on the phone as JSON, which drops a Map.
    select: (sums: Record<string, number>) => new Map(Object.entries(sums)),
    queryFn: async (): Promise<Record<string, number>> => {
      const rows = unwrap<Pick<GoalDeposit, 'goal_id' | 'amount'>[]>(
        await supabase
          .from('goal_deposits')
          .select('goal_id, amount')
          .eq('wallet_id', wallet)
          .gte('date', period.start)
          .lte('date', period.end)
          .limit(2000),
      );
      const sums: Record<string, number> = {};
      for (const r of rows) sums[r.goal_id] = (sums[r.goal_id] ?? 0) + r.amount;
      return sums;
    },
  });
}

export function useSaveGoal() {
  const client = useQueryClient();
  const wallet = useWalletId();
  return useMutation({
    mutationFn: async (input: { id?: string; name: string; target_amount: number; icon?: string }) => {
      const { id, ...fields } = input;
      const name = fields.name.trim();
      if (id) {
        unwrap(await supabase.from('goals').update({ ...fields, name }).eq('id', id).select());
      } else {
        unwrap(await supabase.from('goals').insert({ ...fields, name, wallet_id: wallet }).select());
      }
    },
    onSuccess: () =>
      Promise.all([
        client.invalidateQueries({ queryKey: keys.goals }),
        client.invalidateQueries({ queryKey: ['history'] }),
      ]),
  });
}

/**
 * Delete a goal. `keep` archives it: gone from the Goals tab, deposits stay in history,
 * stats and balance. `erase` removes the goal and every deposit for good.
 */
export function useDeleteGoal() {
  const client = useQueryClient();
  return useMutation({
    mutationFn: async (input: { id: string; mode: 'keep' | 'erase' }) => {
      if (input.mode === 'keep') {
        unwrap(await supabase.from('goals').update({ archived_at: new Date().toISOString() }).eq('id', input.id).select());
      } else {
        unwrap(await supabase.from('goals').delete().eq('id', input.id).select());
      }
    },
    onSuccess: () =>
      Promise.all([
        client.invalidateQueries({ queryKey: keys.goals }),
        client.invalidateQueries({ queryKey: ['history'] }),
      ]),
  });
}

/** Delete one deposit. The money returns to the balance. */
export function useDeleteDeposit() {
  const client = useQueryClient();
  return useMutation({
    mutationFn: async (id: string) => {
      unwrap(await supabase.from('goal_deposits').delete().eq('id', id).select());
    },
    onSuccess: () =>
      Promise.all([
        client.invalidateQueries({ queryKey: keys.goals }),
        client.invalidateQueries({ queryKey: ['history'] }),
      ]),
  });
}

export function useDeposit() {
  const client = useQueryClient();
  return useMutation({
    mutationFn: async (input: { goal_id: string; amount: number }) => {
      unwrap(await supabase.from('goal_deposits').insert(input).select());
    },
    onSuccess: () =>
      Promise.all([
        client.invalidateQueries({ queryKey: keys.goals }),
        client.invalidateQueries({ queryKey: ['history'] }),
      ]),
  });
}
