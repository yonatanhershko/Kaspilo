import { colors as palette } from '@kaspilo/tokens';
import { router } from 'expo-router';
import { type ReactNode, useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { useVideoPlayer, VideoView } from 'expo-video';
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
import { Wallet } from '@/components/nature/Wallet';
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
  iosMajor,
  isListenerEnabled,
  markPurchaseSetupDone,
  openListenerSettings,
  quickSetupHere,
} from '@/purchase';
import { useTheme } from '@/theme/ThemeProvider';

/**
 * "Purchase detected" setup, once per phone (docs/spec.md "Purchase detected").
 * iPhone below iOS 27: first the advice to update (automatic setup needs iOS 27), with the
 * manual path under it → intro → 8-step guide with screenshots and short recordings → done.
 * iOS 27 and later: intro → the two-step quick path with the shared shortcut (the manual guide
 * while that link is not set) → done.
 * Android: the notification-access explanation Google Play requires → settings → done.
 */

// Apple's own "Update your iPhone" page (opens in the browser).
const IOS_UPDATE_HELP_URL = 'https://support.apple.com/HT204204';

/** "Manual setup for iOS 26": always 26, as in the owner's reference (owner 2026-11-23). */
const manualVersion = 26;

/** Tap point in percent. `n` numbers the taps when a screenshot has more than one. */
type Mark = { x: number; y: number; n?: number };
type Shot = { source: ImageSourcePropType; ratio: number };
/** A short looping screen recording. `still`: the second shown, paused, with "reduce motion". */
type Clip = { source: number; ratio: number; still: number };
type GuideStep = { key: string } & ({ image: Shot; marks: Mark[] } | { clip: Clip });

// Screen recordings from the owner's iPhone (Hebrew, light), status bar cropped off, 384 × 800,
// no sound, the last frame held 1.5 s (owner 2026-11-24: a moving picture is clearer here).
// The search clip has the owner's other apps blurred for its first 1.5 s.
const CLIP_RATIO = 384 / 800;

// Screenshots from the owner's iOS 26 iPhone (Hebrew), status bar cropped off and the cards
// blurred, 600 px wide (`ratio` is width / height).
const GUIDE: GuideStep[] = [
  {
    key: 'automation',
    image: { source: require('../../../assets/images/purchase-setup/1-new-automation.jpg'), ratio: 600 / 1209 },
    marks: [{ x: 50, y: 60.5 }],
  },
  {
    key: 'wallet',
    image: { source: require('../../../assets/images/purchase-setup/2-wallet.jpg'), ratio: 600 / 1209 },
    marks: [{ x: 76, y: 49 }],
  },
  {
    key: 'cards',
    image: { source: require('../../../assets/images/purchase-setup/3-cards.jpg'), ratio: 600 / 722 },
    marks: [{ x: 12.2, y: 8 }],
  },
  {
    key: 'search',
    clip: { source: require('../../../assets/images/purchase-setup/4-search.mp4'), ratio: CLIP_RATIO, still: 8.5 },
  },
  {
    key: 'amount',
    clip: { source: require('../../../assets/images/purchase-setup/5-amount.mp4'), ratio: CLIP_RATIO, still: 9.5 },
  },
  {
    key: 'merchant',
    clip: { source: require('../../../assets/images/purchase-setup/6-merchant.mp4'), ratio: CLIP_RATIO, still: 9 },
  },
  {
    // ▶ at the bottom runs a test, then ✓ at the top saves (owner 2026-11-24).
    key: 'test',
    image: { source: require('../../../assets/images/purchase-setup/7-test.jpg'), ratio: 600 / 1212 },
    marks: [
      { x: 16.5, y: 93.1, n: 1 },
      { x: 9.7, y: 4.8, n: 2 },
    ],
  },
  {
    key: 'runNow',
    clip: { source: require('../../../assets/images/purchase-setup/8-run-immediately.mp4'), ratio: CLIP_RATIO, still: 8.5 },
  },
];

type Stage =
  | { name: 'update' }
  | { name: 'intro' }
  | { name: 'guide'; step: number }
  | { name: 'quickIntro' }
  | { name: 'quick'; step: number }
  | { name: 'android'; tried: boolean }
  | { name: 'done' };

