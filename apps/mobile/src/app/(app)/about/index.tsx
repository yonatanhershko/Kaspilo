import { router } from 'expo-router';
import { type ReactNode, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Linking, View } from 'react-native';

import { WalletLogo } from '@/components/nature/WalletLogo';
import { ScreenHeader } from '@/components/ScreenHeader';
import { AppText } from '@/components/ui/AppText';
import { Icon } from '@/components/ui/Icon';
import { PressScale } from '@/components/ui/PressScale';
import { Screen } from '@/components/ui/Screen';
import { useRowAlign } from '@/i18n';
import { appVersionLabel, openWriteReview, writeReviewUrl } from '@/lib/review';

const CONTACT_EMAIL = 'MyKaspilo@gmail.com';

/** More → About. Rules: docs/spec.md "About and app review". */
export default function AboutScreen() {
  const { t } = useTranslation();
  const align = useRowAlign();
  const chevron = align.he ? 'chevron-left' : 'chevron-right';
  const canRate = writeReviewUrl() !== null;
  const [mailFailed, setMailFailed] = useState(false);

  // No mail app on the phone (or on the simulator): opening fails, so show where to write instead.
  const writeEmail = async () => {
    try {
      await Linking.openURL(`mailto:${CONTACT_EMAIL}`);
      setMailFailed(false);
    } catch {
      setMailFailed(true);
    }
  };

  const row = (icon: string, label: string, onPress: () => void, value?: ReactNode, hint?: string) => (
    <PressScale
      accessibilityRole={hint ? 'link' : 'button'}
      accessibilityLabel={label}
      accessibilityHint={hint}
      onPress={onPress}
      className={`min-h-[56px] items-center gap-3 px-4 active:opacity-70 ${align.row}`}>
      <Icon name={icon} tone="primary" />
      <View className="flex-1">
        <AppText className="text-[16px]">{label}</AppText>
        {value}
      </View>
      <Icon name={hint ? 'open-in-new' : chevron} tone="muted" size={20} />
    </PressScale>
  );

  const rows = [
    row('file-document-outline', t('about.terms'), () => router.push('/about/terms')),
    ...(canRate ? [row('star-outline', t('about.rate'), openWriteReview, undefined, t('about.opensStore'))] : []),
    row(
      'email-outline',
      t('about.contact'),
      () => void writeEmail(),
      <AppText selectable tone="muted" className="text-[14px]">
        {CONTACT_EMAIL}
      </AppText>,
      t('about.opensMail'),
    ),
  ];

  return (
    <Screen leaves="low" scroll className="px-5 pb-8 pt-2">
      <ScreenHeader title={t('about.title')} />

      <View className="mb-6 mt-2 items-center gap-2">
        <WalletLogo size={88} />
        <AppText weight="bold" className="text-center text-[24px]">
          {t('about.appName')}
        </AppText>
        <AppText tone="muted" className="max-w-[320px] text-center text-[15px] leading-[22px]">
          {t('about.blurb')}
        </AppText>
      </View>

      <View className="overflow-hidden rounded-xl border border-border bg-surface">
        {rows.map((child, i) => (
          <View key={i} className={i > 0 ? 'border-t border-border' : ''}>
            {child}
          </View>
        ))}
      </View>

      {mailFailed && (
        <AppText tone="muted" accessibilityLiveRegion="polite" className="mt-3 text-[14px] leading-5">
          {t('about.noMailApp', { email: CONTACT_EMAIL })}
        </AppText>
      )}

      <AppText tone="muted" className="mt-6 text-center text-[13px]">
        {t('about.version', { version: appVersionLabel() })}
      </AppText>
    </Screen>
  );
}
