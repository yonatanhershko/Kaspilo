import type { Category } from '@kaspilo/shared';
import { router } from 'expo-router';
import { useTranslation } from 'react-i18next';
import { View } from 'react-native';

import { useCategoryName, useDateFormat, useMoney } from '@/data/hooks';
import { flushOutbox, type ListedTransaction, retryQueued } from '@/data/outbox';
import { useQueryClient } from '@tanstack/react-query';
import { useRowAlign } from '@/i18n';

import { AppText } from './ui/AppText';
import { CategoryIcon, Icon } from './ui/Icon';
import { PressScale } from '@/components/ui/PressScale';

/**
 * One transaction line. Tap to edit; the trash button asks the parent to delete.
 * One still on the phone (docs/spec.md "Offline") shows a "not synced" tag and cannot
 * be edited until sent; one the server refused shows Retry under it.
 */
export function TransactionRow({
  transaction,
  category,
  onDelete,
}: {
  transaction: ListedTransaction;
  category: Category | undefined;
  onDelete: () => void;
}) {
  const { t } = useTranslation();
  const align = useRowAlign();
  const money = useMoney();
  const nameOf = useCategoryName();
  const { dayMonthShort } = useDateFormat();
  const title = transaction.description || nameOf(category);
  const sign = transaction.type === 'income' ? '+' : '';
  const client = useQueryClient();
  const sync = transaction.sync;
  const syncLabel = sync === 'queued' ? t('offline.notSynced') : sync === 'rejected' ? t('offline.rejected') : '';

  return (
    <View className={`rounded-lg border bg-surface ${sync === 'rejected' ? 'border-accent' : 'border-border'}`}>
    <View className={`items-center ${align.row}`}>
      <PressScale
        accessibilityRole={sync ? undefined : 'button'}
        accessibilityLabel={`${title}, ${money.format(transaction.amount)}, ${dayMonthShort(transaction.date)}. ${sync ? syncLabel : t('common.edit')}`}
        disabled={!!sync}
        onPress={() => router.push({ pathname: '/add', params: { id: transaction.id } })}
        className={`min-h-[60px] flex-1 items-center gap-3 py-2 active:opacity-70 ${align.row} ${align.he ? 'pr-3' : 'pl-3'}`}>
        <CategoryIcon icon={category?.icon ?? 'tag'} color={category?.color ?? '#8A9099'} size={38} />
        <View className="flex-1">
          <AppText className="text-[15px]" numberOfLines={1}>
            {title}
          </AppText>
          <View className={`items-center gap-1 ${align.row}`}>
            <AppText tone="muted" className="text-[12px]">
              {dayMonthShort(transaction.date)} · {nameOf(category)}
            </AppText>
            {transaction.recurring_rule_id && <Icon name="repeat" size={13} tone="muted" />}
          </View>
          {sync === 'queued' && (
            <View className={`mt-1 items-center gap-1 rounded-full bg-surface-muted px-2 py-0.5 ${align.row} ${align.he ? 'self-end' : 'self-start'}`}>
              <Icon name="cloud-off-outline" size={12} tone="muted" />
              <AppText tone="muted" className="text-[11px]">
                {syncLabel}
              </AppText>
            </View>
          )}
          {sync === 'rejected' && (
            <AppText tone="muted" className="mt-0.5 text-[12px]">
              {syncLabel}
            </AppText>
          )}
        </View>
        <AppText weight="medium" tone={transaction.type === 'income' ? 'success' : 'text'} className="text-[15px]">
          {sign}
          {money.format(transaction.amount)}
        </AppText>
      </PressScale>
      <PressScale
        accessibilityRole="button"
        accessibilityLabel={`${t('common.delete')}: ${title}`}
        onPress={onDelete}
        className="h-[60px] w-11 items-center justify-center">
        <Icon name="trash-can-outline" size={20} tone="muted" />
      </PressScale>
    </View>
    {sync === 'rejected' && (
      <PressScale
        accessibilityRole="button"
        onPress={() => {
          retryQueued(transaction.id);
          void flushOutbox(client);
        }}
        className={`min-h-[44px] items-center justify-center gap-1.5 border-t border-border ${align.row}`}>
        <Icon name="refresh" size={18} tone="primary" />
        <AppText tone="primary" weight="medium" className="text-[14px]">
          {t('common.retry')}
        </AppText>
      </PressScale>
    )}
    </View>
  );
}
