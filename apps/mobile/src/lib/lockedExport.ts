import type { ExportRow } from '@kaspilo/shared';
import { useTranslation } from 'react-i18next';

import { supabase } from '@/lib/supabase';

import { buildAllWalletsCsv, shareCsv } from './export';

const PAGE = 1000;

/** Does the signed-in user have any row to export? (Locked users can still read their own.) */
export async function hasExportRows(): Promise<boolean> {
  const { data, error } = await supabase.rpc('export_my_rows', { p_limit: 1 });
  return !error && (data ?? []).length > 0;
}

async function allRows(): Promise<ExportRow[]> {
  const rows: ExportRow[] = [];
  let after: ExportRow | null = null;
  for (;;) {
    const { data, error } = await supabase.rpc('export_my_rows', {
      p_limit: PAGE,
      p_after_at: after?.created_at ?? null,
      p_after_id: after?.id ?? null,
    });
    if (error) throw new Error(error.message);
    const page = (data ?? []) as ExportRow[];
    rows.push(...page);
    if (page.length < PAGE) return rows;
    after = page[page.length - 1];
  }
}

/**
 * Export of every wallet from the locked screen (docs/spec.md "Locked screen"): works
 * without access, through the export_my_rows server function. Resolves false when this
 * device cannot share files.
 */
export function useExportEverything() {
  const { t } = useTranslation();
  return async (): Promise<boolean> => {
    const rows = await allRows();
    const csv = buildAllWalletsCsv(
      rows,
      {
        wallet: (r) => r.wallet_name || t(`wallets.defaults.${r.wallet_default_key ?? 'personal'}`),
        category: (r) =>
          r.category_name ||
          (r.category_default_key
            ? t(`categories.defaults.${r.category_default_key}`, { defaultValue: r.category_default_key })
            : t('categories.unknown')),
        goal: (r) => r.goal_name || t('goals.savings'),
      },
      {
        walletHeader: t('export.wallet'),
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
        alreadySaved: t('goals.alreadySaved'),
      },
    );
    return shareCsv(csv, 'kaspilo.csv');
  };
}
