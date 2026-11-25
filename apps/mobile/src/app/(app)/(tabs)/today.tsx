import { budgetRemaining, type Category, percentOf, periodBalance } from '@kaspilo/shared';
import { router } from 'expo-router';
import { useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { RefreshControl, ScrollView, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { Backdrop } from '@/components/nature/Backdrop';
import { LeafBackground } from '@/components/nature/LeafBackground';
import { AppText } from '@/components/ui/AppText';
import { BudgetBar } from '@/components/ui/BudgetBar';
import { PressScale } from '@/components/ui/PressScale';
import { useTabBarHeight } from '@/components/ui/TabBarHeight';
import { CategoryIcon, Icon } from '@/components/ui/Icon';
import { EmptyState, ErrorState, Loading } from '@/components/ui/States';
import { useCategoryName, useCurrentPeriod, useDateFormat, useMoney } from '@/data/hooks';
import { useCategories, useCategoryTotals, useGoalDepositsInPeriod, useGoals } from '@/data/queries';
import { useOutbox } from '@/data/outbox';
import { useWallet } from '@/data/walletContext';
import { WalletSwitcher } from '@/components/wallet/WalletSwitcher';
import { BillingIssueBar } from '@/components/BillingIssueBar';
import { type QuickNote, QuickExpenses, QuickNoteToast } from '@/components/QuickExpenses';
import { useRowAlign } from '@/i18n';
import { useTheme } from '@/theme/ThemeProvider';
import { useCountUp } from '@/lib/useCountUp';
import { introPlayed, markIntroPlayed } from '@/lib/launchIntro';
import { StaggerIn, staggerDelay, STAGGER_ITEM_MS } from '@/components/ui/StaggerIn';
import { useReducedMotion } from 'react-native-reanimated';

export default function TodayScreen() {
  const { t } = useTranslation();
  const align = useRowAlign();
  const { colors, theme } = useTheme();
  const tabBarHeight = useTabBarHeight();
  const insets = useSafeAreaInsets();
  const money = useMoney();
  const nameOf = useCategoryName();
  const { dayMonth } = useDateFormat();
  const { period, today } = useCurrentPeriod();
  const { wallet } = useWallet();
  const categories = useCategories();
  const totals = useCategoryTotals(period);
  const goals = useGoals();
  const deposits = useGoalDepositsInPeriod(period);
  // Added offline and refused by the server: the user must retry or delete them (History).
  const rejected = useOutbox().filter((x) => x.wallet_id === wallet.id && x.state === 'rejected').length;

  const [note, setNote] = useState<QuickNote | null>(null);

  const loading = categories.isLoading || totals.isLoading;
  const failed = categories.isError || totals.isError;
  const refetch = () => {
    void categories.refetch();
    void totals.refetch();
    void goals.refetch();
    void deposits.refetch();
  };

  const spentBy = new Map((totals.data ?? []).filter((x) => x.type === 'expense').map((x) => [x.category_id, x.total]));
  const incomeBy = new Map((totals.data ?? []).filter((x) => x.type === 'income').map((x) => [x.category_id, x.total]));
  const totalExpense = [...spentBy.values()].reduce((a, b) => a + b, 0);
  const totalIncome = (totals.data ?? []).filter((x) => x.type === 'income').reduce((a, x) => a + x.total, 0);
  const totalSaved = [...(deposits.data?.values() ?? [])].reduce((a, b) => a + b, 0);
  const balance = periodBalance(totalIncome, totalSaved, totalExpense);
  // Amounts count up once per app launch (2 s at most), then show at once. They start
  // only when all their data is in, so the count never heads for a half-loaded number.
  const amountsReady = totals.isSuccess && deposits.isSuccess;
  const shownExpense = useCountUp(amountsReady ? totalExpense : 0, 'today.expense');
  const shownBalance = useCountUp(amountsReady ? balance : 0, 'today.balance');
  const overall = wallet.overall_budget;
  const overallLeft = overall === null ? null : budgetRemaining(overall, totalExpense);

  // Show a category when it has spending this period or a budget to track.
  const cards = (categories.data ?? [])
    .filter((c) => c.type === 'expense')
    .filter((c) => (spentBy.get(c.id) ?? 0) > 0 || (c.monthly_budget !== null && !c.archived));

  const incomeCards = (categories.data ?? [])
    .filter((c) => c.type === 'income' && (incomeBy.get(c.id) ?? 0) > 0)
    .sort((a, b) => (incomeBy.get(b.id) ?? 0) - (incomeBy.get(a.id) ?? 0));

  // Goals that got money this period. Shown apart: deposits are never expenses.
  const depositCards = (goals.data ?? [])
    .map((g) => ({ goal: g, amount: deposits.data?.get(g.id) ?? 0 }))
    .filter((d) => d.amount > 0);

  // Cards come in one after another, only the first time home shows after launch
  // (docs/spec.md "home cards intro"). Later mounts (wallet switch, new card) show at once.
  const reduceMotion = useReducedMotion();
  const [playCards, setPlayCards] = useState(() => !reduceMotion && !introPlayed('today.cards'));
  const cardCount = cards.length + depositCards.length + incomeCards.length;
  const cardsShown = !loading && !failed && cardCount > 0;
  useEffect(() => {
    if (!playCards || !cardsShown) return;
    markIntroPlayed('today.cards');
    const done = setTimeout(
      () => setPlayCards(false),
      staggerDelay(cardCount - 1, cardCount) + STAGGER_ITEM_MS + 100,
    );
    return () => clearTimeout(done);
    // Ends once; a count change while it plays must not restart the timer.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [playCards, cardsShown]);
  const stagger = (index: number) => ({ index, count: cardCount, play: playCards });

  return (
    <View className="flex-1 bg-background">
      <Backdrop theme={theme} />
      <LeafBackground density="medium" topCorner />
      <View
        style={{
          flex: 1,
          paddingTop: insets.top,
          paddingLeft: insets.left,
          paddingRight: insets.right,
          paddingBottom: tabBarHeight,
        }}>
        <ScrollView
          contentContainerClassName="px-5 pb-8"
          showsVerticalScrollIndicator={false}
          refreshControl={<RefreshControl refreshing={false} onRefresh={refetch} tintColor={colors.primary} />}>
          <View className="min-h-[44px] flex-row items-center justify-between gap-2">
            <WalletSwitcher />
            <PressScale
              accessibilityRole="button"
              accessibilityLabel={t('notifications.title')}
              className="h-11 w-11 items-center justify-center"
              onPress={() => router.push('/notifications')}>
              <Icon name="bell-outline" size={24} tone="primary" />
            </PressScale>
          </View>

          <View className="items-center">
            <AppText weight="medium" className="text-[20px]">
              {dayMonth(today)}
            </AppText>
            <AppText tone="muted" className="text-[15px]">
              {t('today.totalExpenses')}
            </AppText>
            <AppText weight="bold" className="text-[42px] leading-[52px]">
              {money.format(shownExpense)}
            </AppText>
            {overall !== null && overallLeft !== null && (
              <AppText
                tone={overallLeft < 0 ? 'danger' : 'primary'}
                weight={overallLeft < 0 ? 'bold' : 'regular'}
                className="text-[14px]">
                {overallLeft < 0
                  ? t('today.overBy', { amount: money.format(-overallLeft) })
                  : t('today.leftOf', {
                      left: money.format(overallLeft),
                      total: money.format(overall),
                    })}
              </AppText>
            )}
            {(totalIncome > 0 || totalSaved > 0) && (
              <View className={`mt-1 gap-1.5 ${align.row}`}>
                <AppText weight="medium" className="text-[15px]">
                  {t('today.balanceThisPeriod')}
                </AppText>
                <AppText weight="medium" className="text-[15px]">
                  {money.format(shownBalance)}
                </AppText>
              </View>
            )}
          </View>

          {rejected > 0 && (
            <PressScale
              accessibilityRole="button"
              onPress={() => router.push('/history')}
              className={`mt-3 min-h-[44px] items-center gap-2 rounded-lg border border-accent bg-surface px-3 ${align.row}`}>
              <Icon name="cloud-alert" size={18} tone="primary" />
              <AppText className="flex-1 text-[14px]">{t('offline.rejectedLine', { count: rejected })}</AppText>
              <Icon name={align.he ? 'chevron-left' : 'chevron-right'} size={20} tone="muted" />
            </PressScale>
          )}

          <BillingIssueBar />

          <View className="mt-4 flex-row gap-3">
            <PressScale
              accessibilityRole="button"
              accessibilityLabel={t('today.addExpense')}
              className="min-h-[64px] flex-1 flex-row items-center justify-center gap-2 rounded-xl bg-accent active:opacity-80"
              onPress={() => router.push({ pathname: '/add', params: { type: 'expense' } })}>
              <Icon name="arrow-down" tone="onAccent" />
              <AppText weight="bold" tone="onAccent" className="text-[19px]">
                {t('common.expense')}
              </AppText>
            </PressScale>
            <PressScale
              accessibilityRole="button"
              accessibilityLabel={t('today.addIncome')}
              className="min-h-[64px] flex-1 flex-row items-center justify-center gap-2 rounded-xl bg-primary active:opacity-80"
              onPress={() => router.push({ pathname: '/add', params: { type: 'income' } })}>
              <Icon name="arrow-up" tone="onPrimary" />
              <AppText weight="bold" tone="onPrimary" className="text-[19px]">
                {t('common.income')}
              </AppText>
            </PressScale>
          </View>

          <QuickExpenses categories={categories.data} onNote={setNote} />

          <AppText weight="medium" className="mb-2 mt-6 text-[17px]">
            {t('today.categoriesThisPeriod')}
          </AppText>

          {loading ? (
            <Loading />
          ) : failed ? (
            <ErrorState onRetry={refetch} />
          ) : cards.length === 0 ? (
            <EmptyState text={t('today.empty')} />
          ) : (
            <View className="gap-3">
              {cards.map((category, i) => (
                <StaggerIn key={category.id} {...stagger(i)}>
                  <CategoryCard category={category} spent={spentBy.get(category.id) ?? 0} />
                </StaggerIn>
              ))}
            </View>
          )}

          {depositCards.length > 0 && (
            <>
              <AppText weight="medium" className="mb-2 mt-6 text-[17px]">
                {t('today.depositsThisPeriod')}
              </AppText>
              <View className="gap-3">
                {depositCards.map(({ goal, amount }, i) => (
                  <StaggerIn key={goal.id} {...stagger(cards.length + i)}>
                    <SummaryCard
                      name={goal.name}
                      icon={goal.icon}
                      classicIcon
                      color={colors.primary}
                      amount={amount}
                      onPress={() => router.push('/goals')}
                    />
                  </StaggerIn>
                ))}
              </View>
            </>
          )}

          {incomeCards.length > 0 && (
            <>
              <AppText weight="medium" className="mb-2 mt-6 text-[17px]">
                {t('today.incomeSection')}
              </AppText>
              <View className="gap-3">
                {incomeCards.map((category, i) => (
                  <StaggerIn key={category.id} {...stagger(cards.length + depositCards.length + i)}>
                    <SummaryCard
                      name={nameOf(category)}
                      icon={category.icon}
                      color={category.color}
                      amount={incomeBy.get(category.id) ?? 0}
                      onPress={() => router.push({ pathname: '/category/[id]', params: { id: category.id } })}
                    />
                  </StaggerIn>
                ))}
              </View>
            </>
          )}
        </ScrollView>
      </View>
      {note && <QuickNoteToast note={note} bottom={tabBarHeight + 12} onDone={() => setNote(null)} />}
    </View>
  );
}

/** A plain card: icon, name, one amount. Used for deposits and income. */
function SummaryCard({
  name,
  icon,
  color,
  amount,
  onPress,
  classicIcon = false,
}: {
  name: string;
  icon: string;
  color: string;
  amount: number;
  onPress: () => void;
  /** Goals keep the Material icons (the hand-drawn set has no goal pictures yet). */
  classicIcon?: boolean;
}) {
  const money = useMoney();
  const align = useRowAlign();
  return (
    <PressScale
      accessibilityRole="button"
      accessibilityLabel={`${name}, ${money.format(amount)}`}
      onPress={onPress}
      className={`items-center gap-3 rounded-xl border border-border bg-surface p-3 active:opacity-80 ${align.row}`}>
      <CategoryIcon icon={icon} color={color} classic={classicIcon} />
      <View className="flex-1">
        <AppText weight="medium" className="text-[17px]" numberOfLines={1}>
          {name}
        </AppText>
        <AppText tone="muted" className="text-[14px]">
          {money.format(amount)}
        </AppText>
      </View>
    </PressScale>
  );
}

function CategoryCard({ category, spent }: { category: Category; spent: number }) {
  const { t } = useTranslation();
  const money = useMoney();
  const nameOf = useCategoryName();
  const align = useRowAlign();
  const budget = category.monthly_budget;
  const left = budget === null ? null : budgetRemaining(budget, spent);
  const over = left !== null && left < 0;
  const name = nameOf(category);

  const summary =
    budget === null
      ? `${name}, ${money.format(spent)}`
      : over
        ? `${name}, ${t('today.spentOf', { spent: money.format(spent), budget: money.format(budget) })}, ${t('today.overBy', { amount: money.format(-(left as number)) })}`
        : `${name}, ${t('today.spentOf', { spent: money.format(spent), budget: money.format(budget) })}, ${percentOf(spent, budget)}%`;

  return (
    <PressScale
      accessibilityRole="button"
      accessibilityLabel={summary}
      onPress={() => router.push({ pathname: '/category/[id]', params: { id: category.id } })}
      className={`rounded-xl border p-3 active:opacity-80 ${
        over ? 'border-danger bg-danger-surface' : 'border-border bg-surface'
      }`}>
      <View className={`items-center gap-3 ${align.row}`}>
        <CategoryIcon icon={category.icon} color={category.color} />
        <View className="flex-1">
          <AppText
            weight="medium"
            tone={over ? 'danger' : 'text'}
            className="text-[17px]"
            numberOfLines={1}>
            {name}
          </AppText>
          <AppText tone={over ? 'danger' : 'muted'} className="text-[14px]">
            {budget === null
              ? money.format(spent)
              : t('today.spentOf', {
                  spent: money.format(spent),
                  budget: money.format(budget),
                })}
          </AppText>
        </View>
        {left !== null && (
          <AppText tone={over ? 'danger' : 'primary'} weight={over ? 'bold' : 'regular'} className="text-[12px]">
            {over
              ? t('today.overBy', { amount: money.format(-left) })
              : t('today.left', { amount: money.format(left) })}
          </AppText>
        )}
      </View>
      {budget !== null && (
        <View className="mt-3">
          <BudgetBar spent={spent} budget={budget} introKey={`today.budget.${category.id}`} />
        </View>
      )}
    </PressScale>
  );
}
