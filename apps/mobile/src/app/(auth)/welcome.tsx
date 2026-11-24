import { amountToInput, type Currency, formatMoney, parseAmount } from '@kaspilo/shared';
import { router, useFocusEffect } from 'expo-router';
import { createContext, type ReactNode, use, useCallback, useEffect, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { BackHandler, KeyboardAvoidingView, Platform, ScrollView, useWindowDimensions, View } from 'react-native';
import Animated, {
  cancelAnimation,
  Easing,
  FadeInDown,
  type SharedValue,
  useAnimatedStyle,
  useReducedMotion,
  useSharedValue,
  withDelay,
  withRepeat,
  withSequence,
  withTiming,
} from 'react-native-reanimated';

import { appleAvailable } from '@/auth/apple';
import { useAuth } from '@/auth/AuthProvider';
import { resetTermsRead, useTermsRead } from '@/auth/terms';
import { checkName } from '@/auth/validation';
import { AppleLogo } from '@/components/AppleLogo';
import { GoogleLogo } from '@/components/GoogleLogo';
import { LanguageMenu } from '@/components/LanguageMenu';
import { Sprout } from '@/components/nature/Sprout';
import { Wallet } from '@/components/nature/Wallet';
import { AmountInput } from '@/components/ui/AmountField';
import { AppText } from '@/components/ui/AppText';
import { Button } from '@/components/ui/Button';
import { HugIcon } from '@/components/ui/HugIcon';
import { Icon } from '@/components/ui/Icon';
import { PressScale } from '@/components/ui/PressScale';
import { Screen } from '@/components/ui/Screen';
import { TextField } from '@/components/ui/TextField';
import { LANGUAGE_CURRENCY, useLanguage, useRowAlign } from '@/i18n';
import { getPermission, requestPermission } from '@/notifications';
import { clearOnboardingIntent, saveAnswers, startFromOnboarding, useOnboarding } from '@/onboarding/store';
import { purchaseDetectionAvailable, purchaseNeedsNewerIos, quickSetupHere } from '@/purchase';
import { useTheme } from '@/theme/ThemeProvider';

/**
 * Onboarding before sign-up (docs/spec.md "Onboarding"): value → name → monthly budget →
 * "Purchase detected" → ready (terms + create the account). The plant grows a stage per
 * screen. Answers stay on the phone until the account exists (see onboarding/store).
 */

type StepKey = 'value' | 'name' | 'budget' | 'purchase' | 'ready';

/** Part of the 4-part bar and how full that part is. */
const PROGRESS: Record<StepKey, { part: number; fill: number }> = {
  value: { part: 1, fill: 1 },
  name: { part: 2, fill: 0.5 },
  budget: { part: 2, fill: 1 },
  purchase: { part: 3, fill: 1 },
  ready: { part: 4, fill: 1 },
};

const GROWTH: Record<StepKey, number> = { value: 0, name: 1, budget: 3, purchase: 4, ready: 5 };

/** Budget chips, in whole units of the currency (owner 2026-11-23, none pre-selected). */
const BUDGET_CHIPS = [400_000, 600_000, 800_000, 1_000_000];

// The phone has to be able to catch purchases for that screen to make sense.
const showPurchase = purchaseDetectionAvailable && !purchaseNeedsNewerIos;
const STEPS: StepKey[] = showPurchase ? ['value', 'name', 'budget', 'purchase', 'ready'] : ['value', 'name', 'budget', 'ready'];

export default function WelcomeScreen() {
  const { height } = useWindowDimensions();
  const { answers } = useOnboarding();
  const [index, setIndex] = useState(0);
  const step = STEPS[index];
  const compact = height < 760;

  // Every visit reads the terms again before an account is made.
  useEffect(() => resetTermsRead(), []);

  const back = useCallback(() => {
    if (index === 0) return false;
    setIndex(index - 1);
    return true;
  }, [index]);
  const next = useCallback(() => setIndex((i) => Math.min(i + 1, STEPS.length - 1)), []);

  // Android back button: one screen back, then leave the app as usual.
  useEffect(() => {
    if (Platform.OS !== 'android') return;
    const sub = BackHandler.addEventListener('hardwareBackPress', back);
    return () => sub.remove();
  }, [back]);

  // Back from the purchase setup guide (done or closed): on to the last screen.
  const fromSetup = useRef(false);
  useFocusEffect(
    useCallback(() => {
      if (fromSetup.current) {
        fromSetup.current = false;
        next();
      }
    }, [next]),
  );

  return (
    <KeyboardAvoidingView style={{ flex: 1 }} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
      <Screen leaves="high" backdrop={false}>
        <Header index={index} step={step} onBack={back} />
        <ScrollView
          contentContainerStyle={{ flexGrow: 1 }}
          keyboardShouldPersistTaps="handled"
          showsVerticalScrollIndicator={false}>
          <Hero growth={GROWTH[step]} compact={compact} />
          <Animated.View key={step} entering={FadeInDown.duration(450)} className="flex-1 px-6 pb-6 pt-1">
            {step === 'value' && <ValueStep onNext={next} />}
            {step === 'name' && <NameStep initial={answers.name} onDone={next} />}
            {step === 'budget' && <BudgetStep name={answers.name} initial={answers.budget} onDone={next} />}
            {step === 'purchase' && (
              <PurchaseStep
                onSetup={() => {
                  fromSetup.current = true;
                  router.push('/setup-purchase');
                }}
                onLater={next}
              />
            )}
            {step === 'ready' && <ReadyStep />}
          </Animated.View>
        </ScrollView>
      </Screen>
    </KeyboardAvoidingView>
  );
}

// ---- frame ------------------------------------------------------------------

function Header({ index, step, onBack }: { index: number; step: StepKey; onBack: () => void }) {
  const { t } = useTranslation();
  const align = useRowAlign();
  const { part, fill } = PROGRESS[step];
  return (
    <View className="h-[56px] flex-row items-center gap-3 px-4">
      <View className="h-[44px] w-[44px]">
        {index > 0 && (
          <PressScale
            accessibilityRole="button"
            accessibilityLabel={t('common.back')}
            onPress={onBack}
            className="h-[44px] w-[44px] items-center justify-center rounded-full">
            <Icon name="chevron-left" size={28} />
          </PressScale>
        )}
      </View>
      <View
        className={`flex-1 gap-1.5 ${align.row}`}
        accessibilityRole="progressbar"
        accessibilityLabel={t('onboarding.progress', { step: part, total: 4 })}
        accessibilityValue={{ min: 1, max: 4, now: part }}>
        {[1, 2, 3, 4].map((i) => (
          <BarPart key={i} fill={i < part ? 1 : i === part ? fill : 0} fromRight={align.he} />
        ))}
      </View>
      {step === 'value' ? (
        <View className="h-[44px] min-w-[44px] items-end justify-center">
          <LanguageMenu />
        </View>
      ) : (
        <View className="h-[44px] w-[44px]" />
      )}
    </View>
  );
}

function BarPart({ fill, fromRight }: { fill: number; fromRight: boolean }) {
  const reduceMotion = useReducedMotion();
  const width = useSharedValue(fill);
  useEffect(() => {
    width.value = reduceMotion ? fill : withTiming(fill, { duration: 700, easing: Easing.out(Easing.cubic) });
  }, [fill, reduceMotion, width]);
  const style = useAnimatedStyle(() => ({ width: `${width.value * 100}%` }));
  return (
    <View className={`h-[6px] flex-1 overflow-hidden rounded-full bg-border ${fromRight ? 'items-end' : 'items-start'}`}>
      <Animated.View className="h-[6px] rounded-full bg-primary" style={style} />
    </View>
  );
}

/** The plant on its light-green circle, which breathes slowly (3 s). */
function Hero({ growth, compact }: { growth: number; compact: boolean }) {
  const reduceMotion = useReducedMotion();
  const circle = compact ? 190 : 240;
  const heroHeight = compact ? 200 : 250;
  const breath = useSharedValue(0);
  useEffect(() => {
    if (reduceMotion) {
      cancelAnimation(breath);
      breath.value = 0.5;
      return;
    }
    breath.value = withRepeat(withTiming(1, { duration: 3000, easing: Easing.inOut(Easing.sin) }), -1, true);
    return () => cancelAnimation(breath);
  }, [reduceMotion, breath]);
  const circleStyle = useAnimatedStyle(() => ({
    opacity: 0.5 + 0.35 * breath.value,
    transform: [{ scale: 0.94 + 0.1 * breath.value }],
  }));
  return (
    <View style={{ height: heroHeight }} className="items-center justify-end" pointerEvents="none">
      <Animated.View
        className="absolute rounded-full bg-leaf-light"
        style={[{ width: circle, height: circle, bottom: 6 }, circleStyle]}
      />
      <Sprout growth={growth} size={heroHeight - 34} />
    </View>
  );
}

function Title({ children }: { children: string }) {
  return (
    <AppText weight="bold" accessibilityRole="header" className="text-[27px] leading-[34px]">
      {children}
    </AppText>
  );
}

function Body({ children }: { children: string }) {
  return (
    <AppText tone="muted" className="text-[16px] leading-[24px]">
      {children}
    </AppText>
  );
}

/** Pushes the buttons to the bottom of the screen. */
function Bottom({ children, lift = 0 }: { children: ReactNode; lift?: number }) {
  return (
    <>
      <View className="min-h-[16px] flex-1" />
      <View className="gap-1" style={{ paddingBottom: lift }}>
        {children}
      </View>
    </>
  );
}

function TextButton({ label, onPress, strong = false, disabled }: {
  label: string;
  onPress: () => void;
  strong?: boolean;
  disabled?: boolean;
}) {
  return (
    <PressScale
      accessibilityRole="button"
      accessibilityLabel={label}
      accessibilityState={{ disabled: !!disabled }}
      disabled={disabled}
      onPress={onPress}
      className={`min-h-[48px] items-center justify-center ${disabled ? 'opacity-50' : ''}`}>
      <AppText tone="primary" weight={strong ? 'bold' : 'medium'} className="text-center text-[15px]">
        {label}
      </AppText>
    </PressScale>
  );
}

// ---- 1. value ---------------------------------------------------------------

function ValueStep({ onNext }: { onNext: () => void }) {
  const { t } = useTranslation();
  const align = useRowAlign();
  const features = [
    { icon: 'receipt-text-outline', label: t('onboarding.value.feature1') },
    { icon: 'target', label: t('onboarding.value.feature2') },
    { icon: 'chart-bar', label: t('onboarding.value.feature3') },
  ];
  return (
    <>
      <View className="gap-3">
        <AppText tone="primary" weight="medium" className="text-[14px]">
          {t('onboarding.value.eyebrow')}
        </AppText>
        <AppText weight="bold" accessibilityRole="header" className="text-[29px] leading-[36px]">
          {t('onboarding.value.title')}
        </AppText>
        <Body>{t('onboarding.value.body')}</Body>
        <View className="mt-1 gap-2.5">
          {features.map((f) => (
            <View key={f.icon} className={`items-center gap-3 ${align.row}`}>
              <View className="h-10 w-10 items-center justify-center rounded-md border border-border bg-surface">
                <Icon name={f.icon} tone="primary" size={22} />
              </View>
              <AppText className="flex-1 text-[15px]">{f.label}</AppText>
            </View>
          ))}
        </View>
      </View>
      {/* Lifted 12 pt above the other screens' button (owner 2026-11-23). */}
      <Bottom lift={12}>
        <Button label={t('onboarding.value.start')} onPress={onNext} />
        <PressScale
          accessibilityRole="link"
          accessibilityLabel={`${t('onboarding.value.haveAccount')} ${t('onboarding.value.signIn')}`}
          onPress={() => router.push('/sign-in')}
          className="min-h-[48px] items-center justify-center">
          <AppText className="text-center text-[15px]">
            {t('onboarding.value.haveAccount')}{' '}
            <AppText tone="primary" weight="bold" className="text-[15px] underline">
              {t('onboarding.value.signIn')}
            </AppText>
          </AppText>
        </PressScale>
      </Bottom>
    </>
  );
}

// ---- 2. name ----------------------------------------------------------------

function NameStep({ initial, onDone }: { initial: string; onDone: () => void }) {
  const { t } = useTranslation();
  const [name, setName] = useState(initial);
  const [error, setError] = useState<string | null>(null);
  const submit = () => {
    const problem = checkName(name);
    if (problem) return setError(t(problem));
    saveAnswers({ name: name.trim() });
    onDone();
  };
  return (
    <>
      <View className="gap-3">
        <Title>{t('onboarding.name.title')}</Title>
        <Body>{t('onboarding.name.body')}</Body>
        <TextField
          label={t('onboarding.name.label')}
          value={name}
          onChangeText={(value) => {
            setName(value);
            if (error) setError(null);
          }}
          error={error}
          autoComplete="name"
          textContentType="givenName"
          returnKeyType="next"
          onSubmitEditing={submit}
        />
      </View>
      <Bottom>
        <Button label={t('onboarding.continue')} onPress={submit} disabled={name.trim().length === 0} />
        <TextButton
          label={t('onboarding.later')}
          onPress={() => {
            saveAnswers({ name: '' });
            onDone();
          }}
        />
      </Bottom>
    </>
  );
}

// ---- 3. monthly budget ------------------------------------------------------

/** Before sign-up the currency follows the app language (owner 2026-11-23). */
function useOnboardingCurrency(): Currency {
  return LANGUAGE_CURRENCY[useLanguage()];
}

function BudgetStep({ name, initial, onDone }: { name: string; initial: number | null; onDone: () => void }) {
  const { t } = useTranslation();
  const currency = useOnboardingCurrency();
  const align = useRowAlign();
  const [value, setValue] = useState(initial ? amountToInput(initial) : '');
  const amount = parseAmount(value);
  const valid = amount !== null && amount > 0;
  return (
    <>
      <View className="gap-3">
        <Title>{name ? t('onboarding.budget.title', { name }) : t('onboarding.budget.titleNoName')}</Title>
        <AmountInput value={value} onChangeText={setValue} label={t('onboarding.budget.label')} currency={currency} />
        {/* Smallest first: at the right in Hebrew, at the left in English. */}
        <View className={`gap-2 ${align.row}`}>
          {BUDGET_CHIPS.map((chip) => {
            const on = amount === chip;
            return (
              <PressScale
                key={chip}
                accessibilityRole="button"
                accessibilityState={{ selected: on }}
                accessibilityLabel={formatMoney(chip, currency)}
                onPress={() => setValue(amountToInput(chip))}
                className={`min-h-[44px] flex-1 items-center justify-center rounded-full border ${
                  on ? 'border-primary bg-primary' : 'border-border bg-surface'
                }`}>
                <AppText weight="medium" tone={on ? 'onPrimary' : 'text'} className="text-[14px]">
                  {formatMoney(chip, currency)}
                </AppText>
              </PressScale>
            );
          })}
        </View>
        <AppText tone="muted" className="text-[14px]">
          {t('onboarding.budget.note')}
        </AppText>
      </View>
      <Bottom>
        <Button
          label={t('onboarding.continue')}
          disabled={!valid}
          onPress={() => {
            if (!valid) return;
            saveAnswers({ budget: amount });
            onDone();
          }}
        />
        <TextButton
          label={t('onboarding.later')}
          onPress={() => {
            saveAnswers({ budget: null });
            onDone();
          }}
        />
      </Bottom>
    </>
  );
}

// ---- 4. purchase detected ---------------------------------------------------

function PurchaseStep({ onSetup, onLater }: { onSetup: () => void; onLater: () => void }) {
  const { t } = useTranslation();
  const align = useRowAlign();
  const currency = useOnboardingCurrency();
  const android = Platform.OS === 'android';
  const automatic = quickSetupHere;
  const chip = android
    ? t('onboarding.purchase.chipAndroid')
    : automatic
      ? t('onboarding.purchase.chipAuto')
      : t('onboarding.purchase.chipManual', { version: 26 });
  const note = android
    ? t('onboarding.purchase.noteAndroid')
    : automatic
      ? t('onboarding.purchase.noteAuto')
      : t('onboarding.purchase.noteManual');
  const setupLabel = android
    ? t('onboarding.purchase.setupAndroid')
    : automatic
      ? t('onboarding.purchase.setupAuto')
      : t('onboarding.purchase.setupManual');

  const setup = async () => {
    // Notification permission is asked here only, right when it is needed (docs/spec.md).
    if ((await getPermission()) === 'undetermined') await requestPermission();
    onSetup();
  };

  return (
    <>
      <View className="gap-3">
        <Title>{android ? t('onboarding.purchase.titleGoogle') : t('onboarding.purchase.titleApple')}</Title>
        <View className={align.he ? 'items-end' : 'items-start'}>
          <View className="min-h-[28px] justify-center rounded-full border border-border bg-surface px-3">
            <AppText tone="primary" weight="medium" className="text-[13px]">
              {chip}
            </AppText>
          </View>
        </View>
        <DemoNotification currency={currency} android={android} />
        <View className="mt-1 gap-2">
          {[t('onboarding.purchase.how1'), t('onboarding.purchase.how2'), t('onboarding.purchase.how3')].map(
            (label, i) => (
              <View key={label} className={`items-center gap-2.5 ${align.row}`}>
                <View className="h-[26px] w-[26px] items-center justify-center rounded-full bg-leaf-light">
                  <AppText weight="bold" tone="primary" className="text-[13px]">
                    {String(i + 1)}
                  </AppText>
                </View>
                <AppText className="flex-1 text-[15px]">{label}</AppText>
              </View>
            ),
          )}
        </View>
        <AppText tone="muted" className="text-[13px] leading-[19px]">
          {note}
        </AppText>
      </View>
      <Bottom>
        <Button label={setupLabel} onPress={() => void setup()} />
        <TextButton label={t('onboarding.purchase.later')} onPress={onLater} />
        <AppText tone="muted" className="text-center text-[12px]">
          {t('onboarding.purchase.permissionNote')}
        </AppText>
      </Bottom>
    </>
  );
}

/** A made-up reminder that slides in, in the phone's own notification style. */
function DemoNotification({ currency, android }: { currency: Currency; android: boolean }) {
  const { t } = useTranslation();
  const align = useRowAlign();
  const body = t('notifications.purchaseAlert.withAmount', {
    amount: formatMoney(4290, currency),
    merchant: t('onboarding.purchase.demoMerchant'),
  });
  const title = t('notifications.purchaseAlert.title');
  return (
    <Animated.View
      entering={FadeInDown.delay(500).duration(600)}
      accessible
      accessibilityLabel={`${title}. ${body}`}
      className={`border border-border bg-surface ${android ? 'gap-1 rounded-lg px-4 py-3' : `items-center gap-3 rounded-xl px-3.5 py-3 ${align.row}`}`}>
      {android ? (
        <>
          <View className={`items-center gap-2 ${align.row}`}>
            <View className="h-[22px] w-[22px] items-center justify-center rounded-full bg-primary">
              <Icon name="wallet-outline" tone="onPrimary" size={13} />
            </View>
            <AppText tone="muted" className="text-[12px]">{`Kaspilo · ${t('onboarding.purchase.now')}`}</AppText>
          </View>
          <AppText weight="bold" className="text-[15px]">
            {title}
          </AppText>
          <AppText className="text-[14px]">{body}</AppText>
        </>
      ) : (
        <>
          <View className="h-[38px] w-[38px] items-center justify-center rounded-sm bg-surface-muted">
            <Wallet size={28} shadow={false} />
          </View>
          <View className="flex-1 gap-0.5">
            <View className={`items-baseline justify-between ${align.row}`}>
              <AppText weight="bold" className="text-[15px]">
                {title}
              </AppText>
              <AppText tone="muted" className="text-[12px]">
                {t('onboarding.purchase.now')}
              </AppText>
            </View>
            <AppText className="text-[15px]">{body}</AppText>
          </View>
        </>
      )}
    </Animated.View>
  );
}

// ---- terms button nudge (owner 2026-11-24, option C) ----------------------------

/** 0 → 1 → 0 progress of the one-time nudge, shared by the lift and the tint. */
const NudgeContext = createContext<SharedValue<number> | null>(null);

/**
 * Once, shortly after the ready screen opens with the terms still unread: the terms button
 * lifts a little, turns light green for a moment and settles with a small bounce. Not again
 * on this visit, never with "reduce motion" (docs/spec.md "Onboarding").
 */
function TermsNudge({ play, children }: { play: boolean; children: ReactNode }) {
  const reduceMotion = useReducedMotion();
  const lift = useSharedValue(0);
  const played = useRef(false);

  useEffect(() => {
    if (!play || reduceMotion || played.current) return;
    played.current = true;
    const ease = Easing.inOut(Easing.quad);
    // Slow and calm (owner 2026-11-24): about 2.8 s in all.
    lift.value = withDelay(
      900,
      withSequence(
        withTiming(1, { duration: 750, easing: ease }),
        withTiming(-0.25, { duration: 650, easing: ease }),
        withTiming(0.5, { duration: 550, easing: ease }),
        withTiming(0, { duration: 850, easing: ease }),
      ),
    );
  }, [play, reduceMotion, lift]);

  const style = useAnimatedStyle(() => ({
    transform: [{ translateY: -3 * Math.max(lift.value, 0) }, { scale: 1 + 0.04 * lift.value }],
  }));

  return (
    <NudgeContext value={lift}>
      <Animated.View style={style}>{children}</Animated.View>
    </NudgeContext>
  );
}

/** Light green wash behind the button's content while the nudge plays. */
function NudgeTint() {
  const { colors } = useTheme();
  const lift = use(NudgeContext);
  const style = useAnimatedStyle(() => ({ opacity: lift ? Math.max(lift.value, 0) : 0 }));
  return (
    <Animated.View
      pointerEvents="none"
      style={[{ position: 'absolute', top: 0, right: 0, bottom: 0, left: 0, borderRadius: 16, backgroundColor: colors.leafLight }, style]}
    />
  );
}

// ---- 5. ready ---------------------------------------------------------------

function ReadyStep() {
  const { t } = useTranslation();
  const { colors } = useTheme();
  const align = useRowAlign();
  const currency = useOnboardingCurrency();
  const { answers } = useOnboarding();
  const { signInWithGoogle, signInWithApple } = useAuth();
  const termsRead = useTermsRead();
  const [showApple, setShowApple] = useState(false);
  const [busy, setBusy] = useState<'google' | 'apple' | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    void appleAvailable().then(setShowApple);
  }, []);

  const withProvider = async (provider: 'google' | 'apple') => {
    setError(null);
    setBusy(provider);
    startFromOnboarding({ termsAccepted: true });
    const failure = provider === 'google' ? await signInWithGoogle() : await signInWithApple();
    setBusy(null);
    // On success the root guard moves on and the onboarding store saves the answers.
    if (failure) {
      clearOnboardingIntent();
      if (failure !== 'cancelled') setError(t(provider === 'google' ? 'auth.googleFailed' : 'auth.appleFailed'));
    }
  };

  const later = t('onboarding.later');
  const rows = [
    { label: t('onboarding.ready.name'), value: answers.name || later, given: !!answers.name },
    {
      label: t('onboarding.ready.budget'),
      value: answers.budget ? formatMoney(answers.budget, currency) : later,
      given: !!answers.budget,
    },
  ];
  const locked = !termsRead || busy !== null;

  return (
    <View className="gap-2.5">
      <Title>
        {answers.name ? t('onboarding.ready.title', { name: answers.name }) : t('onboarding.ready.titleNoName')}
      </Title>
      <Body>{t('onboarding.ready.body')}</Body>
      <View className="rounded-lg border border-border bg-surface px-4">
        {rows.map((row, i) => (
          <View
            key={row.label}
            className={`min-h-[44px] items-center justify-between gap-3 ${align.row} ${i === 0 ? 'border-b border-surface-muted' : ''}`}>
            <AppText tone="muted" className="text-[14px]">
              {row.label}
            </AppText>
            <AppText weight={row.given ? 'medium' : 'regular'} tone={row.given ? 'text' : 'muted'} className="text-[15px]">
              {row.value}
            </AppText>
          </View>
        ))}
      </View>
      <TermsNudge play={!termsRead}>
        <PressScale
          accessibilityRole="button"
          accessibilityLabel={t('terms.openLink')}
          accessibilityState={{ checked: termsRead }}
          onPress={() => router.push('/terms')}
          className={`min-h-[52px] items-center gap-3 rounded-lg border px-4 ${align.row} ${
            termsRead ? 'border-primary bg-primary' : 'border-border bg-surface'
          }`}>
          {!termsRead && <NudgeTint />}
          {termsRead ? <Icon name="check-circle" tone="onPrimary" /> : <HugIcon color={colors.text} />}
          <AppText tone={termsRead ? 'onPrimary' : 'text'} weight="medium" className="flex-1 text-[15px]">
            {termsRead ? t('terms.done') : t('terms.openLink')}
          </AppText>
        </PressScale>
      </TermsNudge>

      <View className="my-2 h-px bg-border" />

      {showApple && (
        <Button
          label={t('auth.apple')}
          variant="outline"
          icon={<AppleLogo />}
          onPress={() => void withProvider('apple')}
          loading={busy === 'apple'}
          disabled={locked}
        />
      )}
      <Button
        label={t('auth.google')}
        variant="outline"
        icon={<GoogleLogo />}
        onPress={() => void withProvider('google')}
        loading={busy === 'google'}
        disabled={locked}
      />
      <TextButton
        strong
        label={t('onboarding.ready.email')}
        disabled={locked}
        onPress={() => {
          startFromOnboarding({ termsAccepted: true });
          router.push('/sign-up');
        }}
      />
      {error ? (
        <AppText tone="danger" className="text-[14px]" accessibilityLiveRegion="polite">
          {error}
        </AppText>
      ) : null}
      <View className={`items-center justify-center gap-1.5 ${align.row}`}>
        <Icon name="lock-outline" tone="primary" size={15} />
        <AppText tone="muted" className="text-[13px]">
          {t('onboarding.ready.privacy')}
        </AppText>
      </View>
    </View>
  );
}
