import { type ReactNode } from 'react';
import { useTranslation } from 'react-i18next';
import { ScrollView, View } from 'react-native';

import { ScreenHeader } from '@/components/ScreenHeader';
import { AppText } from '@/components/ui/AppText';
import { Button } from '@/components/ui/Button';
import { Screen } from '@/components/ui/Screen';

type Section = { title: string; body: string };

/**
 * The terms text with the accept button pinned under it: opening the terms and
 * accepting is enough, no scroll needed. Used by sign-up, the first Google sign-in,
 * and read only from About.
 */
export function TermsView({
  onAccept,
  busy = false,
  back = true,
  footer,
}: {
  /** Without it the terms are read only (About → Terms of use). */
  onAccept?: () => void;
  busy?: boolean;
  back?: boolean;
  footer?: ReactNode;
}) {
  const { t } = useTranslation();
  const sections = t('terms.sections', { returnObjects: true }) as Section[];

  return (
    <Screen leaves="low" className="px-6 pt-2">
      {back ? (
        <ScreenHeader title={t('terms.title')} />
      ) : (
        <AppText weight="bold" className="mb-3 mt-2 text-center text-[20px]" accessibilityRole="header">
          {t('terms.title')}
        </AppText>
      )}
      <ScrollView className="flex-1" contentContainerClassName="pb-6" showsVerticalScrollIndicator>
        <AppText tone="muted" className="mb-4 text-[14px]">
          {t('terms.updated')}
        </AppText>
        <View className="gap-5">
          {sections.map((section) => (
            <View key={section.title} className="gap-1">
              <AppText weight="bold" className="text-[17px]" accessibilityRole="header">
                {section.title}
              </AppText>
              <AppText className="text-[15px] leading-6">{section.body}</AppText>
            </View>
          ))}
        </View>
      </ScrollView>
      {onAccept && (
        <View className="border-t border-border pb-6 pt-3">
          <Button label={t('terms.iRead')} onPress={onAccept} loading={busy} />
          {footer}
        </View>
      )}
    </Screen>
  );
}
