import { type ReactNode } from 'react';
import { ScrollView, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { Backdrop } from '@/components/nature/Backdrop';
import { LeafBackground, type LeafDensity } from '@/components/nature/LeafBackground';
import { useTabBarHeight } from '@/components/ui/TabBarHeight';
import { useTheme } from '@/theme/ThemeProvider';

/** Page shell: themed background, leaves behind, safe areas, optional scroll. */
export function Screen({
  children,
  leaves = 'medium',
  scroll = false,
  backdrop = true,
  className = '',
}: {
  children: ReactNode;
  leaves?: LeafDensity | 'none';
  scroll?: boolean;
  /** false = the plain theme background, no green blur (onboarding, owner 2026-11-23). */
  backdrop?: boolean;
  className?: string;
}) {
  const { theme } = useTheme();
  // Inside the tab bar the bar floats over the screen, so reserve its height here.
  const tabBarHeight = useTabBarHeight();
  // Insets from context (not the native SafeAreaView), so the offline bar can take the top one.
  const insets = useSafeAreaInsets();
  return (
    <View className="flex-1 bg-background">
      {backdrop && <Backdrop theme={theme} />}
      {leaves !== 'none' && <LeafBackground density={leaves} />}
      <View
        style={{
          flex: 1,
          paddingTop: insets.top,
          paddingLeft: insets.left,
          paddingRight: insets.right,
          paddingBottom: tabBarHeight || insets.bottom,
        }}>
        {scroll ? (
          <ScrollView
            contentContainerClassName={`grow ${className}`}
            keyboardShouldPersistTaps="handled"
            showsVerticalScrollIndicator={false}>
            {children}
          </ScrollView>
        ) : (
          <View className={`flex-1 ${className}`}>{children}</View>
        )}
      </View>
    </View>
  );
}
