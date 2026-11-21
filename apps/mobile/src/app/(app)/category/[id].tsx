import { amountToInput, budgetRemaining, parseAmount } from '@kaspilo/shared';
import { useLocalSearchParams } from 'expo-router';
import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { View } from 'react-native';

import { DeleteTransactionDialog } from '@/components/DeleteTransactionDialog';
import { ScreenHeader } from '@/components/ScreenHeader';
import { TransactionRow } from '@/components/TransactionRow';
import { AmountField } from '@/components/ui/AmountField';
import { AppText } from '@/components/ui/AppText';
import { BudgetBar } from '@/components/ui/BudgetBar';
import { Dialog } from '@/components/ui/Dialog';
import { Screen } from '@/components/ui/Screen';
import { EmptyState, ErrorState, Loading } from '@/components/ui/States';
import { useCategoryName, useCurrentPeriod, useMoney } from '@/data/hooks';
import type { ListedTransaction } from '@/data/outbox';
import { useCategories, useSaveCategory, useTransactions } from '@/data/queries';
import { PressScale } from '@/components/ui/PressScale';

/** One category in the current budget month: budget, and its transactions. */
export default function CategoryScreen() {
  const { t } = useTranslation();
  const { id } = useLocalSearchParams<{ id: string }>();
  const money = useMoney();
  const nameOf = useCategoryName();
  const { period } = useCurrentPeriod();
  const categories = useCategories();
  const transactions = useTransactions(period, id);
  const saveCategory = useSaveCategory();

  const [deleting, setDeleting] = useState<ListedTransaction | null>(null);
  const [editingBudget, setEditingBudget] = useState(false);
  const [budgetText, setBudgetText] = useState('');
  const [budgetError, setBudgetError] = useState<string | null>(null);

  const category = categories.data?.find((c) => c.id === id);
  const spent = (transactions.data ?? []).reduce((a, x) => a + x.amount, 0);
  const budget = category?.monthly_budget ?? null;
  const left = budget === null ? null : budgetRemaining(budget, spent);
  const over = left !== null && left < 0;

  const openBudget = () => {
    setBudgetText(budget === null ? '' : amountToInput(budget));
    setBudgetError(null);
    setEditingBudget(true);
  };

  const saveBudget = async (value: number | null) => {
    try {
      await saveCategory.mutateAsync({ id, monthly_budget: value });
      setEditingBudget(false);
    } catch {
      setBudgetError(t('common.errorGeneric'));
    }
  };

  return (
    <Screen leaves="low" scroll className="px-5 pb-8 pt-2">
      <ScreenHeader title={nameOf(category)} />

      <View className={`rounded-xl border p-4 ${over ? 'border-danger bg-danger-surface' : 'border-border bg-surface'}`}>
        <AppText tone="muted" className="text-[13px]">
          {t('category.spentThisPeriod')}
        </AppText>
        <AppText weight="bold" tone={over ? 'danger' : 'text'} className="text-[30px]">
          {money.format(spent)}
        </AppText>
        {category?.type === 'expense' && (
          <>
            {budget !== null && left !== null && (
              <View className="mb-1 mt-2 gap-2">
                <BudgetBar spent={spent} budget={budget} introKey={`category.budget.${id}`} />
                <AppText tone={over ? 'danger' : 'primary'} weight={over ? 'bold' : 'regular'} className="text-[14px]">
                  {over
                    ? t('today.overBy', { amount: money.format(-left) })
                    : t('today.leftOf', { left: money.format(left), total: money.format(budget) })}
                </AppText>
              </View>
            )}
            <PressScale
              accessibilityRole="button"
              onPress={openBudget}
              className="mt-1 min-h-[44px] justify-center">
              <AppText tone="primary" weight="medium" className="text-[15px]">
                {budget === null ? t('category.setBudget') : t('category.changeBudget')}
              </AppText>
            </PressScale>
          </>
        )}
      </View>

      <AppText weight="medium" className="mb-2 mt-5 text-[16px]">
        {t('category.transactions')}
      </AppText>
      {transactions.isLoading ? (
        <Loading />
      ) : transactions.isError ? (
        <ErrorState onRetry={() => void transactions.refetch()} />
      ) : !transactions.data ? (
        // Offline and never loaded on this phone.
        <EmptyState text={t('offline.notLoaded')} />
      ) : transactions.data.length === 0 ? (
        <EmptyState text={t('category.empty')} />
      ) : (
        <View className="gap-2">
          {transactions.data?.map((tx) => (
            <TransactionRow key={tx.id} transaction={tx} category={category} onDelete={() => setDeleting(tx)} />
          ))}
        </View>
      )}

      <DeleteTransactionDialog transaction={deleting} onClose={() => setDeleting(null)} />
      <Dialog
        visible={editingBudget}
        title={t('category.budgetTitle', { name: nameOf(category) })}
        onClose={() => setEditingBudget(false)}
        actions={[
          {
            label: t('common.save'),
            loading: saveCategory.isPending,
            onPress: () => {
              const value = parseAmount(budgetText);
              if (value === null) return setBudgetError(t('add.errors.amount'));
              void saveBudget(value);
            },
          },
          ...(budget !== null
            ? [{ label: t('category.removeBudget'), variant: 'accent' as const, onPress: () => void saveBudget(null) }]
            : []),
          { label: t('common.cancel'), variant: 'outline' as const, onPress: () => setEditingBudget(false) },
        ]}>
        <AmountField value={budgetText} onChangeText={setBudgetText} label={t('category.monthlyBudget')} autoFocus />
        {budgetError && (
          <AppText tone="danger" className="text-[14px]">
            {budgetError}
          </AppText>
        )}
      </Dialog>
    </Screen>
  );
}
