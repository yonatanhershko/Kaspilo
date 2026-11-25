import type { Goal, GoalDeposit } from '@kaspilo/shared';
import { useTranslation } from 'react-i18next';
import { View } from 'react-native';

import { useDateFormat, useMoney } from '@/data/hooks';
import { useRowAlign } from '@/i18n';
import { useTheme } from '@/theme/ThemeProvider';

import { AppText } from './ui/AppText';
import { CategoryIcon, Icon } from './ui/Icon';
import { PressScale } from '@/components/ui/PressScale';

/**
 * One goal deposit in history. Not an expense: it is labeled "Savings", or "Already saved"
 * for money saved before (not part of the balance). Trash deletes just this deposit.
 */
export function DepositRow({
  deposit,
  goal,
  onDelete,
}: {
  deposit: GoalDeposit;
  goal: Goal | undefined;
  onDelete: () => void;
}) {
  const { t } = useTranslation();
  const align = useRowAlign();
  const money = useMoney();
  const { colors } = useTheme();
  const { dayMonthShort } = useDateFormat();
  const name = goal?.name ?? t('goals.savings');
  const label = deposit.source === 'existing' ? t('goals.alreadySaved') : t('goals.savings');

  return (
    <View className={`items-center rounded-lg border border-border bg-surface ${align.row}`}>
      <View
        accessible
        accessibilityLabel={`${label}: ${name}, ${money.format(deposit.amount)}, ${dayMonthShort(deposit.date)}`}
        className={`min-h-[60px] flex-1 items-center gap-3 py-2 ${align.row} ${align.he ? 'pr-3' : 'pl-3'}`}>
        <CategoryIcon icon={goal?.icon ?? 'piggy-bank'} color={colors.primary} size={38} classic />
        <View className="flex-1">
          <AppText className="text-[15px]" numberOfLines={1}>
            {name}
          </AppText>
          <AppText tone="muted" className="text-[12px]">
            {dayMonthShort(deposit.date)} · {label}
          </AppText>
        </View>
        <AppText weight="medium" tone="primary" className="text-[15px]">
          {money.format(deposit.amount)}
        </AppText>
      </View>
      <PressScale
        accessibilityRole="button"
        accessibilityLabel={`${t('common.delete')}: ${name}`}
        onPress={onDelete}
        className="h-[60px] w-11 items-center justify-center">
        <Icon name="trash-can-outline" size={20} tone="muted" />
      </PressScale>
    </View>
  );
}
