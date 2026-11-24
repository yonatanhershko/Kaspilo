import { type ReactNode } from 'react';
import { ActivityIndicator, type PressableProps, View } from 'react-native';

import { useTheme } from '@/theme/ThemeProvider';

import { AppText } from './AppText';
import { PressScale } from './PressScale';

const variants = {
  primary: { box: 'bg-primary', tone: 'onPrimary' },
  accent: { box: 'bg-accent', tone: 'onAccent' },
  outline: { box: 'bg-surface border border-border', tone: 'text' },
  /** No fill, primary border and text: secondary actions such as "Export to Excel". */
  line: { box: 'border-[1.5px] border-primary', tone: 'primary' },
} as const;

export type ButtonProps = Omit<PressableProps, 'children' | 'style'> & {
  label: string;
  variant?: keyof typeof variants;
  icon?: ReactNode;
  loading?: boolean;
  /** small: 44 pt high (the touch minimum), smaller text. For a secondary call to action. */
  size?: 'regular' | 'small';
  className?: string;
};

export function Button({
  label,
  variant = 'primary',
  icon,
  loading = false,
  size = 'regular',
  disabled,
  className = '',
  ...props
}: ButtonProps) {
  const { colors } = useTheme();
  const v = variants[variant];
  const spinnerColor =
    variant === 'primary'
      ? colors.onPrimary
      : variant === 'accent'
        ? colors.onAccent
        : variant === 'line'
          ? colors.primary
          : colors.text;

  return (
    <PressScale
      accessibilityRole="button"
      accessibilityLabel={label}
      accessibilityState={{ disabled: !!disabled || loading, busy: loading }}
      disabled={disabled || loading}
      className={`${size === 'small' ? 'min-h-[44px] px-4' : 'min-h-[52px] px-5'} flex-row items-center justify-center rounded-lg active:opacity-80 ${v.box} ${disabled ? 'opacity-50' : ''} ${className}`}
      {...props}>
      {loading ? (
        <ActivityIndicator color={spinnerColor} />
      ) : (
        <View className="flex-row items-center gap-2">
          {icon}
          <AppText weight="medium" tone={v.tone} className={size === 'small' ? 'text-[15px]' : 'text-[17px]'}>
            {label}
          </AppText>
        </View>
      )}
    </PressScale>
  );
}
