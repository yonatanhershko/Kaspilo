import { colors as palette } from '@kaspilo/tokens';
import { router } from 'expo-router';
import { type ReactNode, useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { AppState, Image, type ImageSourcePropType, Linking, Platform, ScrollView, View } from 'react-native';
import Animated, {
  Easing,
  useAnimatedStyle,
  useReducedMotion,
  useSharedValue,
  withRepeat,
  withTiming,
} from 'react-native-reanimated';

import { Sway } from '@/components/nature/Sway';
import { AppText } from '@/components/ui/AppText';
import { Button } from '@/components/ui/Button';
import { Icon } from '@/components/ui/Icon';
import { PressScale } from '@/components/ui/PressScale';
import { ProgressFill } from '@/components/ui/ProgressFill';
import { Screen } from '@/components/ui/Screen';
import { useRowAlign } from '@/i18n';
import {
  adviseIosUpdate,
  IOS27_SHORTCUT_URL,
  isListenerEnabled,
  markPurchaseSetupDone,
  openListenerSettings,
  quickSetupHere,
} from '@/purchase';
import { useTheme } from '@/theme/ThemeProvider';

/**
 * "Purchase detected" setup, once per phone (docs/spec.md "Purchase detected").
 * iPhone below iOS 27: first the advice to update (automatic setup needs iOS 27), with the
 * manual path under it → intro → 7-step guide with screenshots → done.
 * iOS 27 and later: intro → the two-step quick path with the shared shortcut (the manual guide
 * while that link is not set) → done.
 * Android: the notification-access explanation Google Play requires → settings → done.
 */

// Apple's own "Update your iPhone" page (opens in the browser).
const IOS_UPDATE_HELP_URL = 'https://support.apple.com/HT204204';

/** "Manual setup for iOS 26": always 26, as in the owner's reference (owner 2026-11-23). */
const manualVersion = 26;

type Mark = { x: number; y: number };
type Shot = { source: ImageSourcePropType; ratio: number };
type GuideStep = { key: string; image: Shot; mark: Mark };

// Screenshots from the owner's iOS 26 iPhone (Hebrew), status bar cropped off and the cards
// blurred, 600 px wide (`ratio` is width / height). `mark` is the tap point in percent.
const GUIDE: GuideStep[] = [
  {
    key: 'automation',
    image: { source: require('../../../assets/images/purchase-setup/1-new-automation.jpg'), ratio: 600 / 1209 },
    mark: { x: 50, y: 60.5 },
  },
  {
    key: 'wallet',
    image: { source: require('../../../assets/images/purchase-setup/2-wallet.jpg'), ratio: 600 / 1209 },
    mark: { x: 76, y: 49 },
  },
  {
    key: 'cards',
    image: { source: require('../../../assets/images/purchase-setup/3-cards.jpg'), ratio: 600 / 722 },
    mark: { x: 12.2, y: 8 },
  },
  {
    key: 'search',
    image: { source: require('../../../assets/images/purchase-setup/4-search.jpg'), ratio: 600 / 553 },
    mark: { x: 62, y: 88.5 },
  },
  {
    key: 'amount',
    image: { source: require('../../../assets/images/purchase-setup/5-amount.jpg'), ratio: 600 / 1220 },
    mark: { x: 82, y: 93 },
  },
  {
    key: 'merchant',
    image: { source: require('../../../assets/images/purchase-setup/6-merchant.jpg'), ratio: 600 / 1211 },
    mark: { x: 82, y: 76.8 },
  },
];

type Stage =
  | { name: 'update' }
  | { name: 'intro' }
  | { name: 'guide'; step: number }
  | { name: 'quick'; step: number }
  | { name: 'android'; tried: boolean }
  | { name: 'done' };

function firstStage(): Stage {
  if (Platform.OS === 'android') return { name: 'android', tried: false };
  return adviseIosUpdate ? { name: 'update' } : { name: 'intro' };
}

export default function PurchaseSetupScreen() {
  const [stage, setStage] = useState<Stage>(firstStage);

  useEffect(() => {
    if (stage.name === 'done') void markPurchaseSetupDone();
  }, [stage.name]);

  // Android: back from the phone's settings with Kaspilo switched on → done.
  useEffect(() => {
    if (stage.name !== 'android') return;
    const sub = AppState.addEventListener('change', (state) => {
      if (state === 'active' && isListenerEnabled()) setStage({ name: 'done' });
    });
    return () => sub.remove();
  }, [stage.name]);

  const close = () => (router.canGoBack() ? router.back() : router.replace('/notifications'));

  switch (stage.name) {
    case 'update':
      return <UpdateAdvice onClose={close} onManual={() => setStage({ name: 'intro' })} />;
    case 'intro':
      return (
        <Intro
          onClose={close}
          onStart={() => setStage(quickSetupHere ? { name: 'quick', step: 0 } : { name: 'guide', step: 0 })}
        />
      );
    case 'guide':
      return (
        <Guide
          step={stage.step}
          onClose={close}
          onBack={() => setStage(stage.step === 0 ? { name: 'intro' } : { name: 'guide', step: stage.step - 1 })}
          onNext={() =>
            setStage(stage.step === GUIDE.length - 1 ? { name: 'done' } : { name: 'guide', step: stage.step + 1 })
          }
        />
      );
    case 'quick':
      return (
        <Quick
          step={stage.step}
          onClose={close}
          onBack={() => setStage(stage.step === 0 ? { name: 'intro' } : { name: 'quick', step: 0 })}
          onNext={() => setStage(stage.step === 0 ? { name: 'quick', step: 1 } : { name: 'done' })}
        />
      );
    case 'android':
      return (
        <AndroidDisclosure
          tried={stage.tried}
          onClose={close}
          onAgree={() => {
            if (isListenerEnabled()) return setStage({ name: 'done' });
            openListenerSettings();
            setStage({ name: 'android', tried: true });
          }}
        />
      );
    case 'done':
      return <Done onFinish={close} />;
  }
}

// ---- pieces -----------------------------------------------------------------

function Shell({
  progress,
  onClose,
  children,
  footer,
}: {
  progress?: number;
  onClose: () => void;
  children: ReactNode;
  footer: ReactNode;
}) {
  const { t } = useTranslation();
  const { colors } = useTheme();
  return (
    // Buttons stay pinned at the bottom on every phone size; only the content scrolls.
    <Screen leaves="none" className="px-5 pt-3">
      <View className="min-h-[44px] flex-row items-center gap-3">
        <PressScale
          accessibilityRole="button"
          accessibilityLabel={t('purchaseSetup.close')}
          className="h-11 w-11 items-center justify-center"
          onPress={onClose}>
          <Icon name="close" size={26} />
        </PressScale>
        {progress !== undefined && (
          <View
            className="h-1.5 flex-1 overflow-hidden rounded-full bg-secondary"
            accessibilityRole="progressbar"
            accessibilityValue={{ min: 0, max: 100, now: Math.round(progress * 100) }}>
            <ProgressFill
              ratio={progress}
              style={{ backgroundColor: colors.primary, height: '100%', borderRadius: 999 }}
            />
          </View>
        )}
        {progress !== undefined && <View className="w-11" />}
      </View>
      <ScrollView
        className="flex-1"
        contentContainerClassName="gap-5 pb-5 pt-5"
        showsVerticalScrollIndicator={false}>
        {children}
      </ScrollView>
      <View className="gap-3 pb-4 pt-2">{footer}</View>
    </Screen>
  );
}

function Title({ title, body }: { title: string; body?: string }) {
  return (
    <View className="gap-2">
      <AppText weight="bold" className="text-[26px] leading-[34px]" accessibilityRole="header">
        {title}
      </AppText>
      {body ? (
        <AppText tone="muted" className="text-[16px] leading-[23px]">
          {body}
        </AppText>
      ) : null}
    </View>
  );
}

function Point({ icon, text }: { icon: string; text: string }) {
  const align = useRowAlign();
  return (
    <View className={`items-start gap-3 ${align.row}`}>
      <Icon name={icon} tone="primary" />
      <AppText className="flex-1 text-[15px] leading-[22px]">{text}</AppText>
    </View>
  );
}

function TextLink({ label, onPress, strong = false }: { label: string; onPress: () => void; strong?: boolean }) {
  return (
    <PressScale
      accessibilityRole="button"
      accessibilityLabel={label}
      className="min-h-[44px] justify-center"
      onPress={onPress}>
      <AppText
        weight={strong ? 'bold' : 'medium'}
        tone={strong ? 'text' : 'muted'}
        className={`text-center underline ${strong ? 'text-[17px]' : 'text-[15px]'}`}>
        {label}
      </AppText>
    </PressScale>
  );
}

function Note({ icon, title, body }: { icon: string; title: string; body: string }) {
  const align = useRowAlign();
  return (
    <View className="gap-2 rounded-xl border border-border bg-surface p-4">
      <View className={`items-center gap-3 ${align.row}`}>
        <Icon name={icon} tone="primary" />
        <AppText weight="medium" className="flex-1 text-[16px]">
          {title}
        </AppText>
      </View>
      <AppText tone="muted" className="text-[14px] leading-[20px]">
        {body}
      </AppText>
    </View>
  );
}

function Caption({ children }: { children: string }) {
  return (
    <AppText tone="muted" className="-mt-2 text-center text-[13px]">
      {children}
    </AppText>
  );
}

/** iOS below 27, first screen: automatic setup is better, the manual path is under it. */
function UpdateAdvice({ onClose, onManual }: { onClose: () => void; onManual: () => void }) {
  const { t } = useTranslation();
  return (
    <Shell
      onClose={onClose}
      footer={
        <>
          <Button
            label={t('purchaseSetup.update.howButton')}
            icon={<Icon name="open-in-new" tone="onPrimary" size={20} />}
            onPress={() => void Linking.openURL(IOS_UPDATE_HELP_URL).catch(() => undefined)}
          />
          <Caption>{t('purchaseSetup.update.howNote')}</Caption>
          <TextLink strong label={t('purchaseSetup.update.manual', { version: manualVersion })} onPress={onManual} />
          <Caption>{t('purchaseSetup.update.manualNote')}</Caption>
        </>
      }>
      <UpdateArt />
      <Title title={t('purchaseSetup.update.title')} body={t('purchaseSetup.update.body')} />
      <AppText weight="medium" className="text-[15px] leading-[22px]">
        {t('purchaseSetup.update.how')}
      </AppText>
    </Shell>
  );
}

/** A phone showing "iOS 27", swaying slowly in 3D like the wallet on the login screen. */
function UpdateArt() {
  return (
    <View
      className="h-56 items-center justify-center overflow-hidden rounded-3xl bg-surface"
      accessibilityElementsHidden
      importantForAccessibility="no-hide-descendants">
      <Sway rotateY={24} rotateX={8} tilt={3} baseRotate={6} bob={5} duration={3000}>
        <View className="h-40 w-24 items-center justify-center rounded-[26px] border-[3px] border-text bg-background">
          <View className="absolute top-3 h-1.5 w-8 rounded-full bg-text" />
          <AppText weight="medium" className="text-center text-[14px]">
            iOS
          </AppText>
          <AppText weight="bold" className="text-center text-[44px] leading-[48px]">
            27
          </AppText>
          <View className="absolute bottom-3 h-1 w-8 rounded-full bg-text" />
        </View>
      </Sway>
    </View>
  );
}

function Intro({ onClose, onStart }: { onClose: () => void; onStart: () => void }) {
  const { t } = useTranslation();
  return (
    <Shell
      progress={0.02}
      onClose={onClose}
      footer={
        <>
          <Button label={t('purchaseSetup.intro.start')} onPress={onStart} />
          <TextLink label={t('purchaseSetup.intro.later')} onPress={onClose} />
        </>
      }>
      <Title title={t('purchaseSetup.intro.title')} body={t('purchaseSetup.intro.body')} />
      <View className="gap-4">
        <Point icon="creation-outline" text={t('purchaseSetup.intro.quick')} />
        <Point icon="shield-lock-outline" text={t('purchaseSetup.intro.private')} />
        <Point icon="gesture-tap" text={t('purchaseSetup.intro.guided')} />
      </View>
      {quickSetupHere && (
        <Note
          icon="lightning-bolt-outline"
          title={t('purchaseSetup.intro.quickTitle')}
          body={t('purchaseSetup.intro.quickBody')}
        />
      )}
      {adviseIosUpdate && (
        <Note
          icon="arrow-up-circle-outline"
          title={t('purchaseSetup.update.title')}
          body={t('purchaseSetup.intro.manualBody', { version: manualVersion })}
        />
      )}
    </Shell>
  );
}

function OpenShortcuts() {
  const { t } = useTranslation();
  return (
    <Button
      variant="outline"
      label={t('purchaseSetup.guide.openShortcuts')}
      icon={<Icon name="open-in-new" size={20} />}
      onPress={() => void Linking.openURL('shortcuts://').catch(() => undefined)}
    />
  );
}

function BackNext({ onBack, onNext }: { onBack: () => void; onNext: () => void }) {
  const { t } = useTranslation();
  const align = useRowAlign();
  return (
    <View className={`gap-3 ${align.row}`}>
      {/* Back first: Hebrew puts Next at the left (forward), English at the right. */}
      <Button className="flex-1" variant="outline" label={t('purchaseSetup.guide.back')} onPress={onBack} />
      <Button className="flex-[2]" label={t('purchaseSetup.guide.next')} onPress={onNext} />
    </View>
  );
}

function Guide({
  step,
  onClose,
  onBack,
  onNext,
}: {
  step: number;
  onClose: () => void;
  onBack: () => void;
  onNext: () => void;
}) {
  const { t } = useTranslation();
  const current = GUIDE[step];
  const total = GUIDE.length;
  const base = `purchaseSetup.guide.steps.${current.key}`;
  return (
    <Shell
      progress={(step + 1) / (total + 1)}
      onClose={onClose}
      footer={
        <>
          <OpenShortcuts />
          <BackNext onBack={onBack} onNext={onNext} />
        </>
      }>
      <View className="gap-2">
        <AppText tone="muted" className="text-[13px]">
          {t('purchaseSetup.guide.stepOf', { n: step + 1, total })}
        </AppText>
        <Title title={t(`${base}.title`)} body={t(`${base}.body`)} />
      </View>
      <Screenshot key={current.key} image={current.image} mark={current.mark} label={t(`${base}.title`)} />
    </Shell>
  );
}

/** A screenshot in a phone-like frame, with a soft pulsing mark on the place to tap. */
function Screenshot({ image, mark, label }: { image: Shot; mark: Mark; label: string }) {
  const { source, ratio } = image;
  return (
    <View
      className="self-center overflow-hidden rounded-[28px] border-4 border-border"
      style={{ width: ratio < 0.6 ? '54%' : ratio < 1 ? '72%' : '88%', aspectRatio: ratio }}
      accessible
      accessibilityRole="image"
      accessibilityLabel={label}>
      <Image source={source} style={{ width: '100%', height: '100%' }} resizeMode="cover" />
      <TapMark mark={mark} />
    </View>
  );
}

// The screenshots are light, so the mark uses the light theme's green in both themes.
const MARK = palette.light.primary;
const MARK_SIZE = 40;

/**
 * Where to tap: a see-through green ring with a small dot, and a soft halo that grows and
 * fades (2.2 s, calm). The label under it stays readable. Still with "reduce motion".
 */
function TapMark({ mark }: { mark: Mark }) {
  const reduceMotion = useReducedMotion();
  const pulse = useSharedValue(0);
  useEffect(() => {
    pulse.set(
      reduceMotion
        ? 0
        : withRepeat(withTiming(1, { duration: 2200, easing: Easing.out(Easing.quad) }), -1, false),
    );
  }, [pulse, reduceMotion]);
  const halo = useAnimatedStyle(() => ({
    opacity: 0.35 * (1 - pulse.get()),
    transform: [{ scale: 1 + pulse.get() * 0.9 }],
  }));
  const half = MARK_SIZE / 2;
  return (
    <View
      pointerEvents="none"
      style={{
        position: 'absolute',
        left: `${mark.x}%`,
        top: `${mark.y}%`,
        width: MARK_SIZE,
        height: MARK_SIZE,
        marginLeft: -half,
        marginTop: -half,
        alignItems: 'center',
        justifyContent: 'center',
      }}>
      <Animated.View
        style={[
          { position: 'absolute', width: MARK_SIZE, height: MARK_SIZE, borderRadius: half, backgroundColor: MARK },
          halo,
        ]}
      />
      <View
        style={{
          width: MARK_SIZE,
          height: MARK_SIZE,
          borderRadius: half,
          borderWidth: 2.5,
          borderColor: MARK,
          opacity: 0.8,
          shadowColor: palette.light.text,
          shadowOpacity: 0.18,
          shadowRadius: 6,
          shadowOffset: { width: 0, height: 2 },
        }}
      />
      <View
        style={{ position: 'absolute', width: 10, height: 10, borderRadius: 5, backgroundColor: MARK, opacity: 0.65 }}
      />
    </View>
  );
}

/** iOS 27 and later with the shared shortcut: add it, then turn its automation on. */
function Quick({
  step,
  onClose,
  onBack,
  onNext,
}: {
  step: number;
  onClose: () => void;
  onBack: () => void;
  onNext: () => void;
}) {
  const { t } = useTranslation();
  const key = step === 0 ? 'add' : 'turnOn';
  return (
    <Shell
      progress={(step + 1) / 3}
      onClose={onClose}
      footer={
        <>
          {step === 0 ? (
            <Button
              variant="outline"
              label={t('purchaseSetup.quick.add.button')}
              icon={<Icon name="plus-circle-outline" size={20} />}
              onPress={() => void Linking.openURL(IOS27_SHORTCUT_URL).catch(() => undefined)}
            />
          ) : (
            <OpenShortcuts />
          )}
          <BackNext onBack={onBack} onNext={onNext} />
        </>
      }>
      <View className="gap-2">
        <AppText tone="muted" className="text-[13px]">
          {t('purchaseSetup.guide.stepOf', { n: step + 1, total: 2 })}
        </AppText>
        <Title title={t(`purchaseSetup.quick.${key}.title`)} body={t(`purchaseSetup.quick.${key}.body`)} />
      </View>
      {step === 1 && (
        <View className="gap-4 rounded-xl border border-border bg-surface p-4">
          <Point icon="toggle-switch-outline" text={t('purchaseSetup.quick.turnOn.automation')} />
          <Point icon="hand-back-left-off-outline" text={t('purchaseSetup.quick.turnOn.confirm')} />
          <Point icon="lock-open-outline" text={t('purchaseSetup.quick.turnOn.locked')} />
        </View>
      )}
    </Shell>
  );
}

function AndroidDisclosure({ tried, onClose, onAgree }: { tried: boolean; onClose: () => void; onAgree: () => void }) {
  const { t } = useTranslation();
  return (
    <Shell
      onClose={onClose}
      footer={
        <>
          <Button label={t(tried ? 'purchaseSetup.android.again' : 'purchaseSetup.android.agree')} onPress={onAgree} />
          <TextLink label={t('purchaseSetup.intro.later')} onPress={onClose} />
        </>
      }>
      <Title title={t('purchaseSetup.android.title')} body={t('purchaseSetup.android.body')} />
      <View className="gap-4">
        <Point icon="wallet-outline" text={t('purchaseSetup.android.only')} />
        <Point icon="eye-off-outline" text={t('purchaseSetup.android.others')} />
        <Point icon="shield-lock-outline" text={t('purchaseSetup.android.private')} />
      </View>
      <Note
        icon="toggle-switch-outline"
        title={t('purchaseSetup.android.stepTitle')}
        body={t(tried ? 'purchaseSetup.android.notYet' : 'purchaseSetup.android.stepBody')}
      />
    </Shell>
  );
}

function Done({ onFinish }: { onFinish: () => void }) {
  const { t } = useTranslation();
  return (
    <Shell progress={1} onClose={onFinish} footer={<Button label={t('purchaseSetup.done.finish')} onPress={onFinish} />}>
      <View className="items-center py-6">
        <View className="h-28 w-28 items-center justify-center rounded-full bg-surface">
          <Icon name="check-circle-outline" tone="primary" size={64} />
        </View>
      </View>
      <Title
        title={t('purchaseSetup.done.title')}
        body={t(Platform.OS === 'android' ? 'purchaseSetup.done.bodyAndroid' : 'purchaseSetup.done.bodyIos')}
      />
    </Shell>
  );
}
