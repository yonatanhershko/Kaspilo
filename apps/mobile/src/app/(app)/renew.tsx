import { advisorWhatsAppUrl, daysUntilExpiry } from '@kaspilo/shared';
import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Linking, View } from 'react-native';

import { useAuth } from '@/auth/AuthProvider';
import { ScreenHeader } from '@/components/ScreenHeader';
import { AppText } from '@/components/ui/AppText';
import { Button } from '@/components/ui/Button';
import { Icon } from '@/components/ui/Icon';
import { Screen } from '@/components/ui/Screen';
import { LOCALES, useLanguage } from '@/i18n';

/** Opened from a renewal notification: when access ends, and how to renew. */
export default function RenewScreen() {
  const { t } = useTranslation();
  const language = useLanguage();
  const { profile } = useAuth();
  const [failed, setFailed] = useState(false);

  const expiresAt = profile?.expires_at ?? null;
  const days = profile ? daysUntilExpiry(profile) : null;
  const date = expiresAt
    ? new Intl.DateTimeFormat(LOCALES[language], {
        day: 'numeric',
        month: 'long',
        year: 'numeric',
      }).format(new Date(expiresAt))
    : null;

  const contact = async () => {
    setFailed(false);
    const text = t('renew.whatsappMessage', {
      name: profile?.full_name || '',
      email: profile?.email || '',
    });
    try {
      await Linking.openURL(advisorWhatsAppUrl(text));
    } catch {
      setFailed(true);
    }
  };

  return (
    <Screen leaves="low" scroll className="gap-4 px-5 pb-8 pt-3">
      <ScreenHeader title={t('renew.title')} />

      <View className="items-center gap-2 rounded-xl border border-border bg-surface p-5">
        <Icon name="calendar-clock-outline" tone="primary" size={36} />
        {date ? (
          <>
            <AppText weight="medium" className="text-center text-[18px] leading-[26px]">
              {t('renew.endsOn', { date })}
            </AppText>
            {days !== null && days > 0 && (
              <AppText tone="muted" className="text-center text-[15px]">
                {t('renew.daysLeft', { count: days })}
              </AppText>
            )}
          </>
        ) : (
          <AppText weight="medium" className="text-center text-[18px] leading-[26px]">
            {t('renew.noExpiry')}
          </AppText>
        )}
      </View>

      {date && (
        <>
          <AppText className="text-[15px] leading-[22px]">{t('renew.how')}</AppText>
          <Button label={t('renew.contact')} onPress={() => void contact()} />
          {failed && (
            <AppText tone="danger" className="text-[14px]" accessibilityRole="alert">
              {t('locked.whatsappFailed')}
            </AppText>
          )}
        </>
      )}
    </Screen>
  );
}
