import { type ComponentRef, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Modal, Platform, Pressable, StatusBar, useWindowDimensions, View } from 'react-native';
import Animated, { FadeIn } from 'react-native-reanimated';

import { AppText } from '@/components/ui/AppText';
import { Icon } from '@/components/ui/Icon';
import { PressScale } from '@/components/ui/PressScale';
import { changeLanguage, LANGUAGE_NAMES, languages, useLanguage, useRowAlign } from '@/i18n';
import type { Language } from '@/lib/preferences';

/** Short code on the closed tab. */
const SHORT: Record<Language, string> = { he: 'עב', en: 'EN', es: 'ES' };

/**
 * Small language tab on the first onboarding screen (docs/spec.md "Onboarding"): tap opens a
 * menu under it with every language in its own name. The choice is saved like More → Language.
 */
export function LanguageMenu() {
  const { t } = useTranslation();
  const language = useLanguage();
  const align = useRowAlign();
  const { width } = useWindowDimensions();
  const pill = useRef<ComponentRef<typeof View>>(null);
  const [anchor, setAnchor] = useState<{ top: number; right: number } | null>(null);

  // Android (edge to edge) measures below the status bar, while the modal starts at the very top.
  const statusBar = Platform.OS === 'android' ? (StatusBar.currentHeight ?? 0) : 0;
  const open = () =>
    pill.current?.measureInWindow((x, y, w, h) =>
      setAnchor({ top: y + h + statusBar + 6, right: Math.max(8, width - (x + w)) }),
    );
  const close = () => setAnchor(null);
  const pick = (value: Language) => {
    close();
    if (value !== language) void changeLanguage(value);
  };

  return (
    <>
      <View ref={pill} collapsable={false}>
        <PressScale
          accessibilityRole="button"
          accessibilityLabel={`${t('settings.language')}: ${LANGUAGE_NAMES[language]}`}
          accessibilityState={{ expanded: anchor != null }}
          onPress={open}
          scaleTo={0.94}
          hitSlop={{ top: 7, bottom: 7 }}
          className={`h-[30px] items-center gap-1 rounded-full border-[1.5px] border-secondary bg-surface px-2.5 ${align.row}`}>
          <Icon name="web" size={16} tone="primary" />
          <AppText weight="medium" className="text-[13px]">
            {SHORT[language]}
          </AppText>
          <Icon name={anchor ? 'chevron-up' : 'chevron-down'} size={14} tone="muted" />
        </PressScale>
      </View>

      <Modal visible={anchor != null} transparent animationType="fade" statusBarTranslucent navigationBarTranslucent onRequestClose={close}>
        <Pressable className="flex-1 bg-black/20" onPress={close} accessibilityLabel={t('common.close')}>
          {anchor && (
            <Animated.View
              entering={FadeIn.duration(160)}
              className="absolute w-[168px] overflow-hidden rounded-xl border border-border bg-surface py-1"
              style={{ top: anchor.top, right: anchor.right }}
              accessibilityViewIsModal>
              {languages.map((value) => {
                const selected = value === language;
                return (
                  <PressScale
                    key={value}
                    accessibilityRole="button"
                    accessibilityLabel={LANGUAGE_NAMES[value]}
                    accessibilityState={{ selected }}
                    onPress={() => pick(value)}
                    scaleTo={0.98}
                    className={`min-h-[44px] items-center justify-between px-4 ${align.row} ${selected ? 'bg-surface-muted' : ''}`}>
                    <AppText weight={selected ? 'medium' : 'regular'} tone={selected ? 'primary' : 'text'} className="text-[15px]">
                      {LANGUAGE_NAMES[value]}
                    </AppText>
                    {selected && <Icon name="check" size={18} tone="primary" />}
                  </PressScale>
                );
              })}
            </Animated.View>
          )}
        </Pressable>
      </Modal>
    </>
  );
}
