import { daysUntilExpiry } from '@kaspilo/shared';
import { router } from 'expo-router';
import { useTranslation } from 'react-i18next';
import { ActivityIndicator, View } from 'react-native';

import { useAuth } from '@/auth/AuthProvider';
import { ScreenHeader } from '@/components/ScreenHeader';
import { AppText } from '@/components/ui/AppText';
import { Button } from '@/components/ui/Button';
import { Icon } from '@/components/ui/Icon';
import { Screen } from '@/components/ui/Screen';
import { inBillingGrace, useStoreSubscription } from '@/data/subscription';
import { LOCALES, useLanguage } from '@/i18n';
import { openManageSubscriptions } from '@/lib/purchases';

/**
 * Opened from a renewal or billing notification, and from More (docs/spec.md "Notifications").
 * A store subscription is managed in the store; access from the admin ends on its date and
 * can be continued with a plan. Never names a payment outside the stores.
 */
export default function RenewScreen() {
  const { t } = useTranslation();
  const language = useLanguage();
  const { profile, session } = useAuth();
  const store = useStoreSubscription();
  const sub = store.data ?? null;

  const expiresAt = profile?.expires_at ?? null;
  const days = profile ? daysUntilExpiry(profile) : null;
  const date = expiresAt
    ? new Intl.DateTimeFormat(LOCALES[language], { day: 'numeric', month: 'long', year: 'numeric' }).format(
        new Date(expiresAt),
      )
    : null;

  // The store side decides only when it is what gives access now.
  const fromStore = !!sub && profile?.access_via === 'store';
  const grace = fromStore && inBillingGrace(sub);
  const renewing = fromStore && sub.will_renew && !grace;

  const headline = !date
    ? t('renew.noExpiry')
    : grace
      ? t('renew.billingIssue', { date })
      : renewing
        ? t('renew.renewsOn', { date })
        : t('renew.endsOn', { date });

  return (
    <Screen leaves="low" scroll className="gap-4 px-5 pb-8 pt-3">
      <ScreenHeader title={t('renew.title')} />

      {store.isPending && !!session ? (
        <View className="items-center py-10">
          <ActivityIndicator accessibilityLabel={t('common.loading')} />
        </View>
      ) : (
        <>
          <View className="items-center gap-2 rounded-xl border border-border bg-surface p-5">
            <Icon name={grace ? 'credit-card-off-outline' : 'calendar-clock-outline'} tone="primary" size={36} />
            <AppText weight="medium" className="text-center text-[18px] leading-[26px]">
              {headline}
            </AppText>
            {date && !renewing && days !== null && days > 0 && (
              <AppText tone="muted" className="text-center text-[15px]">
                {t('renew.daysLeft', { count: days })}
              </AppText>
            )}
          </View>

          {date &&
            (fromStore ? (
              <>
                <AppText className="text-[15px] leading-[22px]">
                  {grace ? t('renew.howBilling') : renewing ? t('renew.howStoreRenewing') : t('renew.howStore')}
                </AppText>
                <Button
                  label={t('renew.manage')}
                  onPress={() => void openManageSubscriptions(session?.user.id ?? null)}
                />
              </>
            ) : (
              <>
                <AppText className="text-[15px] leading-[22px]">{t('renew.how')}</AppText>
                <Button label={t('locked.choosePlan')} onPress={() => router.push('/paywall')} />
              </>
            ))}
        </>
      )}
    </Screen>
  );
}
