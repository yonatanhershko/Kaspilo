import { router } from 'expo-router';
import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { KeyboardAvoidingView, Platform, View } from 'react-native';

import { authErrorText, useAuth } from '@/auth/AuthProvider';
import { useTermsRead } from '@/auth/terms';
import { checkEmail, checkName, checkPassword, MIN_PASSWORD_LENGTH } from '@/auth/validation';
import { WalletHero } from '@/components/nature/WalletHero';
import { AppText } from '@/components/ui/AppText';
import { Button } from '@/components/ui/Button';
import { HugIcon } from '@/components/ui/HugIcon';
import { Icon } from '@/components/ui/Icon';
import { Screen } from '@/components/ui/Screen';
import { TextField } from '@/components/ui/TextField';
import { useRowAlign } from '@/i18n';
import { useOnboarding } from '@/onboarding/store';
import { useTheme } from '@/theme/ThemeProvider';
import { PressScale } from '@/components/ui/PressScale';

const ALL_STEPS = ['name', 'email', 'password'] as const;
type Step = (typeof ALL_STEPS)[number];

/**
 * Email sign-up, opened from onboarding's last screen (docs/spec.md "Sign-in"): email, then
 * password. A name step comes first only when the name was skipped in onboarding; the pencil
 * on the name row brings it back. The terms were accepted in onboarding; the tab shows here
 * only if they were not. The wallet and its leaves stay on screen the whole way.
 */
