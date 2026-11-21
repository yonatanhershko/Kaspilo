import { router } from 'expo-router';
import { useEffect, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { KeyboardAvoidingView, Platform, View } from 'react-native';

import { authErrorText, useAuth } from '@/auth/AuthProvider';
import { resetTermsRead, useTermsRead } from '@/auth/terms';
import { checkEmail, checkName, checkPassword, MIN_PASSWORD_LENGTH } from '@/auth/validation';
import { WalletHero } from '@/components/nature/WalletHero';
import { AppText } from '@/components/ui/AppText';
import { Button } from '@/components/ui/Button';
import { HugIcon } from '@/components/ui/HugIcon';
import { Icon } from '@/components/ui/Icon';
import { Screen } from '@/components/ui/Screen';
import { TextField } from '@/components/ui/TextField';
import { useRowAlign } from '@/i18n';
import { trackSignupStarted } from '@/lib/analytics';
import { useTheme } from '@/theme/ThemeProvider';
import { PressScale } from '@/components/ui/PressScale';

const STEPS = ['name', 'email', 'password'] as const;

/**
 * Register in three short steps. The email step also holds the terms tab. The wallet and its leaves stay on screen
 * the whole way; only the field under them changes.
 */
export default function SignUpScreen() {
  const { t } = useTranslation();
  const { colors } = useTheme();
  const { signUp } = useAuth();
  const [stepIndex, setStepIndex] = useState(0);
  // Analytics: "sign-up started" once per visit (docs/spec.md "Analytics").
  const startedSent = useRef(false);
  const [name, setName] = useState('');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const termsRead = useTermsRead();
  const align = useRowAlign();

  // Every new sign-up reads the terms again.
  useEffect(() => resetTermsRead(), []);

  const step = STEPS[stepIndex];

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
    if (step === 'name' && !startedSent.current) {
      startedSent.current = true;
      trackSignupStarted();
    }
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
      if (failure === 'emailTaken' || failure === 'emailInvalid') setStepIndex(1);
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
          accessibilityLabel={t('auth.stepOf', { step: stepIndex + 1, total: STEPS.length })}
          accessibilityValue={{ min: 1, max: STEPS.length, now: stepIndex + 1 }}>
          {/* Fills from the right in Hebrew, from the left in English (owner 2026-11-20). */}
          {STEPS.map((s, i) => {
            const done = (align.he ? STEPS.length - 1 - i : i) <= stepIndex;
            return <View key={s} className={`h-[6px] w-10 rounded-full ${done ? 'bg-primary' : 'bg-border'}`} />;
          })}
        </View>

        <View className="w-full gap-4">
          {stepIndex > 0 && (
            <View className="overflow-hidden rounded-lg border border-border bg-surface">
              {[
                { index: 0, icon: 'account-outline', value: name.trim() },
                ...(stepIndex > 1 ? [{ index: 1, icon: 'email-outline', value: email.trim() }] : []),
              ].map((row) => (
                <PressScale
                  key={row.index}
                  accessibilityRole="button"
                  accessibilityLabel={`${t('common.edit')}: ${row.value}`}
                  disabled={busy}
                  onPress={() => {
                    setError(null);
                    setStepIndex(row.index);
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
          {step === 'email' && (
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
