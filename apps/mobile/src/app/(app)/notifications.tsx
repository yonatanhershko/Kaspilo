import { router } from 'expo-router';
import { type ReactNode, useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { AppState, Linking, Platform, View } from 'react-native';

import { ScreenHeader } from '@/components/ScreenHeader';
import { AppText } from '@/components/ui/AppText';
import { Button } from '@/components/ui/Button';
import { Icon, type IconName } from '@/components/ui/Icon';
import { Screen } from '@/components/ui/Screen';
import { PressScale } from '@/components/ui/PressScale';
import { Loading } from '@/components/ui/States';
import { Switch } from '@/components/ui/Switch';
import { useRowAlign } from '@/i18n';
import {
  getPermission,
  type NotificationKind,
  type PermissionState,
  refreshNotifications,
  requestPermission,
  setNotificationPref,
  useNotificationPrefs,
} from '@/notifications';
import {
  isListenerEnabled,
  lastPurchaseDetectedAt,
  purchaseDetectionAvailable,
  purchaseNeedsNewerIos,
  setPurchasePref,
  usePurchasePrefs,
} from '@/purchase';

/** One switch per kind of notification. Saved on this device. */
export default function NotificationsScreen() {
  const { t } = useTranslation();
  const align = useRowAlign();
  const prefs = useNotificationPrefs();
  const [permission, setPermission] = useState<PermissionState | null>(null);
  const purchase = usePurchasePrefs();
  // Android: set up = Kaspilo is on under "Notification access" (may change in the phone settings).
  const [listenerOn, setListenerOn] = useState(isListenerEnabled);
  const purchaseReady =
    Platform.OS === 'android' ? listenerOn : purchase.setupDone || lastPurchaseDetectedAt() !== null;

  // The user may change the permission in the phone settings and come back.
  useEffect(() => {
    let alive = true;
    const read = () => {
      void getPermission().then((state) => alive && setPermission(state));
      setListenerOn(isListenerEnabled());
    };
    read();
    const sub = AppState.addEventListener('change', (state) => {
      if (state === 'active') read();
    });
    return () => {
      alive = false;
      sub.remove();
    };
  }, []);

  const allow = async () => {
    setPermission(await requestPermission());
    await refreshNotifications();
  };

  const item = (
    icon: IconName,
    key: NotificationKind | 'purchase',
    control: { value: boolean; onChange?: (next: boolean) => void; end?: ReactNode; below?: ReactNode },
  ) => (
    <View className={`min-h-[76px] items-center gap-3 px-4 py-3 ${align.row}`}>
      <Icon name={icon} tone="primary" />
      <View className="flex-1 gap-0.5">
        <View className={`items-center gap-2 ${align.row}`}>
          <AppText weight="medium" className="text-[16px]">
            {t(`notifications.${key}.title`)}
          </AppText>
          {/* "Soon" sits by the title as a tag, so it never reads as part of the sentence below. */}
          {!control.onChange && !control.end && !control.below && (
            <View className="rounded-full border border-border px-2 py-0.5">
              <AppText tone="muted" className="text-[12px]">
                {t('notifications.soon')}
              </AppText>
            </View>
          )}
        </View>
        <AppText tone="muted" className="text-[13px] leading-[19px]">
          {t(`notifications.${key}.body`)}
        </AppText>
        {control.below}
      </View>
      {control.end}
      {control.onChange && (
        <Switch
          label={t(`notifications.${key}.title`)}
          value={control.value}
          onValueChange={control.onChange}
        />
      )}
    </View>
  );

  // "Purchase detected" (docs/spec.md): "Soon" on builds without it, "Set up" until the guide is
  // done on this phone, then a switch like the others with a way back to the guide.
  const openSetup = () => router.push('/purchase-setup');
  const purchaseControl = () => {
    if (!purchaseDetectionAvailable) return { value: false };
    if (purchaseNeedsNewerIos) {
      return {
        value: false,
        below: (
          <AppText tone="muted" className="text-[13px] leading-[19px]">
            {t('notifications.purchase.needsIos')}
          </AppText>
        ),
      };
    }
    if (!purchaseReady) {
      return {
        value: false,
        end: (
          <PressScale
            accessibilityRole="button"
            accessibilityLabel={t('notifications.purchase.setUp')}
            onPress={openSetup}
            className="min-h-[44px] justify-center rounded-full bg-primary px-4">
            <AppText weight="medium" tone="onPrimary" className="text-[14px]">
              {t('notifications.purchase.setUp')}
            </AppText>
          </PressScale>
        ),
      };
    }
    return {
      value: purchase.enabled,
      onChange: (next: boolean) => void setPurchasePref(next),
      below: (
        <PressScale accessibilityRole="button" accessibilityLabel={t('notifications.purchase.guide')} onPress={openSetup} className="min-h-[32px] justify-center">
          <AppText weight="medium" tone="primary" className="text-[13px]">
            {t('notifications.purchase.guide')}
          </AppText>
        </PressScale>
      ),
    };
  };

  const notice = (title: string, body: string, action: { label: string; onPress: () => void }) => (
    <View className="gap-3 rounded-xl border border-border bg-surface p-4" accessibilityRole="alert">
      <View className={`items-center gap-3 ${align.row}`}>
        <Icon name="bell-off-outline" tone="primary" />
        <AppText weight="medium" className="flex-1 text-[16px]">
          {title}
        </AppText>
      </View>
      <AppText tone="muted" className="text-[14px] leading-[20px]">
        {body}
      </AppText>
      <Button label={action.label} onPress={action.onPress} />
    </View>
  );

  return (
    <Screen leaves="low" scroll className="gap-4 px-5 pb-8 pt-3">
      <ScreenHeader title={t('notifications.title')} />

      {permission === null ? (
        <Loading />
      ) : (
        <>
          <AppText tone="muted" className="text-[14px] leading-[20px]">
            {t('notifications.intro')}
          </AppText>

          {permission === 'denied' &&
            notice(t('notifications.off.title'), t('notifications.off.body'), {
              label: t('notifications.off.openSettings'),
              onPress: () => void Linking.openSettings(),
            })}
          {permission === 'undetermined' &&
            notice(t('notifications.notAsked.title'), t('notifications.notAsked.body'), {
              label: t('notifications.notAsked.allow'),
              onPress: () => void allow(),
            })}
          {permission === 'unsupported' && (
            <AppText tone="muted" className="text-[14px]">
              {t('notifications.unsupported')}
            </AppText>
          )}

          <View className="overflow-hidden rounded-xl border border-border bg-surface">
            {item('calendar-clock-outline', 'subscription', {
              value: prefs.subscription,
              onChange: (next) => void setNotificationPref('subscription', next),
            })}
            <View className="border-t border-border">
              {item('sprout-outline', 'inactivity', {
                value: prefs.inactivity,
                onChange: (next) => void setNotificationPref('inactivity', next),
              })}
            </View>
            <View className={`border-t border-border ${purchaseDetectionAvailable ? '' : 'opacity-60'}`}>
              {item('contactless-payment', 'purchase', purchaseControl())}
            </View>
          </View>
        </>
      )}
    </Screen>
  );
}
