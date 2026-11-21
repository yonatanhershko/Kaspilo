import { advisorWhatsAppUrl } from '@kaspilo/shared';
import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Linking, View } from 'react-native';

import { useAuth } from '@/auth/AuthProvider';
import { LockArt } from '@/components/nature/LockArt';
import { Sway } from '@/components/nature/Sway';
import { AppText } from '@/components/ui/AppText';
import { Button } from '@/components/ui/Button';
import { Screen } from '@/components/ui/Screen';
import { supabase } from '@/lib/supabase';
import { PressScale } from '@/components/ui/PressScale';

/**
 * Shown to every signed-in user without access: waiting for approval, rejected, or expired. No way from here into the app.
 */
export default function LockedScreen() {
  const { t } = useTranslation();
  const { profile, profileError, refreshProfile, signOut } = useAuth();
  const [busy, setBusy] = useState<'check' | 'ask' | null>(null);
  const [message, setMessage] = useState<string | null>(null);

  const status = profile?.status ?? 'pending_approval';
  // 'active' can only reach this screen when the expiry date has just passed.
  const kind = profileError
    ? 'error'
    : status === 'rejected'
      ? 'rejected'
      : status === 'expired' || status === 'active'
        ? 'expired'
        : 'pending';

  const check = async () => {
    setBusy('check');
    setMessage(null);
    await refreshProfile();
    setBusy(null);
    // If access was granted, the guard has already left this screen.
    setMessage(t('locked.stillLocked'));
  };

  const askAgain = async () => {
    setBusy('ask');
    setMessage(null);
    const { error } = await supabase.rpc('request_approval');
    if (error) setMessage(t('common.errorGeneric'));
    await refreshProfile();
    setBusy(null);
  };

  const contact = async () => {
    const text = t('locked.whatsappMessage', {
      name: profile?.full_name || '',
      email: profile?.email || '',
    });
    try {
      await Linking.openURL(advisorWhatsAppUrl(text));
    } catch {
      setMessage(t('locked.whatsappFailed'));
    }
  };

  return (
    <Screen leaves="high" scroll className="items-center justify-center px-6 py-10">
      <Sway rotateY={16} rotateX={5} tilt={2} bob={4} duration={3000}>
        <LockArt />
      </Sway>

      <AppText weight="bold" className="mt-6 text-center text-[26px] leading-[34px]">
        {t(`locked.${kind}.title`)}
      </AppText>
      <AppText className="mt-3 text-center text-[16px] leading-[24px]">
        {t(`locked.${kind}.body`)}
      </AppText>

      <View className="mt-8 w-full gap-3">
        {kind === 'error' ? (
          <Button label={t('common.retry')} onPress={check} loading={busy === 'check'} />
        ) : (
          <>
            <Button label={t('locked.contactAdvisor')} onPress={contact} />
            {kind === 'rejected' && (
              <Button
                label={t('locked.askAgain')}
                variant="accent"
                onPress={askAgain}
                loading={busy === 'ask'}
              />
            )}
            <Button
              label={t('locked.checkAgain')}
              variant="outline"
              onPress={check}
              loading={busy === 'check'}
            />
          </>
        )}
      </View>

      {message ? (
        <AppText tone="muted" className="mt-4 text-center text-[14px]" accessibilityLiveRegion="polite">
          {message}
        </AppText>
      ) : null}

      <PressScale
        accessibilityRole="button"
        onPress={() => void signOut()}
        className="mt-6 min-h-[44px] justify-center">
        <AppText tone="primary" weight="medium" className="text-[15px]">
          {t('auth.signOut')}
        </AppText>
      </PressScale>
    </Screen>
  );
}
