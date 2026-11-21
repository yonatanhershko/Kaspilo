import type { ReactNode } from 'react';
import { Text, type TextProps } from 'react-native';

import { useLanguage } from '@/i18n';

/**
 * All app text goes through here so the font (Rubik) and color tokens are
 * always right. Custom fonts ignore fontWeight on native, so `weight` picks
 * the font file. Color is set with `tone`, never with a text-color class,
 * so two color classes can never fight.
 *
 * Alignment is smart: Hebrew text starts at the right, English at the left, the
 * same on iPhone and Android. Every Hebrew line reads right to left even when it starts
 * with a Latin word (the app name), on Android too (an RLM opens each line). Text that is only a number (amount, date, phone) is
 * always left-aligned and left-to-right. Add `text-center` (or `text-start` / `text-end`) to
 * opt out; an explicit `textAlign` in `style` also wins.
 */
const families = {
  regular: 'font-rubik',
  medium: 'font-rubik-medium',
  bold: 'font-rubik-bold',
} as const;

const tones = {
  text: 'text-text',
  muted: 'text-text-muted',
  primary: 'text-primary',
  onPrimary: 'text-on-primary',
  onAccent: 'text-on-accent',
  danger: 'text-danger',
  success: 'text-success',
} as const;

export type TextTone = keyof typeof tones;

export type AppTextProps = TextProps & {
  weight?: keyof typeof families;
  tone?: TextTone;
  className?: string;
};

const ownAlign = /(^|\s)text-(center|start|end|left|right|justify)(\s|$)/;

// Digits plus the marks that travel with them: separators, signs, %, currency, time/date punctuation, LRM.
const numberOnly = /^[\s\d.,:/+\-%\u200E\u200F\u20AA$]+$/;

/** True when the text holds only a number, amount, date, time or phone: no letters at all. */
function isNumberOnly(children: ReactNode): boolean {
  const parts = Array.isArray(children) ? children : [children];
  let digits = false;
  for (const part of parts) {
    if (typeof part !== 'string' && typeof part !== 'number') return false;
    const text = String(part);
    if (!numberOnly.test(text)) return false;
    if (/\d/.test(text)) digits = true;
  }
  return digits;
}

/** Right-to-left mark: makes a Hebrew line that starts with a Latin word ("Kaspilo …") still read right to left. */
const RLM = '\u200F';

/** Puts an RLM at the start of every line, so each line of Hebrew text starts at the right. */
function markRtl(children: ReactNode): ReactNode {
  const mark = (text: string) => text.replace(/(^|\n)(?!\u200F)/g, `$1${RLM}`);
  if (typeof children === 'string') return mark(children);
  if (Array.isArray(children) && typeof children[0] === 'string') return [mark(children[0]), ...children.slice(1)];
  return children;
}

export function AppText({ weight = 'regular', tone = 'text', className = '', style, children, ...props }: AppTextProps) {
  const he = useLanguage() === 'he';
  // A number on its own starts at the left and reads left to right in both languages.
  const ltr = !he || isNumberOnly(children);
  const auto = ownAlign.test(className)
    ? // Own alignment (centered text): keep it, but Hebrew still reads right to left.
      ltr
      ? null
      : ({ writingDirection: 'rtl' } as const)
    : ({ textAlign: ltr ? 'left' : 'right', writingDirection: ltr ? 'ltr' : 'rtl' } as const);
  return (
    <Text className={`${tones[tone]} ${families[weight]} ${className}`} style={[auto, style]} {...props}>
      {ltr ? children : markRtl(children)}
    </Text>
  );
}
