import type { Tabs } from 'expo-router';
import { type ComponentProps, useEffect, useState } from 'react';
import { Pressable, View } from 'react-native';
import Animated, {
  Easing,
  useAnimatedStyle,
  useReducedMotion,
  useSharedValue,
  withTiming,
} from 'react-native-reanimated';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { useTheme } from '@/theme/ThemeProvider';

import { type IconName, Icon } from './Icon';
import { TAB_BAR_CONTENT_HEIGHT } from './TabBarHeight';

type BottomTabBarProps = Parameters<NonNullable<ComponentProps<typeof Tabs>['tabBar']>>[0];

const PILL_INSET = 6;
const SLIDE_MS = 320;

/**
 * Bottom tabs: icons only, and a soft pill slides to the chosen tab (owner 2026-11-18).
 * With "reduce motion" the pill jumps.
 */
export function KaspiloTabBar({
  state,
  descriptors,
  emitter,
  navigateToTab,
  icons,
}: BottomTabBarProps & { icons: Record<string, IconName> }) {
  const { colors } = useTheme();
  const insets = useSafeAreaInsets();
  const reduceMotion = useReducedMotion();
  const [width, setWidth] = useState(0);
  const slot = width / state.routes.length;
  const x = useSharedValue(0);

  useEffect(() => {
    const target = state.index * slot;
    x.set(reduceMotion ? target : withTiming(target, { duration: SLIDE_MS, easing: Easing.out(Easing.cubic) }));
  }, [state.index, slot, reduceMotion, x]);

  const pill = useAnimatedStyle(() => ({ transform: [{ translateX: x.get() }] }));

  return (
    <View
      onLayout={(e) => setWidth(e.nativeEvent.layout.width)}
      style={{
        position: 'absolute',
        left: 0,
        right: 0,
        bottom: 0,
        height: TAB_BAR_CONTENT_HEIGHT + insets.bottom,
        paddingBottom: insets.bottom,
        backgroundColor: colors.surface,
        borderTopWidth: 1,
        borderTopColor: colors.border,
        flexDirection: 'row',
      }}>
      {width > 0 && (
        <Animated.View
          pointerEvents="none"
          style={[
            {
              position: 'absolute',
              top: PILL_INSET,
              left: PILL_INSET,
              width: slot - PILL_INSET * 2,
              height: TAB_BAR_CONTENT_HEIGHT - PILL_INSET * 2,
              borderRadius: 16,
              backgroundColor: colors.secondary,
              opacity: 0.35,
            },
            pill,
          ]}
        />
      )}
      {state.routes.map((route, index) => {
        const focused = state.index === index;
        const label = descriptors[route.key].options.title ?? route.name;
        return (
          <Pressable
            key={route.key}
            accessibilityRole="tab"
            accessibilityLabel={label}
            accessibilityState={{ selected: focused }}
            onPress={() => {
              const event = emitter.emit({ type: 'tabPress', target: route.key, canPreventDefault: true });
              if (!focused && !event.defaultPrevented) navigateToTab(route.key);
            }}
            style={{ flex: 1, alignItems: 'center', justifyContent: 'center' }}>
            <TabIcon name={icons[route.name]} focused={focused} />
          </Pressable>
        );
      })}
    </View>
  );
}

function TabIcon({ name, focused }: { name: IconName; focused: boolean }) {
  const { colors } = useTheme();
  return <Icon name={name} size={26} color={focused ? colors.primary : colors.textMuted} />;
}
