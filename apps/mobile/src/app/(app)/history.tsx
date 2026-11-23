import type { GoalDeposit, Transaction } from '@kaspilo/shared';
import { useQueryClient } from '@tanstack/react-query';
import { useEffect, useMemo, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { ActivityIndicator, FlatList, Pressable, View } from 'react-native';

import { DeleteTransactionDialog } from '@/components/DeleteTransactionDialog';
import { DepositRow } from '@/components/DepositRow';
import { ScreenHeader } from '@/components/ScreenHeader';
import { TransactionRow } from '@/components/TransactionRow';
import { AppText } from '@/components/ui/AppText';
import { Button } from '@/components/ui/Button';
import { Dialog } from '@/components/ui/Dialog';
import { Icon } from '@/components/ui/Icon';
import { Screen } from '@/components/ui/Screen';
import { EmptyState, ErrorState, Loading } from '@/components/ui/States';
import { asDeposit, asTransaction, type HistoryEntry } from '@/data/history';
import { useCategoryName } from '@/data/hooks';
import { asListed, type ListedTransaction, useOutbox } from '@/data/outbox';
import {
  fetchWalletHistory,
  trimHistory,
  useCategories,
  useDeleteDeposit,
  useGoals,
  useHistory,
  useUpcoming,
} from '@/data/queries';
import { useWalletId } from '@/data/walletContext';
import { useRowAlign } from '@/i18n';
import { buildCsv, shareCsv } from '@/lib/export';
import { OfflineError } from '@/lib/network';
import { useTheme } from '@/theme/ThemeProvider';

type Item = { kind: 'upcomingToggle'; key: string; count: number } | HistoryEntry;

/**
 * Every transaction and goal deposit of the wallet, newest first, 50 at a time as the
 * user scrolls; upcoming payments folded at the top; export of everything to a CSV file
 * (docs/spec.md "Wallets").
 */
export default function HistoryScreen() {
  const { t } = useTranslation();
  const { colors } = useTheme();
  const client = useQueryClient();
  const wallet = useWalletId();
  const nameOf = useCategoryName();
  const categories = useCategories();
  const history = useHistory();
  const upcoming = useUpcoming();
  const goals = useGoals();
  const outbox = useOutbox();
  const removeDeposit = useDeleteDeposit();
  const [upcomingOpen, setUpcomingOpen] = useState(false);
  const [deletingDeposit, setDeletingDeposit] = useState<GoalDeposit | null>(null);
  const [deleting, setDeleting] = useState<ListedTransaction | null>(null);
  const [exporting, setExporting] = useState(false);
  const [message, setMessage] = useState<string | null>(null);

  // Leaving the screen: the phone keeps only the last 3 months of pages (docs/spec.md "Offline").
  useEffect(() => () => trimHistory(client, wallet), [client, wallet]);

  const byId = useMemo(() => new Map((categories.data ?? []).map((c) => [c.id, c])), [categories.data]);
  const goalById = useMemo(() => new Map((goals.data ?? []).map((g) => [g.id, g])), [goals.data]);

  const past = history.entries;
  const future = useMemo(() => upcoming.entries ?? [], [upcoming.entries]);
  const items = useMemo((): Item[] => {
    const head: Item[] = future.length
      ? [{ kind: 'upcomingToggle', key: 'upcoming', count: future.length }, ...(upcomingOpen ? future : [])]
      : [];
    return [...head, ...(past ?? [])];
  }, [past, future, upcomingOpen]);

  const exportAll = async () => {
    setExporting(true);
    setMessage(null);
    try {
      let transactions: Transaction[];
      let deposits: GoalDeposit[];
      try {
        const rows = await fetchWalletHistory(wallet);
        const ids = new Set(rows.map((r) => r.id));
        // Not yet sent ones are part of the books; the ones the server refused are not.
        const own = outbox.filter((x) => x.wallet_id === wallet && x.state === 'queued' && !ids.has(x.id));
        transactions = [...rows.filter((r) => r.kind === 'tx').map(asTransaction), ...own.map(asListed)];
        deposits = rows.filter((r) => r.kind === 'deposit').map(asDeposit);
      } catch (error) {
        // Offline: export what is on the phone (docs/spec.md "Offline").
        if (!(error instanceof OfflineError)) throw error;
        const onPhone = [...future, ...(past ?? [])];
        transactions = onPhone.flatMap((e) => (e.kind === 'tx' && e.tx.sync !== 'rejected' ? [e.tx] : []));
        deposits = onPhone.flatMap((e) => (e.kind === 'deposit' ? [e.d] : []));
      }
      const csv = buildCsv(
        transactions,
        deposits,
        (id) => nameOf(byId.get(id)),
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
          alreadySaved: t('goals.alreadySaved'),
        },
      );
      const shared = await shareCsv(csv, 'kaspilo-transactions.csv');
      setMessage(shared ? t('export.done') : t('export.unavailable'));
    } catch {
      setMessage(t('export.failed'));
    } finally {
      setExporting(false);
    }
  };

  const loadMore = () => {
    if (history.hasNextPage && !history.isFetchingNextPage && !history.isFetchNextPageError) {
      void history.fetchNextPage();
    }
  };

  const header = (
    <View className="pb-4">
      <ScreenHeader title={t('more.history')} />
      <Button
        label={t('export.button')}
        variant="outline"
        onPress={exportAll}
        loading={exporting}
        disabled={items.length === 0}
      />
      {message && (
        <AppText tone="muted" className="mt-2 text-center text-[13px]" accessibilityLiveRegion="polite">
          {message}
        </AppText>
      )}
    </View>
  );

  const footer = history.isFetchingNextPage ? (
    <View className="items-center py-4" accessibilityLabel={t('history.loadingMore')} accessibilityRole="progressbar">
      <ActivityIndicator color={colors.textMuted} />
    </View>
  ) : history.isFetchNextPageError ? (
    history.error instanceof OfflineError ? (
      <EmptyState text={t('history.olderOffline')} />
    ) : (
      <ErrorState onRetry={() => void history.fetchNextPage()} />
    )
  ) : undefined;

  const loading = history.isLoading || categories.isLoading;
  const failed = history.isError && !history.isFetchNextPageError && !past;

  return (
    <Screen leaves="low">
      {loading || failed || items.length === 0 ? (
        <View className="flex-1 px-5 pb-8 pt-2">
          {header}
          {loading ? (
            <Loading />
          ) : failed ? (
            <ErrorState onRetry={() => void history.refetch()} />
          ) : (
            // Offline and never loaded on this phone, or really empty.
            <EmptyState text={t(past ? 'transactions.empty' : 'offline.notLoaded')} />
          )}
        </View>
      ) : (
        <FlatList
          data={items}
          keyExtractor={(item) => item.key}
          ListHeaderComponent={header}
          ListFooterComponent={footer}
          ItemSeparatorComponent={Separator}
          contentContainerClassName="px-5 pb-8 pt-2"
          showsVerticalScrollIndicator={false}
          onEndReached={loadMore}
          onEndReachedThreshold={0.6}
          initialNumToRender={12}
          windowSize={11}
          renderItem={({ item }) =>
            item.kind === 'upcomingToggle' ? (
              <UpcomingToggle count={item.count} open={upcomingOpen} onPress={() => setUpcomingOpen((o) => !o)} />
            ) : item.kind === 'tx' ? (
              <TransactionRow
                transaction={item.tx}
                category={byId.get(item.tx.category_id)}
                onDelete={() => setDeleting(item.tx)}
              />
            ) : (
              <DepositRow
                deposit={item.d}
                goal={goalById.get(item.d.goal_id)}
                onDelete={() => setDeletingDeposit(item.d)}
              />
            )
          }
        />
      )}
      <DeleteTransactionDialog transaction={deleting} onClose={() => setDeleting(null)} />
      <Dialog
        visible={!!deletingDeposit}
        title={t('goals.depositDeleteTitle')}
        onClose={() => setDeletingDeposit(null)}
        actions={[
          {
            label: t('common.delete'),
            variant: 'accent',
            loading: removeDeposit.isPending,
            onPress: async () => {
              if (deletingDeposit) await removeDeposit.mutateAsync(deletingDeposit.id).catch(() => undefined);
              setDeletingDeposit(null);
            },
          },
          { label: t('common.cancel'), variant: 'outline', onPress: () => setDeletingDeposit(null) },
        ]}>
        <AppText className="text-[15px]">
          {t(deletingDeposit?.source === 'existing' ? 'goals.depositDeleteBodyExisting' : 'goals.depositDeleteBody')}
        </AppText>
      </Dialog>
    </Screen>
  );
}

function Separator() {
  return <View className="h-2" />;
}

/** The folded "Upcoming payments (N)" group header. */
function UpcomingToggle({ count, open, onPress }: { count: number; open: boolean; onPress: () => void }) {
  const { t } = useTranslation();
  const align = useRowAlign();
  return (
    <Pressable
      onPress={onPress}
      accessibilityRole="button"
      accessibilityState={{ expanded: open }}
      className={`min-h-[48px] items-center gap-2 rounded-2xl border border-border bg-surface px-4 py-3 ${align.row}`}>
      <Icon name="calendar-clock" tone="muted" size={20} />
      <AppText className="flex-1 text-[15px]">{t('history.upcoming', { count })}</AppText>
      <Icon name={open ? 'chevron-up' : 'chevron-down'} tone="muted" size={20} />
    </Pressable>
  );
}
