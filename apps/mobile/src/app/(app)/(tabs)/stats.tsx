import {
  percentOf,
  type Period,
  periodBalance,
  periodFor,
  shiftPeriod,
  type TransactionType,
  yearOf,
  yearPeriod,
} from '@kaspilo/shared';
import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { View } from 'react-native';

import { Donut } from '@/components/Donut';
import { AppText } from '@/components/ui/AppText';
import { Icon } from '@/components/ui/Icon';
import { Screen } from '@/components/ui/Screen';
import { Segmented } from '@/components/ui/Segmented';
import { EmptyState, ErrorState, Loading } from '@/components/ui/States';
import { useCategoryName, useCurrentPeriod, useDateFormat, useMoney } from '@/data/hooks';
import { useCategories, useCategoryTotals, useGoalDepositsInPeriod } from '@/data/queries';
import { useRowAlign } from '@/i18n';
import { useTheme } from '@/theme/ThemeProvider';
import { PressScale } from '@/components/ui/PressScale';
import { useCountUp } from '@/lib/useCountUp';
import { WalletSwitcher } from '@/components/wallet/WalletSwitcher';

type View_ = 'monthly' | 'yearly';
type Tab = TransactionType | 'balance';

export default function StatsScreen() {
  const { t } = useTranslation();
  const align = useRowAlign();
  const money = useMoney();
  const { colors } = useTheme();
  const nameOf = useCategoryName();
  const { dayMonthShort, monthYear } = useDateFormat();
  const { startDay, today } = useCurrentPeriod();

  const [view, setView] = useState<View_>('monthly');
  const [type, setType] = useState<Tab>('expense');
  const [offset, setOffset] = useState(0);

  const currentMonth = periodFor(today, startDay);
  const period: Period =
    view === 'monthly' ? shiftPeriod(currentMonth, offset, startDay) : yearPeriod(yearOf(today) + offset);
  const previous: Period =
    view === 'monthly' ? shiftPeriod(currentMonth, offset - 1, startDay) : yearPeriod(yearOf(today) + offset - 1);

  const categories = useCategories();
  const totals = useCategoryTotals(period);
  const deposits = useGoalDepositsInPeriod(period);
  const previousTotals = useCategoryTotals(previous);

  const byId = new Map((categories.data ?? []).map((c) => [c.id, c]));
  const listType: TransactionType = type === 'balance' ? 'expense' : type;
  const rows = (totals.data ?? [])
    .filter((x) => x.type === listType)
    .sort((a, b) => b.total - a.total)
    .map((x) => ({ ...x, category: byId.get(x.category_id) }));
  const total = rows.reduce((a, x) => a + x.total, 0);
  const previousTotal = (previousTotals.data ?? []).filter((x) => x.type === listType).reduce((a, x) => a + x.total, 0);

  // Whole-percent change against the previous period, from integers.
  const change = previousTotal > 0 ? Math.round(((total - previousTotal) * 100) / previousTotal) : null;

  // Balance tab: income split into expenses, saved and what is left.
  const sumOf = (kind: TransactionType) =>
    (totals.data ?? []).filter((x) => x.type === kind).reduce((a, x) => a + x.total, 0);
  const incomeAll = sumOf('income');
  const expenseAll = sumOf('expense');
  const savedAll = [...(deposits.data?.values() ?? [])].reduce((a, b) => a + b, 0);
  const balance = periodBalance(incomeAll, savedAll, expenseAll);
  // Count up once per app launch (2 s at most), only once all the data is in.
  const amountsReady = totals.isSuccess && deposits.isSuccess;
  const shownTotal = useCountUp(amountsReady ? total : 0, 'stats.total');
  const shownBalance = useCountUp(amountsReady ? balance : 0, 'stats.balance');
  const balanceRows = [
    {
      key: 'expense',
      label: t('stats.expenses'),
      value: expenseAll,
      color: colors.accent,
    },
    {
      key: 'saved',
      label: t('stats.saved'),
      value: savedAll,
      color: colors.primary,
    },
    ...(balance > 0
      ? [
          {
            key: 'left',
            label: t('stats.left'),
            value: balance,
            color: colors.secondary,
          },
        ]
      : []),
  ].filter((r) => r.value > 0);
  const balanceBase = balanceRows.reduce((a, r) => a + r.value, 0);

  const label =
    view === 'yearly'
      ? String(yearOf(period.start))
      : startDay === 1
        ? monthYear(period.start)
        : `${dayMonthShort(period.start)} – ${dayMonthShort(period.end)}`;

  const back = 'chevron-left';
  const forward = 'chevron-right';

  return (
    <Screen leaves="low" scroll className="px-5 pb-8 pt-3">
      <AppText weight="bold" className="mb-2 text-center text-[20px]" accessibilityRole="header">
        {t('tabs.stats')}
      </AppText>
      <View className="mb-3">
        <WalletSwitcher center />
      </View>

      <Segmented
        value={view}
        onChange={(v) => {
          setView(v);
          setOffset(0);
        }}
        options={[
          { value: 'monthly', label: t('stats.monthly') },
          { value: 'yearly', label: t('stats.yearly') },
        ]}
      />

      <View className="mt-2 flex-row items-center justify-between">
        <PressScale
          accessibilityRole="button"
          accessibilityLabel={t('common.previous')}
          className="h-11 w-11 items-center justify-center"
          onPress={() => setOffset(offset - 1)}>
          <Icon name={back} tone="muted" />
        </PressScale>
        <AppText tone="muted" className="text-[14px]">
          {label}
        </AppText>
        <PressScale
          accessibilityRole="button"
          accessibilityLabel={t('common.nextItem')}
          accessibilityState={{ disabled: offset >= 0 }}
          disabled={offset >= 0}
          className={`h-11 w-11 items-center justify-center ${offset >= 0 ? 'opacity-30' : ''}`}
          onPress={() => setOffset(offset + 1)}>
          <Icon name={forward} tone="muted" />
        </PressScale>
      </View>

      <View className="mb-3 mt-1 flex-row justify-center gap-2">
        {(['expense', 'income', 'balance'] as const).map((option) => {
          const selected = type === option;
          return (
            <PressScale
              key={option}
              accessibilityRole="button"
              accessibilityState={{ selected }}
              onPress={() => setType(option)}
              className={`min-h-[44px] justify-center rounded-full border px-5 ${
                selected ? 'border-primary bg-leaf-light' : 'border-border bg-surface'
              }`}>
              <AppText weight={selected ? 'medium' : 'regular'} className="text-[14px]">
                {t(option === 'expense' ? 'stats.expenses' : option === 'income' ? 'stats.income' : 'stats.balance')}
              </AppText>
            </PressScale>
          );
        })}
      </View>

      {totals.isLoading || categories.isLoading || deposits.isLoading ? (
        <Loading />
      ) : totals.isError || categories.isError || deposits.isError ? (
        <ErrorState
          onRetry={() => {
            void totals.refetch();
            void categories.refetch();
            void deposits.refetch();
          }}
        />
      ) : type === 'balance' ? (
        <>
          <View className="items-center">
            <Donut
              introKey="stats.balance"
              slices={balanceRows.map((r) => ({
                key: r.key,
                value: r.value,
                color: r.color,
              }))}>
              <AppText weight="bold" className="text-[24px]">
                {money.format(shownBalance)}
              </AppText>
              <AppText tone="muted" className="text-[13px]">
                {t('stats.balance')}
              </AppText>
            </Donut>
          </View>
          {incomeAll === 0 && expenseAll === 0 && savedAll === 0 ? (
            <EmptyState text={t('stats.empty')} />
          ) : (
            <View className="mt-4 rounded-xl border border-border bg-surface px-4 py-1">
              <View className={`min-h-[48px] items-center gap-3 ${align.row}`}>
                <View style={{ width: 12, height: 12 }} />
                <AppText className="flex-1 text-[15px]">{t('stats.income')}</AppText>
                <AppText weight="medium" className="text-[15px]">
                  {money.format(incomeAll)}
                </AppText>
              </View>
              {balanceRows.map((row) => (
                <View
                  key={row.key}
                  accessible
                  accessibilityLabel={`${row.label}, ${percentOf(row.value, balanceBase)}%, ${money.format(row.value)}`}
                  className={`min-h-[48px] items-center gap-3 border-t border-border ${align.row}`}>
                  <View
                    style={{
                      width: 12,
                      height: 12,
                      borderRadius: 6,
                      backgroundColor: row.color,
                    }}
                  />
                  <AppText className="flex-1 text-[15px]">{row.label}</AppText>
                  <AppText tone="muted" className="text-[14px]">
                    {percentOf(row.value, balanceBase).toFixed(1)}%
                  </AppText>
                  <AppText weight="medium" className="min-w-[76px] text-end text-[15px]">
                    {money.format(row.value)}
                  </AppText>
                </View>
              ))}
            </View>
          )}
        </>
      ) : (
        <>
          <View className="items-center">
            <Donut
              introKey={`stats.${type}`}
              slices={rows.map((r) => ({
                key: r.category_id,
                value: r.total,
                color: r.category?.color ?? '#8A9099',
              }))}>
              <AppText weight="bold" className="text-[24px]">
                {money.format(shownTotal)}
              </AppText>
              <AppText tone="muted" className="text-[13px]">
                {t(type === 'expense' ? 'stats.totalExpenses' : 'stats.totalIncome')}
              </AppText>
            </Donut>
          </View>

          {rows.length === 0 ? (
            <EmptyState text={t('stats.empty')} />
          ) : (
            <View className="mt-4 rounded-xl border border-border bg-surface px-4 py-1">
              {rows.map((row, index) => {
                const share = percentOf(row.total, total);
                return (
                  <View
                    key={row.category_id}
                    accessible
                    accessibilityLabel={`${nameOf(row.category)}, ${share}%, ${money.format(row.total)}`}
                    className={`min-h-[48px] items-center gap-3 ${align.row} ${index > 0 ? 'border-t border-border' : ''}`}>
                    <View
                      style={{
                        width: 12,
                        height: 12,
                        borderRadius: 6,
                        backgroundColor: row.category?.color ?? '#8A9099',
                      }}
                    />
                    <AppText className="flex-1 text-[15px]" numberOfLines={1}>
                      {nameOf(row.category)}
                    </AppText>
                    <AppText tone="muted" className="text-[14px]">
                      {share.toFixed(1)}%
                    </AppText>
                    <AppText weight="medium" className="min-w-[76px] text-end text-[15px]">
                      {money.format(row.total)}
                    </AppText>
                  </View>
                );
              })}
            </View>
          )}

          {change !== null && total > 0 && (
            <View className="mt-4 items-center rounded-lg bg-leaf-light px-4 py-3">
              <AppText className="text-[14px]">
                {t(view === 'monthly' ? 'stats.changeMonth' : 'stats.changeYear', {
                  change: `${change > 0 ? '+' : ''}${change}%`,
                })}
              </AppText>
            </View>
          )}
        </>
      )}
    </Screen>
  );
}
