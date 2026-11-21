import { currencySymbol } from '@kaspilo/shared';
import { type ComponentRef, useRef } from 'react';
import { Pressable, Text, TextInput, View } from 'react-native';

import { useMoney } from '@/data/hooks';
import { useRowAlign } from '@/i18n';
import { useTheme } from '@/theme/ThemeProvider';

import { AppText } from './AppText';

/** Keep only what can become a valid amount: digits and one dot, two decimals. */
export function cleanAmountInput(raw: string): string {
  const cleaned = raw.replace(/,/g, '.').replace(/[^\d.]/g, '');
  const [whole, ...rest] = cleaned.split('.');
  const trimmedWhole = whole.slice(0, 9);
  return rest.length === 0 ? trimmedWhole : `${trimmedWhole}.${rest.join('').slice(0, 2)}`;
}

/** Big numeric amount input with the currency sign. Value is the typed string. */
export function AmountField({
  value,
  onChangeText,
  label,
  autoFocus,
  size = 'large',
}: {
  value: string;
  onChangeText: (value: string) => void;
  label: string;
  autoFocus?: boolean;
  size?: 'large' | 'normal';
}) {
  const { colors } = useTheme();
  const { currency } = useMoney();
  const input = useRef<ComponentRef<typeof TextInput>>(null);
  const { he } = useRowAlign();
  const large = size === 'large';
  const fontSize = large ? (value.length <= 6 ? 34 : value.length <= 8 ? 29 : 25) : 18;
  const signSize = large ? Math.round(fontSize * 0.88) : 18;
  const numberStyle = { fontSize, paddingVertical: 0, paddingHorizontal: 0 } as const;
  const sign = (
    <AppText weight="bold" style={{ fontSize: signSize, lineHeight: Math.round(signSize * 1.25) }}>
      {currencySymbol[currency]}
    </AppText>
  );
  const box = `rounded-lg border border-border bg-surface px-4 ${large ? 'min-h-[68px]' : 'min-h-[52px]'}`;

  // Digits and sign always read left to right, the sign left of the number.
  // Where they sit follows the language (owner 2026-11-18): Hebrew at the right, English at the left.
  if (!he) {
    return (
      <Pressable
        accessible={false}
        onPress={() => input.current?.focus()}
        style={{ direction: 'ltr' }}
        className={`flex-row items-center justify-start gap-2 ${box}`}>
        {sign}
        <TextInput
          ref={input}
          accessibilityLabel={label}
          value={value}
          onChangeText={(text) => onChangeText(cleanAmountInput(text))}
          keyboardType="decimal-pad"
          inputMode="decimal"
          autoFocus={autoFocus}
          placeholder="0"
          placeholderTextColor={colors.textMuted}
          className="min-w-0 flex-1 font-rubik-bold text-text outline-none"
          style={[numberStyle, { textAlign: 'left', writingDirection: 'ltr' }]}
        />
      </Pressable>
    );
  }

  // Hebrew: a full-width input held at the right, its own text invisible, under a plain
  // text that shows "sign + number" at the right. Nothing is measured, so nothing jumps
  // while typing, and the cursor sits at the end of the number.
  return (
    <Pressable
      accessible={false}
      onPress={() => input.current?.focus()}
      style={{ direction: 'ltr' }}
      className={`justify-center ${box}`}>
      <View
        pointerEvents="none"
        importantForAccessibility="no-hide-descendants"
        className="absolute inset-x-4 inset-y-0 flex-row items-center justify-end gap-2">
        {sign}
        <Text
          className={`font-rubik-bold ${value ? 'text-text' : 'text-text-muted'}`}
          style={numberStyle}
          numberOfLines={1}>
          {value || '0'}
        </Text>
      </View>
      <TextInput
        ref={input}
        accessibilityLabel={label}
        value={value}
        onChangeText={(text) => onChangeText(cleanAmountInput(text))}
        keyboardType="decimal-pad"
        inputMode="decimal"
        autoFocus={autoFocus}
        selectionColor={colors.primary}
        cursorColor={colors.primary}
        className="w-full font-rubik-bold outline-none"
        style={[numberStyle, { color: 'transparent', textAlign: 'right', writingDirection: 'ltr' }]}
      />
    </Pressable>
  );
}