function firstStage(): Stage {
  if (Platform.OS === 'android') return { name: 'android', tried: false };
  if (quickSetupHere) return { name: 'quickIntro' };
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
          onStart={() => setStage({ name: 'guide', step: 0 })}
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
    case 'quickIntro':
      return (
        <QuickIntro
          onClose={close}
          onStart={() => setStage({ name: 'quick', step: 0 })}
          onManual={() => setStage({ name: 'intro' })}
        />
      );
    case 'quick':
      return (
        <QuickStep
          step={stage.step}
          onClose={close}
          onBack={() => setStage(stage.step === 0 ? { name: 'quickIntro' } : { name: 'quick', step: stage.step - 1 })}
          onNext={() =>
            setStage(stage.step === QUICK_STEPS.length - 1 ? { name: 'done' } : { name: 'quick', step: stage.step + 1 })
          }
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
      {iosMajor >= 27 && !quickSetupHere && (
        <Note icon="information-outline" title={t('purchaseSetup.intro.ios27Title')} body={t('purchaseSetup.intro.ios27Body')} />
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
      {'clip' in current ? (
        <ClipView key={current.key} clip={current.clip} label={t(`${base}.title`)} />
      ) : (
        <Screenshot key={current.key} image={current.image} marks={current.marks} label={t(`${base}.title`)} />
      )}
    </Shell>
  );
}

/** A screenshot in a phone-like frame, with a soft pulsing mark on the place to tap. */
function Screenshot({ image, marks, label }: { image: Shot; marks: Mark[]; label: string }) {
  const { source, ratio } = image;
  return (
    <View
      className="self-center overflow-hidden rounded-[28px] border-4 border-border"
      style={{ width: ratio < 0.6 ? '54%' : ratio < 1 ? '72%' : '88%', aspectRatio: ratio }}
      accessible
      accessibilityRole="image"
      accessibilityLabel={label}>
      <Image source={source} style={{ width: '100%', height: '100%' }} resizeMode="cover" />
      {marks.map((mark) => (
        <TapMark key={`${mark.x}:${mark.y}`} mark={mark} />
      ))}
    </View>
  );
}

/** A screen recording that loops silently in the same phone-like frame. Still with "reduce motion". */
function ClipView({ clip, label }: { clip: Clip; label: string }) {
  const reduceMotion = useReducedMotion();
  // Each step mounts its own clip (keyed), so the setting at that moment decides.
  const player = useVideoPlayer(clip.source, (p) => {
    p.muted = true;
    p.loop = true;
    if (reduceMotion) p.currentTime = clip.still;
    else p.play();
  });
  return (
    <View
      className="self-center overflow-hidden rounded-[28px] border-4 border-border bg-black"
      style={{ width: '54%', aspectRatio: clip.ratio }}
      accessible
      accessibilityRole="image"
      accessibilityLabel={label}>
      <VideoView
        player={player}
        style={{ width: '100%', height: '100%' }}
        contentFit="cover"
        nativeControls={false}
        allowsPictureInPicture={false}
        surfaceType="textureView"
      />
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
      {mark.n != null && (
        <View
          style={{
            position: 'absolute',
            // Near the top edge the number goes under the ring, or the frame would cut it.
            ...(mark.y < 15 ? { bottom: -7 } : { top: -7 }),
            right: -7,
            width: 20,
            height: 20,
            borderRadius: 10,
            backgroundColor: MARK,
            alignItems: 'center',
            justifyContent: 'center',
          }}>
          <AppText weight="bold" className="text-center text-[12px]" style={{ color: palette.light.onPrimary }}>
            {mark.n}
          </AppText>
        </View>
      )}
    </View>
  );
}

// ---- iOS 27 and later: the shared shortcut (owner 2026-11-23, from the reference) ----------

/** The shared shortcut's name, so the app can open it in Shortcuts. */
const SHORTCUT_NAME = 'Kaspilo';
const openShortcut = () =>
  void Linking.openURL(`shortcuts://open-shortcut?name=${encodeURIComponent(SHORTCUT_NAME)}`).catch(() =>
    Linking.openURL('shortcuts://').catch(() => undefined),
  );
const addShortcut = () => void Linking.openURL(IOS27_SHORTCUT_URL).catch(() => undefined);

const QUICK_STEPS = [
  { key: 'add', icon: 'tray-arrow-down' },
  { key: 'turnOn', icon: 'lightning-bolt' },
  { key: 'run', icon: 'play' },
] as const;

function StepNumber({ n }: { n: number }) {
  return (
    <View className="h-11 w-11 items-center justify-center rounded-full bg-primary">
      <AppText weight="bold" tone="onPrimary" className="text-center text-[18px]">
        {String(n)}
      </AppText>
    </View>
  );
}

/** A small round letter that names a tap spot in a drawing ("A", "B"). */
function Badge({ label }: { label: string }) {
  return (
    <View className="h-6 w-6 items-center justify-center rounded-full bg-accent">
      <AppText weight="bold" tone="onAccent" className="text-center text-[12px]">
        {label}
      </AppText>
    </View>
  );
}

/** Overview: what the three steps are, then start, or the manual guide. */
function QuickIntro({ onClose, onStart, onManual }: { onClose: () => void; onStart: () => void; onManual: () => void }) {
  const { t } = useTranslation();
  const align = useRowAlign();
  return (
    <Shell
      onClose={onClose}
      footer={
        <>
          <Button label={t('purchaseSetup.quick.intro.start')} onPress={onStart} />
          <TextLink label={t('purchaseSetup.quick.intro.manual')} onPress={onManual} />
        </>
      }>
      <Title title={t('purchaseSetup.quick.intro.title')} body={t('purchaseSetup.quick.intro.body')} />
      <View className="gap-3">
        {QUICK_STEPS.map((step, index) => (
          <View key={step.key} className={`items-center gap-3 rounded-xl border border-border bg-surface p-4 ${align.row}`}>
            <StepNumber n={index + 1} />
            <View className="flex-1 gap-0.5">
              <AppText weight="bold" className="text-[16px]">
                {t(`purchaseSetup.quick.${step.key}.title`)}
              </AppText>
              <AppText tone="muted" className="text-[14px] leading-[20px]">
                {t(`purchaseSetup.quick.${step.key}.short`)}
              </AppText>
            </View>
            <Icon name={step.icon} tone="primary" size={24} />
          </View>
        ))}
      </View>
    </Shell>
  );
}

function QuickStep({
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
  const key = QUICK_STEPS[step].key;
  const base = `purchaseSetup.quick.${key}`;
  const back = <TextLink label={t('purchaseSetup.guide.back')} onPress={onBack} />;
  const footer =
    key === 'add' ? (
      <>
        <Button label={t(`${base}.open`)} onPress={addShortcut} />
        <TextLink label={t(`${base}.already`)} onPress={onNext} />
        {back}
      </>
    ) : key === 'turnOn' ? (
      <>
        <Button
          label={t(`${base}.open`)}
          onPress={() => {
            openShortcut();
            onNext();
          }}
        />
        {back}
      </>
    ) : (
      <>
        <Button label={t(`${base}.yes`)} onPress={onNext} />
        <Button variant="outline" label={t(`${base}.again`)} onPress={openShortcut} />
        {back}
      </>
    );
  return (
    <Shell progress={(step + 1) / QUICK_STEPS.length} onClose={onClose} footer={footer}>
      <View className="gap-2">
        <AppText tone="muted" className="text-[13px]">
          {t('purchaseSetup.guide.stepOf', { n: step + 1, total: QUICK_STEPS.length })}
        </AppText>
        <Title title={t(`${base}.${key === 'run' ? 'question' : 'title'}`)} body={t(`${base}.body`)} />
      </View>
      {key === 'add' && <AddShortcutArt />}
      {key === 'turnOn' && <TurnOnArt />}
      {key === 'run' && <RunArt />}
    </Shell>
  );
}

/** Step 1 drawing: the shared shortcut sheet, with its "Add Shortcut" button ringed. */
function AddShortcutArt() {
  const { t } = useTranslation();
  const align = useRowAlign();
  return (
    <View className="gap-4 rounded-2xl border border-border bg-surface p-5" accessibilityElementsHidden importantForAccessibility="no-hide-descendants">
      <View className={`items-center gap-4 ${align.row}`}>
        <View className="h-16 w-16 items-center justify-center rounded-2xl bg-background">
          <Wallet size={46} shadow={false} />
        </View>
        <AppText weight="bold" className="flex-1 text-[18px]">
          {t('purchaseSetup.quick.add.card')}
        </AppText>
      </View>
      <View className="items-center">
        <Icon name="arrow-down" tone="primary" size={30} />
      </View>
      <View className="rounded-full border-[3px] border-accent p-1">
        <View className="h-12 items-center justify-center rounded-full bg-primary">
          <AppText weight="bold" tone="onPrimary" className="text-center text-[18px]">
            {t('purchaseSetup.quick.add.button')}
          </AppText>
        </View>
      </View>
    </View>
  );
}

/** Step 2 drawing: tap the shortcut, then in the "When…" card the ‹ arrow (A) and the switch (B). */
function TurnOnArt() {
  const { t } = useTranslation();
  const align = useRowAlign();
  return (
    <View className="gap-3">
      <View className={`items-center gap-3 rounded-xl border border-border bg-surface p-4 ${align.row}`}>
        <StepNumber n={1} />
        <AppText weight="bold" className="flex-1 text-[16px]">
          {t('purchaseSetup.quick.turnOn.tap')}
        </AppText>
        <Icon name="gesture-tap" tone="primary" size={26} />
      </View>
      <View className="gap-3 rounded-xl border border-border bg-surface p-4">
        <View className={`items-center gap-3 ${align.row}`}>
          <StepNumber n={2} />
          <AppText weight="bold" className="flex-1 text-[16px]">
            {t('purchaseSetup.quick.turnOn.card')}
          </AppText>
        </View>
        <View
          className="gap-2 rounded-xl bg-background p-3"
          accessibilityElementsHidden
          importantForAccessibility="no-hide-descendants">
          <View className={`items-center gap-2 self-stretch rounded-full bg-surface px-3 py-1.5 ${align.row}`}>
            <Icon name="clock-remove-outline" tone="muted" size={18} />
            <AppText tone="muted" weight="medium" className="text-[13px]">
              {t('purchaseSetup.quick.turnOn.mockOff')}
            </AppText>
          </View>
          <View className={`items-center gap-2 px-1 ${align.row}`}>
            <Icon name="bell-outline" size={20} />
            <AppText weight="medium" className="flex-1 text-[14px]">
              {t('purchaseSetup.quick.turnOn.mockWhen')}
            </AppText>
            <Badge label="A" />
            <View className="h-9 w-9 items-center justify-center rounded-full border-[3px] border-accent">
              <Icon name="chevron-left" tone="primary" size={20} />
            </View>
          </View>
          <View className="items-center">
            <Icon name="arrow-down" tone="primary" size={20} />
          </View>
          <View className={`items-center gap-2 rounded-xl bg-surface px-3 py-2 ${align.row}`}>
            <AppText weight="medium" className="flex-1 text-[14px]">
              {t('purchaseSetup.quick.turnOn.mockSwitch')}
            </AppText>
            <Badge label="B" />
            <View className="rounded-full border-[3px] border-accent p-0.5">
              <View className="h-6 w-11 justify-center rounded-full bg-primary px-0.5">
                <View className="h-5 w-5 self-end rounded-full bg-surface" />
              </View>
            </View>
          </View>
        </View>
        <AppText tone="muted" className="text-[13px] leading-[19px]">
          {t('purchaseSetup.quick.turnOn.note')}
        </AppText>
      </View>
    </View>
  );
}

/** Step 3 drawing: the ▶ at the bottom of the shortcut, ringed. */
function RunArt() {
  const { t } = useTranslation();
  return (
    <View
      className="items-center gap-3 rounded-2xl border border-border bg-surface px-5 py-6"
      accessibilityElementsHidden
      importantForAccessibility="no-hide-descendants">
      <AppText weight="bold" className="text-center text-[18px]">
        {t('purchaseSetup.quick.run.mock')}
      </AppText>
      <Icon name="arrow-down" size={28} color={palette.light.accent} />
      <View className="rounded-full border-[3px] border-accent p-1.5">
        <View className="h-20 w-20 items-center justify-center rounded-full bg-primary">
          <Icon name="play" tone="onPrimary" size={44} />
        </View>
      </View>
    </View>
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
