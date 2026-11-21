import type { Category, Goal, Wallet } from '@kaspilo/shared';
import { useTranslation } from 'react-i18next';

import { asDeposit, asTransaction } from '@/data/history';
import { useCategoryName, useWalletName } from '@/data/hooks';
import { fetchWalletHistory } from '@/data/queries';
import { supabase } from '@/lib/supabase';

import { buildCsv, shareCsv } from './export';

async function rows<T>(query: PromiseLike<{ data: T[] | null; error: { message: string } | null }>): Promise<T[]> {
  const { data, error } = await query;
  if (error) throw new Error(error.message);
  return data ?? [];
}

/**
 * Exports one wallet (any, not only the current one) to a CSV file and opens the
 * share sheet. Resolves false when sharing is not possible on this device.
 */
export function useExportWallet() {
  const { t } = useTranslation();
  const categoryName = useCategoryName();
  const walletName = useWalletName();
  return async (wallet: Wallet): Promise<boolean> => {
    // Every row in batches, upcoming payments included: never cut short (docs/spec.md "Wallets").
    const [categories, history, goals] = await Promise.all([
      rows<Category>(supabase.from('categories').select('*').eq('wallet_id', wallet.id)),
      fetchWalletHistory(wallet.id),
      rows<Goal>(supabase.from('goals').select('*').eq('wallet_id', wallet.id)),
    ]);
    const transactions = history.filter((r) => r.kind === 'tx').map(asTransaction);
    const deposits = history.filter((r) => r.kind === 'deposit').map(asDeposit);
    const byId = new Map(categories.map((c) => [c.id, c]));
    const goalById = new Map(goals.map((g) => [g.id, g]));
    const csv = buildCsv(
      transactions,
      deposits,
      (id) => categoryName(byId.get(id)),
      (id) => goalById.get(id)?.name ?? t('goals.savings'),
      {
        headers: {
          date: t('export.date'),
          type: t('export.type'),
          category: t('export.category'),
          description: t('export.description'),
          amount: t('export.amount'),
        },
        income: t('common.income'),
        expense: t('common.expense'),
        savings: t('goals.savings'),
      },
    );
    const safe = walletName(wallet).replace(/[\\/:*?"<>|\s]+/g, '-');
    return shareCsv(csv, `kaspilo-${safe}.csv`);
  };
}
