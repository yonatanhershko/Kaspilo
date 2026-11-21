import { amountToInput, type Category, parseAmount, type TransactionType } from '@kaspilo/shared';
import { categoryPalette } from '@kaspilo/tokens';
import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { View } from 'react-native';

import { CategoryForm } from '@/components/CategoryGrid';
import { ScreenHeader } from '@/components/ScreenHeader';
import { AmountField } from '@/components/ui/AmountField';
import { AppText } from '@/components/ui/AppText';
import { Button } from '@/components/ui/Button';
import { Dialog } from '@/components/ui/Dialog';
import { CategoryIcon, Icon } from '@/components/ui/Icon';
import { Screen } from '@/components/ui/Screen';
import { Segmented } from '@/components/ui/Segmented';
import { ErrorState, Loading } from '@/components/ui/States';
import { useCategoryName, useMoney } from '@/data/hooks';
import { useCategories, useRemoveCategory, useSaveCategory } from '@/data/queries';
import { useRowAlign } from '@/i18n';
import { PressScale } from '@/components/ui/PressScale';
import { saveErrorKey } from '@/lib/network';

type Draft = { id?: string; name: string; icon: string; color: string; budget: string };

/** Add, rename, restyle, budget, reorder and remove categories, per type. */
export default function CategoriesScreen() {
  const { t } = useTranslation();
  const align = useRowAlign();
  const money = useMoney();
  const nameOf = useCategoryName();
  const categories = useCategories();
  const save = useSaveCategory();
  const remove = useRemoveCategory();

  const [type, setType] = useState<TransactionType>('expense');
  const [draft, setDraft] = useState<Draft | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [removing, setRemoving] = useState<Category | null>(null);

  const list = (categories.data ?? []).filter((c) => c.type === type && !c.archived);

  const openNew = () => {
    setError(null);
    setDraft({ name: '', icon: 'tag', color: categoryPalette[list.length % categoryPalette.length], budget: '' });
  };
  const openEdit = (c: Category) => {
    setError(null);
    setDraft({
      id: c.id,
      name: nameOf(c),
      icon: c.icon,
      color: c.color,
      budget: c.monthly_budget === null ? '' : amountToInput(c.monthly_budget),
    });
  };

  const submit = async () => {
    if (!draft) return;
    const name = draft.name.trim();
    if (name.length === 0) return setError(t('categories.nameRequired'));
    const budget = draft.budget === '' ? null : parseAmount(draft.budget);
    if (draft.budget !== '' && budget === null) return setError(t('add.errors.amount'));
    try {
      await save.mutateAsync({
        id: draft.id,
        type,
        name,
        icon: draft.icon,
        color: draft.color,
        ...(type === 'expense' ? { monthly_budget: budget } : {}),
        ...(draft.id ? {} : { sort_order: (list[list.length - 1]?.sort_order ?? 0) + 1 }),
      });
      setDraft(null);
    } catch (e) {
      setError(t(saveErrorKey(e)));
    }
  };

  /** Swap this category with its neighbor. */
  const move = async (index: number, direction: -1 | 1) => {
    const a = list[index];
    const b = list[index + direction];
    if (!a || !b) return;
    // Give both an explicit, distinct position even if they were equal before.
    await Promise.all([
      save.mutateAsync({ id: a.id, sort_order: index + direction + 1 }),
      save.mutateAsync({ id: b.id, sort_order: index + 1 }),
    ]).catch(() => undefined);
  };

  return (
    <Screen leaves="low" scroll className="px-5 pb-8 pt-2">
      <ScreenHeader title={t('more.categories')} />
      <Segmented
        value={type}
        onChange={setType}
        options={[
          { value: 'expense', label: t('stats.expenses') },
          { value: 'income', label: t('stats.income') },
        ]}
      />

      <View className="mt-4 gap-2">
        {categories.isLoading ? (
          <Loading />
        ) : categories.isError ? (
          <ErrorState onRetry={() => void categories.refetch()} />
        ) : (
          list.map((category, index) => (
            <View key={category.id} className={`items-center rounded-lg border border-border bg-surface ${align.row} ${align.he ? 'pr-3' : 'pl-3'}`}>
              <PressScale
                accessibilityRole="button"
                accessibilityLabel={`${nameOf(category)}. ${t('common.edit')}`}
                onPress={() => openEdit(category)}
                className={`min-h-[60px] flex-1 items-center gap-3 py-2 ${align.row}`}>
                <CategoryIcon icon={category.icon} color={category.color} size={38} />
                <View className="flex-1">
                  <AppText className="text-[16px]" numberOfLines={1}>
                    {nameOf(category)}
                  </AppText>
                  {category.monthly_budget !== null && (
                    <AppText tone="muted" className="text-[12px]">
                      {t('categories.budgetLine', { amount: money.format(category.monthly_budget) })}
                    </AppText>
                  )}
                </View>
              </PressScale>
              <PressScale
                accessibilityRole="button"
                accessibilityLabel={t('categories.moveUp', { name: nameOf(category) })}
                disabled={index === 0}
                onPress={() => void move(index, -1)}
                className={`h-11 w-10 items-center justify-center ${index === 0 ? 'opacity-25' : ''}`}>
                <Icon name="arrow-up" size={18} tone="muted" />
              </PressScale>
              <PressScale
                accessibilityRole="button"
                accessibilityLabel={t('categories.moveDown', { name: nameOf(category) })}
                disabled={index === list.length - 1}
                onPress={() => void move(index, 1)}
                className={`h-11 w-10 items-center justify-center ${index === list.length - 1 ? 'opacity-25' : ''}`}>
                <Icon name="arrow-down" size={18} tone="muted" />
              </PressScale>
              <PressScale
                accessibilityRole="button"
                accessibilityLabel={`${t('common.delete')}: ${nameOf(category)}`}
                onPress={() => setRemoving(category)}
                className="h-11 w-11 items-center justify-center">
                <Icon name="trash-can-outline" size={20} tone="muted" />
              </PressScale>
            </View>
          ))
        )}
      </View>

      <Button label={t('categories.add')} onPress={openNew} className="mt-4" />

      <Dialog
        visible={!!draft}
        title={draft?.id ? t('categories.edit') : t('categories.add')}
        onClose={() => setDraft(null)}
        actions={[
          { label: t('common.save'), onPress: submit, loading: save.isPending },
          { label: t('common.cancel'), variant: 'outline', onPress: () => setDraft(null) },
        ]}>
        {draft && (
          <>
            <CategoryForm
              name={draft.name}
              icon={draft.icon}
              color={draft.color}
              error={error}
              onChange={(patch) => setDraft({ ...draft, ...patch })}
            />
            {type === 'expense' && (
              <View>
                <AppText tone="muted" className="mb-1 text-[13px]">
                  {t('category.monthlyBudgetOptional')}
                </AppText>
                <AmountField
                  value={draft.budget}
                  onChangeText={(budget) => setDraft({ ...draft, budget })}
                  label={t('category.monthlyBudget')}
                  size="normal"
                />
              </View>
            )}
          </>
        )}
      </Dialog>

      <Dialog
        visible={!!removing}
        title={t('categories.removeTitle', { name: nameOf(removing ?? undefined) })}
        onClose={() => setRemoving(null)}
        actions={[
          {
            label: t('common.delete'),
            variant: 'accent',
            loading: remove.isPending,
            onPress: async () => {
              if (removing) await remove.mutateAsync(removing.id).catch(() => undefined);
              setRemoving(null);
            },
          },
          { label: t('common.cancel'), variant: 'outline', onPress: () => setRemoving(null) },
        ]}>
        <AppText className="text-[15px]">{t('categories.removeBody')}</AppText>
      </Dialog>
    </Screen>
  );
}
