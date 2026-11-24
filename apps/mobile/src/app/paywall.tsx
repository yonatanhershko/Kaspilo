import { yearlyPerMonth, yearlySavingPercent } from '@kaspilo/shared';
import { router } from 'expo-router';
import { useCallback, useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { ActivityIndicator, View } from 'react-native';
import type { PurchasesPackage } from 'react-native-purchases';

import { useAuth } from '@/auth/AuthProvider';
import { WalletHero } from '@/components/nature/WalletHero';
import { AppText } from '@/components/ui/AppText';
import { Button } from '@/components/ui/Button';
import { Icon } from '@/components/ui/Icon';
import { PressScale } from '@/components/ui/PressScale';
import { Screen } from '@/components/ui/Screen';
import { useRowAlign } from '@/i18n';
import { trackPaywallViewed } from '@/lib/analytics';
import {
  buy,
  inStoreStyle,
  loadPlans,
  minorUnits,
  type Plans,
  purchasesAvailable,
  restore,
  trialEligible,
} from '@/lib/purchases';
import { useTheme } from '@/theme/ThemeProvider';

/** Free trial length, the same on both stores (docs/spec.md "Prices and trial"). */
const TRIAL_DAYS = 14;

type Choice = 'yearly' | 'monthly';
type Note =
  | null
  | 'cancelled'
  | 'pending'
  | 'network'
  | 'failed'
  | 'unconfirmed'
  | 'restoreNone'
  | 'loadFailed'
  | 'unavailable';

type Loaded = { plans: Plans; trial: Record<Choice, boolean> };

/** The plans and whether this store account still gets the trial on each. null = failed. */
async function fetchPlans(userId: string): Promise<Loaded | null> {
  try {
    const plans = await loadPlans(userId);
    if (!plans || (!plans.yearly && !plans.monthly)) return null;
    const [yearly, monthly] = await Promise.all([
      plans.yearly ? trialEligible(plans.yearly) : false,
      plans.monthly ? trialEligible(plans.monthly) : false,
    ]);
    return { plans, trial: { yearly, monthly } };
  } catch {
    return null;
  }
}

/**
 * Paywall (docs/spec.md "Paywall"): two plans with the store's own prices, one button that
 * opens the store's payment sheet. Access opens only after the server confirms.
 */
export default function PaywallScreen() {
  const { t } = useTranslation();
  const { row } = useRowAlign();
  const { session, access, refreshProfile } = useAuth();
  const userId = session?.user.id ?? null;

  const [plans, setPlans] = useState<Plans | null>(null);
  const [loading, setLoading] = useState(purchasesAvailable);
  const [choice, setChoice] = useState<Choice>('yearly');
  const [trial, setTrial] = useState<Record<Choice, boolean>>({ yearly: false, monthly: false });
  const [busy, setBusy] = useState<'buy' | 'restore' | null>(null);
  const [note, setNote] = useState<Note>(purchasesAvailable ? null : 'unavailable');

  useEffect(() => {
    if (userId) trackPaywallViewed(userId);
  }, [userId]);

  const apply = useCallback((result: Loaded | null) => {
    setLoading(false);
    if (!result) return setNote('loadFailed');
    setNote(null);
    setPlans(result.plans);
    setTrial(result.trial);
    if (!result.plans.yearly) setChoice('monthly');
  }, []);

  useEffect(() => {
    if (!userId || !purchasesAvailable) return;
    let alive = true;
    void fetchPlans(userId).then((result) => {
      if (alive) apply(result);
    });
    return () => {
      alive = false;
    };
  }, [userId, apply]);

  const retryLoad = () => {
    if (!userId) return;
    setLoading(true);
    setNote(null);
    void fetchPlans(userId).then(apply);
  };

  // In with access: the root index sends the user home.
  const enter = async () => {
    await refreshProfile();
    router.replace('/');
  };

  const close = () => {
    if (router.canGoBack()) router.back();
    else router.replace(access ? '/' : '/locked');
  };

  const selected: PurchasesPackage | null = plans ? plans[choice] : null;

  const purchase = async () => {
    if (!selected) return;
    setBusy('buy');
    setNote(null);
    const result = await buy(selected);
    setBusy(null);
    if (result === 'ok') return void enter();
    setNote(result);
  };

  const restoreNow = async () => {
    if (!userId) return;
    setBusy('restore');
    setNote(null);
    const result = await restore(userId);
    setBusy(null);
    if (result === 'ok') return void enter();
    setNote(result === 'none' ? 'restoreNone' : result);
  };

  const yearly = plans?.yearly?.product ?? null;
  const monthly = plans?.monthly?.product ?? null;
  const saving =
    yearly && monthly ? yearlySavingPercent(minorUnits(monthly.price), minorUnits(yearly.price)) : 0;

  const priceLine =
    choice === 'yearly' && yearly
      ? t('paywall.perYear', { price: yearly.priceString })
      : monthly
        ? t('paywall.perMonth', { price: monthly.priceString })
        : '';
  const withTrial = trial[choice];

  return (
    <Screen leaves="high" scroll className="items-center px-6 pb-8 pt-2">
      <View className={`w-full ${row}`}>
        <PressScale
          accessibilityRole="button"
          accessibilityLabel={t('common.close')}
          onPress={close}
          className="h-11 w-11 items-center justify-center">
          <Icon name="close" size={24} />
        </PressScale>
      </View>

      <WalletHero size={170} />

      <AppText weight="bold" accessibilityRole="header" className="mt-1 text-center text-[24px] leading-[32px]">
        {t('paywall.title')}
      </AppText>
      <AppText tone="muted" className="mt-1 text-center text-[15px] leading-[22px]">
        {t('paywall.subtitle')}
      </AppText>

      {loading ? (
        <View className="h-[180px] items-center justify-center">
          <ActivityIndicator accessibilityLabel={t('common.loading')} />
        </View>
      ) : plans ? (
        <View className="mt-6 w-full gap-3" accessibilityRole="radiogroup">
          {yearly && (
            <PlanCard
              selected={choice === 'yearly'}
              onPress={() => setChoice('yearly')}
              name={t('paywall.yearly')}
              badge={saving > 0 ? t('paywall.saving', { percent: saving }) : null}
              line={`${t('paywall.perYear', { price: yearly.priceString })} · ${t('paywall.perMonth', {
                price: inStoreStyle(yearly.priceString, yearlyPerMonth(minorUnits(yearly.price))),
              })}`}
            />
          )}
          {monthly && (
            <PlanCard
              selected={choice === 'monthly'}
              onPress={() => setChoice('monthly')}
              name={t('paywall.monthly')}
              badge={null}
              line={t('paywall.perMonth', { price: monthly.priceString })}
            />
          )}
        </View>
      ) : null}

      {plans && !loading && (
        <>
          <Button
            variant="line"
            label={withTrial ? t('paywall.startTrial', { days: TRIAL_DAYS }) : t('paywall.subscribe')}
            onPress={() => void purchase()}
            loading={busy === 'buy'}
            disabled={!selected || busy !== null}
            size="small"
            className="mt-6 self-center bg-surface"
          />
          <AppText tone="muted" className="mt-3 text-center text-[13px] leading-[19px]">
            {withTrial
              ? t('paywall.legalTrial', { days: TRIAL_DAYS, price: priceLine })
              : t('paywall.legal', { price: priceLine })}
          </AppText>
        </>
      )}

      {note ? (
        <View className="mt-4 w-full items-center gap-2">
          <AppText
            tone={note === 'restoreNone' || note === 'cancelled' ? 'muted' : 'danger'}
            className="text-center text-[14px] leading-[20px]"
            accessibilityLiveRegion="polite">
            {t(`paywall.notes.${note}`)}
          </AppText>
          {note === 'loadFailed' && (
            <Button label={t('common.retry')} variant="outline" onPress={retryLoad} className="self-stretch" />
          )}
        </View>
      ) : null}

      <View className="mt-5 flex-row items-center justify-center">
        <PressScale
          accessibilityRole="button"
          onPress={() => void restoreNow()}
          disabled={busy !== null || !purchasesAvailable}
          className="min-h-[44px] justify-center px-2">
          {busy === 'restore' ? (
            <ActivityIndicator />
          ) : (
            <AppText tone="primary" weight="medium" className="text-[14px]">
              {t('paywall.restore')}
            </AppText>
          )}
        </PressScale>
        <AppText tone="muted" className="text-[14px]" accessible={false}>
          ·
        </AppText>
        <PressScale
          accessibilityRole="link"
          onPress={() => router.push('/legal')}
          className="min-h-[44px] justify-center px-2">
          <AppText tone="primary" weight="medium" className="text-[14px]">
            {t('paywall.terms')}
          </AppText>
        </PressScale>
      </View>
    </Screen>
  );
}

function PlanCard({
  selected,
  onPress,
  name,
  badge,
  line,
}: {
  selected: boolean;
  onPress: () => void;
  name: string;
  badge: string | null;
  line: string;
}) {
  const { row } = useRowAlign();
  const { colors } = useTheme();
  return (
    <PressScale
      accessibilityRole="radio"
      accessibilityState={{ selected }}
      accessibilityLabel={`${name}. ${badge ? `${badge}. ` : ''}${line}`}
      onPress={onPress}
      className={`min-h-[64px] justify-center rounded-xl bg-surface px-4 py-3 ${
        selected ? 'border-2 border-primary' : 'border border-border'
      }`}>
      <View className={`${row} items-center justify-between gap-3`}>
        <View className="flex-1 gap-1">
          <View className={`${row} items-center gap-2`}>
            <AppText weight="medium" className="text-[16px]">
              {name}
            </AppText>
            {badge && (
              <View className="rounded-md bg-accent px-2 py-[2px]">
                <AppText weight="medium" tone="onAccent" className="text-[12px]">
                  {badge}
                </AppText>
              </View>
            )}
          </View>
          <AppText className="text-[14px]">{line}</AppText>
        </View>
        <Icon
          name={selected ? 'check-circle' : 'circle-outline'}
          size={22}
          color={selected ? colors.primary : colors.secondary}
        />
      </View>
    </PressScale>
  );
}