export default function SignUpScreen() {
  const { t } = useTranslation();
  const { colors } = useTheme();
  const { signUp } = useAuth();
  const onboardingName = useOnboarding().answers.name;
  const [steps, setSteps] = useState<readonly Step[]>(onboardingName ? ['email', 'password'] : ALL_STEPS);
  const [stepIndex, setStepIndex] = useState(0);
  const [name, setName] = useState(onboardingName);
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const termsRead = useTermsRead();
  const align = useRowAlign();

  const step = steps[stepIndex];
  const hasNameStep = steps[0] === 'name';

  const next = async () => {
    const problem =
      step === 'name' ? checkName(name) : step === 'email' ? checkEmail(email) : checkPassword(password);
    if (problem) {
      setError(t(problem, { min: MIN_PASSWORD_LENGTH }));
      return;
    }
    if (step === 'email' && !termsRead) {
      setError(t('terms.readFirst'));
      return;
    }
    setError(null);
    if (step !== 'password') {
      setStepIndex(stepIndex + 1);
      return;
    }
    setBusy(true);
    const failure = await signUp(name, email, password);
    setBusy(false);
    // On success the guard moves the new user to the locked (pending) screen.
    if (failure) {
      setError(authErrorText(t, failure));
      if (failure === 'emailTaken' || failure === 'emailInvalid') setStepIndex(steps.indexOf('email'));
    }
  };

  const back = () => {
    setError(null);
    if (stepIndex > 0) setStepIndex(stepIndex - 1);
    else if (router.canGoBack()) router.back();
    else router.replace('/sign-in');
  };

  return (
    <KeyboardAvoidingView
      style={{ flex: 1 }}
      behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
      <Screen leaves="high" scroll className="items-center px-6 pb-8 pt-2">
        <WalletHero size={210} />
        <AppText weight="bold" className="text-[26px]">
          {t('auth.signUpTitle')}
        </AppText>

        <View
          className="my-4 flex-row gap-2"
          accessibilityRole="progressbar"
          accessibilityLabel={t('auth.stepOf', { step: stepIndex + 1, total: steps.length })}
          accessibilityValue={{ min: 1, max: steps.length, now: stepIndex + 1 }}>
          {/* Fills from the right in Hebrew, from the left in English (owner 2026-11-20). */}
          {steps.map((s, i) => {
            const done = (align.he ? steps.length - 1 - i : i) <= stepIndex;
            return <View key={s} className={`h-[6px] w-10 rounded-full ${done ? 'bg-primary' : 'bg-border'}`} />;
          })}
        </View>

        <View className="w-full gap-4">
          {step !== 'name' && (
            <View className="overflow-hidden rounded-lg border border-border bg-surface">
              {[
                { target: 'name' as const, icon: 'account-outline', value: name.trim() },
                ...(step === 'password' ? [{ target: 'email' as const, icon: 'email-outline', value: email.trim() }] : []),
              ].map((row) => (
                <PressScale
                  key={row.target}
                  accessibilityRole="button"
                  accessibilityLabel={`${t('common.edit')}: ${row.value}`}
                  disabled={busy}
                  onPress={() => {
                    setError(null);
                    // The onboarding name has no step of its own until it is edited.
                    if (row.target === 'name' && !hasNameStep) setSteps(ALL_STEPS);
                    setStepIndex(row.target === 'name' ? 0 : ALL_STEPS.indexOf('email') - (hasNameStep ? 0 : 1));
                  }}
                  className={`min-h-[44px] items-center gap-3 px-4 ${align.row}`}>
                  <Icon name={row.icon} tone="muted" size={20} />
                  <AppText className="flex-1 text-[15px]" numberOfLines={1}>
                    {row.value}
                  </AppText>
                  <Icon name="pencil-outline" tone="muted" size={18} />
                </PressScale>
              ))}
            </View>
          )}
          {step === 'name' && (
            <TextField
              key="name"
              label={t('auth.fullName')}
              value={name}
              onChangeText={setName}
              error={error}
              autoFocus
              autoComplete="name"
              textContentType="name"
              returnKeyType="next"
              onSubmitEditing={next}
            />
          )}
          {step === 'email' && (
            <TextField
              key="email"
              label={t('auth.email')}
              value={email}
              onChangeText={setEmail}
              error={error}
              autoFocus
              keyboardType="email-address"
              autoCapitalize="none"
              autoComplete="email"
              autoCorrect={false}
              textContentType="emailAddress"
              returnKeyType="next"
              onSubmitEditing={next}
            />
          )}
          {step === 'password' && (
            <TextField
              key="password"
              label={t('auth.choosePassword', { min: MIN_PASSWORD_LENGTH })}
              value={password}
              onChangeText={setPassword}
              error={error}
              autoFocus
              secureTextEntry
              autoCapitalize="none"
              autoComplete="new-password"
              textContentType="newPassword"
              returnKeyType="next"
              onSubmitEditing={next}
            />
          )}
          {step === 'email' && !termsRead && (
            <PressScale
              accessibilityRole="button"
              accessibilityLabel={t('terms.openLink')}
              accessibilityState={{ checked: termsRead }}
              onPress={() => router.push('/terms')}
              className={`min-h-[52px] items-center gap-3 rounded-lg border px-4 ${align.row} ${
                termsRead ? 'border-primary bg-primary' : 'border-border bg-surface'
              }`}>
              {termsRead ? (
                <Icon name="check-circle" tone="onPrimary" />
              ) : (
                <HugIcon color={colors.text} />
              )}
              <AppText
                tone={termsRead ? 'onPrimary' : 'text'}
                weight="medium"
                className="flex-1 text-[15px]">
                {termsRead ? t('terms.done') : t('terms.openLink')}
              </AppText>
            </PressScale>
          )}
          <Button
            label={step === 'password' ? t('auth.createAccount') : t('common.next')}
            onPress={next}
            loading={busy}
            disabled={step === 'email' && !termsRead}
          />
          <Button label={t('common.back')} variant="outline" onPress={back} disabled={busy} />
        </View>

        <PressScale
          accessibilityRole="link"
          onPress={() => router.replace('/sign-in')}
          className="mt-5 min-h-[44px] justify-center">
          <AppText tone="primary" weight="medium" className="text-[15px]">
            {t('auth.haveAccount')}
          </AppText>
        </PressScale>
      </Screen>
    </KeyboardAvoidingView>
  );
}
