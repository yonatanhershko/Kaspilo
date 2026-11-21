import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Platform, TextInput, type TextInputProps, View } from 'react-native';

import { useRowAlign } from '@/i18n';
import { useTheme } from '@/theme/ThemeProvider';

import { AppText } from './AppText';
import { Icon } from './Icon';
import { Shake } from './Shake';
import { PressScale } from './PressScale';

export type TextFieldProps = TextInputProps & {
  label: string;
  error?: string | null;
};

const hebrewLetter = /[\u0590-\u05FF]/;
const latinLetter = /[A-Za-z]/;

/**
 * Where typing starts, so the cursor moves with the text:
 *  - email, password, code: by the app language (Hebrew: right, owner 2026-11-21), but the
 *    content always reads left to right, so an address or code never scrambles;
 *  - otherwise by the first letter typed (Hebrew: right, English: left, owner 2026-11-19);
 *  - empty or digits only: by the app language.
 */
function typingDirection(value: string | undefined, he: boolean, latinContent: boolean) {
  if (latinContent) return { textAlign: he ? 'right' : 'left', writingDirection: 'ltr' } as const;
  let rtl = he;
  const first = value?.match(/[\u0590-\u05FFA-Za-z]/)?.[0];
  if (first && hebrewLetter.test(first)) rtl = true;
  else if (first && latinLetter.test(first)) rtl = false;
  return { textAlign: rtl ? 'right' : 'left', writingDirection: rtl ? 'rtl' : 'ltr' } as const;
}

/** Labeled text input with an inline error line. */
export function TextField({ label, error, secureTextEntry, ...props }: TextFieldProps) {
  const { colors } = useTheme();
  const { t } = useTranslation();
  const align = useRowAlign();
  const latinContent =
    !!secureTextEntry || props.keyboardType === 'email-address' || props.textContentType === 'oneTimeCode';
  const direction = typingDirection(props.value, align.he, latinContent);
  // Android does not re-align a field while it is open, so it is remade (keeping the
  // keyboard up) when the direction changes. That happens at most on the first letter.
  const [focused, setFocused] = useState(false);
  const android = Platform.OS === 'android';
  const focusProps = {
    onFocus: (e: Parameters<NonNullable<TextInputProps['onFocus']>>[0]) => {
      setFocused(true);
      props.onFocus?.(e);
    },
    onBlur: (e: Parameters<NonNullable<TextInputProps['onBlur']>>[0]) => {
      setFocused(false);
      props.onBlur?.(e);
    },
  };
  const [revealed, setRevealed] = useState(false);
  const borderClass = error ? 'border-danger' : 'border-border';

  return (
    <Shake trigger={error} style={{ gap: 4 }}>
      <AppText tone="muted" className="text-[13px]">
        {label}
      </AppText>
      {secureTextEntry ? (
        // The eye sits across from where typing starts: Hebrew at the left, English at the right.
        <View
          className={`min-h-[52px] items-center rounded-lg border bg-surface ${align.row} ${align.he ? 'pr-4' : 'pl-4'} ${borderClass}`}>
          <TextInput
            accessibilityLabel={label}
            placeholderTextColor={colors.textMuted}
            className="min-h-[52px] flex-1 font-rubik text-[16px] text-text outline-none"
            secureTextEntry={!revealed}
            {...props}
            style={[direction, props.style]}
          />
          <PressScale
            onPress={() => setRevealed((value) => !value)}
            accessibilityRole="button"
            accessibilityLabel={revealed ? t('common.hidePassword') : t('common.showPassword')}
            hitSlop={6}
            className="h-[52px] w-12 items-center justify-center">
            <Icon name={revealed ? 'eye-off-outline' : 'eye-outline'} tone="muted" />
          </PressScale>
        </View>
      ) : (
        <TextInput
          accessibilityLabel={label}
          placeholderTextColor={colors.textMuted}
          className={`min-h-[52px] rounded-lg border bg-surface px-4 font-rubik text-[16px] text-text outline-none ${borderClass}`}
          key={android ? direction.textAlign : undefined}
          {...props}
          {...focusProps}
          autoFocus={props.autoFocus || (android && focused)}
          style={[direction, props.style]}
        />
      )}
      {error ? (
        <AppText tone="danger" className="text-[13px]" accessibilityLiveRegion="polite">
          {error}
        </AppText>
      ) : null}
    </Shake>
  );
}
