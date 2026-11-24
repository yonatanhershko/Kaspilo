import { router } from 'expo-router';
import { useEffect, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { View } from 'react-native';

import { useAuth } from '@/auth/AuthProvider';
import { LockArt } from '@/components/nature/LockArt';
import { Sway } from '@/components/nature/Sway';
import { AppText } from '@/components/ui/AppText';
import { Button } from '@/components/ui/Button';
import { Icon } from '@/components/ui/Icon';
import { PressScale } from '@/components/ui/PressScale';
import { Screen } from '@/components/ui/Screen';
import { hasExportRows, useExportEverything } from '@/lib/lockedExport';

/**
 * Every signed-in user without access (docs/spec.md "Locked screen"): never had access,
 * or it ended. No way from here into the app except a plan. Access granted meanwhile
 * (store or admin) is picked up on return to the app, and the guard opens the app.
 */
export default function LockedScreen() {
  const { t } = useTranslation();
  const { profile, profileError, refreshProfile, signOut } = useAuth();
  const exportAll = useExportEverything();
  const [busy, setBusy] = useState<'retry' | 'export' | null>(null);
  const [message, setMessage] = useState<string | null>(null);
  const [hasData, setHasData] = useState(false);

  // Never had access (no first access date) = new; otherwise it ended.
  const kind = profileError ? 'error' : profile?.approved_at ? 'ended' : 'new';

  // Picks up access granted while this screen stays open (admin grant, a purchase on another phone).
  const refresh = useRef(refreshProfile);
  useEffect(() => {
    refresh.current = refreshProfile;
  });
  useEffect(() => {
    const timer = setInterval(() => void refresh.current(), 60_000);
    return () => clearInterval(timer);
  }, []);

  useEffect(() => {
    if (kind === 'error') return;
    let alive = true;
    void hasExportRows().then((yes) => {
      if (alive) setHasData(yes);
    });
    return () => {
      alive = false;
    };
  }, [kind]);

  const retry = async () => {
    setBusy('retry');
    setMessage(null);
    await refreshProfile();
    setBusy(null);
  };

  const runExport = async () => {
    setBusy('export');
    setMessage(null);
    try {
      const shared = await exportAll();
      if (!shared) setMessage(t('export.unavailable'));
    } catch {
      setMessage(t('export.failed'));
    }
    setBusy(null);
  };

  return (
    <Screen leaves="high" scroll className="items-center justify-center px-6 py-10">
      <Sway rotateY={16} rotateX={5} tilt={2} bob={4} duration={3000}>
        <LockArt />
      </Sway>

      <AppText weight="bold" accessibilityRole="header" className="mt-6 text-center text-[26px] leading-[34px]">
        {t(`locked.${kind}.title`)}
      </AppText>
      <AppText className="mt-3 text-center text-[16px] leading-[24px]">{t(`locked.${kind}.body`)}</AppText>

      <View className="mt-8 w-full gap-3">
        {kind === 'error' ? (
          <Button label={t('common.retry')} onPress={() => void retry()} loading={busy === 'retry'} />
        ) : (
          <>
            <Button label={t('locked.choosePlan')} onPress={() => router.push('/paywall')} />
            {hasData && (
              <Button
                variant="line"
                label={t('locked.export')}
                icon={<Icon name="tray-arrow-down" tone="primary" size={20} />}
                onPress={() => void runExport()}
                loading={busy === 'export'}
                disabled={busy !== null}
              />
            )}
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
