import { type ReactNode } from 'react';
import { useTranslation } from 'react-i18next';
import { View } from 'react-native';
import { SafeAreaInsetsContext, useSafeAreaInsets } from 'react-native-safe-area-context';

import { useRowAlign } from '@/i18n';
import { useOnline } from '@/lib/network';

import { AppText } from './ui/AppText';
import { Icon } from './ui/Icon';

/**
 * Thin bar at the top while there is no connection (docs/spec.md "Offline").
 * It takes the status-bar area itself, so the screens below start under it
 * and need no top inset of their own while it shows.
 */
export function OfflineBar({ children }: { children: ReactNode }) {
  const { t } = useTranslation();
  const align = useRowAlign();
  const insets = useSafeAreaInsets();
  const online = useOnline();

  // Same tree online and offline, so the screens below never remount when it changes.
  return (
    <View className="flex-1">
      {!online && (
        <View
          className={`items-center justify-center gap-1.5 bg-surface-muted px-4 pb-1.5 ${align.row}`}
          style={{ paddingTop: insets.top + 2 }}
          accessibilityRole="alert"
          accessibilityLiveRegion="polite">
          <Icon name="wifi-off" size={15} tone="muted" />
          <AppText tone="muted" className="shrink text-[13px]" numberOfLines={1}>
            {t('offline.bar')}
          </AppText>
        </View>
      )}
      <SafeAreaInsetsContext.Provider value={online ? insets : { ...insets, top: 0 }}>
        <View className="flex-1">{children}</View>
      </SafeAreaInsetsContext.Provider>
    </View>
  );
}
