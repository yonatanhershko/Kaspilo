import MaterialCommunityIcons from '@expo/vector-icons/MaterialCommunityIcons';
import type { ComponentProps } from 'react';
import { View } from 'react-native';
import { SvgXml } from 'react-native-svg';

import { useTheme } from '@/theme/ThemeProvider';

import { type PenIconName, penIcons } from './penIcons';

export type IconName = ComponentProps<typeof MaterialCommunityIcons>['name'];

const tones = {
  text: 'text',
  muted: 'textMuted',
  primary: 'primary',
  onPrimary: 'onPrimary',
  onAccent: 'onAccent',
  danger: 'danger',
} as const;

/**
 * The owner's hand-drawn icon set (assets/icons/pen) replaces these Material icons wherever
 * they show. Names stay Material names, so stored category / wallet / goal icons need no change.
 * Anything not listed stays a Material icon (small utility glyphs: chevrons, close, check…).
 */
const penForUi: Record<string, PenIconName> = {
  'home-outline': 'home',
  'chart-donut': 'stats',
  'chart-bar': 'stats',
  'bullseye-arrow': 'goals',
  target: 'goals',
  'wallet-outline': 'wallet',
  'dots-horizontal': 'more',
  plus: 'plus',
  'pencil-outline': 'edit',
  'trash-can-outline': 'trash',
  'tray-arrow-down': 'export',
  repeat: 'repeat',
  calendar: 'calendar',
  'bell-outline': 'bell',
  web: 'language',
};

/** Category icons: the default categories' icons, and the same pictures when chosen by hand. */
const penForCategory: Record<string, PenIconName> = {
  ...penForUi,
  car: 'car',
  'silverware-fork-knife': 'food',
  gift: 'leisure',
  home: 'housing',
  'heart-pulse': 'health',
  shopping: 'shopping',
  cart: 'basket',
  receipt: 'bills',
  coffee: 'coffee',
  'cash-multiple': 'salary',
  'dots-horizontal': 'other',
  'plus-circle': 'other',
};

/** Decorative by default: give the parent control the accessibility label. */
export function Icon({
  name,
  size = 22,
  tone = 'text',
  color,
  set = 'ui',
}: {
  name: string;
  size?: number;
  tone?: keyof typeof tones;
  /** Raw color, for category icons that carry their own color. */
  color?: string;
  /**
   * 'ui' and 'category' use the hand-drawn icon when there is one ('category' reads
   * "dots-horizontal" as Other, 'ui' as More). 'classic' always shows the Material icon: for
   * screens the new set doesn't fully cover yet (icon pickers, More), so one screen never mixes styles.
   */
  set?: 'ui' | 'category' | 'classic';
}) {
  const { colors } = useTheme();
  const tint = color ?? colors[tones[tone]];
  const pen = set === 'classic' ? undefined : (set === 'category' ? penForCategory : penForUi)[name];
  if (pen) {
    return (
      <View accessibilityElementsHidden importantForAccessibility="no">
        <SvgXml xml={penIcons[pen]} width={size} height={size} color={tint} />
      </View>
    );
  }
  return (
    <MaterialCommunityIcons
      name={name as IconName}
      size={size}
      color={tint}
      accessibilityElementsHidden
      importantForAccessibility="no"
    />
  );
}

/** Round tinted badge with a category's icon in its color. */
export function CategoryIcon({
  icon,
  color,
  size = 44,
  classic = false,
}: {
  icon: string;
  color: string;
  size?: number;
  /** Material icon even when a hand-drawn one exists (icon pickers). */
  classic?: boolean;
}) {
  const pen = !classic && icon in penForCategory;
  return (
    <View
      style={{
        width: size,
        height: size,
        borderRadius: size / 2,
        // the category color at ~18% opacity
        backgroundColor: `${color}2E`,
        alignItems: 'center',
        justifyContent: 'center',
      }}>
      {/* Pen strokes are thin: a little larger than the filled Material glyphs to read the same. */}
      <Icon name={icon} size={size * (pen ? 0.6 : 0.52)} color={color} set={pen ? 'category' : 'classic'} />
    </View>
  );
}
