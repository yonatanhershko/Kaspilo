import { router } from 'expo-router';
import { useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { KeyboardAvoidingView, Platform, View } from 'react-native';

import { appleAvailable } from '@/auth/apple';
import { authErrorText, useAuth } from '@/auth/AuthProvider';
import { checkEmail } from '@/auth/validation';
import { AppleLogo } from '@/components/AppleLogo';
import { GoogleLogo } from '@/components/GoogleLogo';
import { WalletHero } from '@/components/nature/WalletHero';
import { AppText } from '@/components/ui/AppText';
import { Button } from '@/components/ui/Button';
import { Screen } from '@/components/ui/Screen';
import { TextField } from '@/components/ui/TextField';
import { PressScale } from '@/components/ui/PressScale';

export default function SignInScreen() {
  const { t } = useTranslation();
  const { signIn, signInWithGoogle, signInWithApple } = useAuth();
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [emailError, setEmailError] = useState<string | null>(null);
  const [formError, setFormError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const [googleBusy, setGoogleBusy] = useState(false);

  const google = async () => {
    setFormError(null);
    setGoogleBusy(true);
    const error = await signInWithGoogle();
    setGoogleBusy(false);
    // Closing the Google page is not an error. On success the guard moves on.
    if (error && error !== 'cancelled') setFormError(t('auth.googleFailed'));
  };

  // iPhone only (docs/spec.md "Auth").
  const [showApple, setShowApple] = useState(false);
  const [appleBusy, setAppleBusy] = useState(false);
  useEffect(() => {
    void appleAvailable().then(setShowApple);
  }, []);

  const apple = async () => {
    setFormError(null);
    setAppleBusy(true);
    const error = await signInWithApple();
    setAppleBusy(false);
    if (error && error !== 'cancelled') setFormError(t('auth.appleFailed'));
  };

  const otherBusy = busy || googleBusy || appleBusy;

  const submit = async () => {
    const emailProblem = checkEmail(email);
    setEmailError(emailProblem ? t(emailProblem) : null);
    if (emailProblem || password.length === 0) {
      if (password.length === 0) setFormError(t('auth.errors.passwordRequired'));
      return;
    }
    setFormError(null);
    setBusy(true);
    const error = await signIn(email, password);
    setBusy(false);
    // On success the guard in the root layout moves to the right area.
    if (error) setFormError(authErrorText(t, error));
  };

  return (
    <KeyboardAvoidingView
      style={{ flex: 1 }}
      behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
      <Screen leaves="high" scroll className="items-center px-6 pb-8 pt-2">
        <WalletHero size={210} />
        <AppText weight="bold" className="mb-5 text-[26px]">
          {t('auth.signInTitle')}
        </AppText>
        <View className="w-full gap-4">
          <TextField
            label={t('auth.email')}
            value={email}
            onChangeText={setEmail}
            error={emailError}
            keyboardType="email-address"
            autoCapitalize="none"
            autoComplete="email"
            autoCorrect={false}
            textContentType="emailAddress"
            returnKeyType="next"
          />
          <TextField
            label={t('auth.password')}
            value={password}
            onChangeText={setPassword}
            secureTextEntry
            autoCapitalize="none"
            autoComplete="current-password"
            textContentType="password"
            returnKeyType="go"
            onSubmitEditing={submit}
          />
          {formError ? (
            <AppText tone="danger" className="text-[14px]" accessibilityLiveRegion="polite">
              {formError}
            </AppText>
          ) : null}
          <Button label={t('auth.signIn')} onPress={submit} loading={busy} />
          <PressScale
            accessibilityRole="link"
            onPress={() => router.push('/forgot')}
            className="min-h-[44px] items-center justify-center">
            <AppText tone="primary" weight="medium" className="text-[15px]">
              {t('auth.forgot.link')}
            </AppText>
          </PressScale>
          <View className="flex-row items-center gap-3" accessible={false}>
            <View className="h-px flex-1 bg-border" />
            <AppText tone="muted" className="text-center text-[14px]">
              {t('auth.or')}
            </AppText>
            <View className="h-px flex-1 bg-border" />
          </View>
           {showApple ? (
            <Button
              label={t('auth.apple')}
              variant="outline"
              icon={<AppleLogo />}
              onPress={apple}
              loading={appleBusy}
              disabled={otherBusy && !appleBusy}
            />
          ) : null}
          <Button
            label={t('auth.google')}
            variant="outline"
            icon={<GoogleLogo />}
            onPress={google}
            loading={googleBusy}
            disabled={otherBusy && !googleBusy}
          />
        </View>
        <PressScale
          accessibilityRole="link"
          onPress={() => router.replace('/sign-up')}
          className="mt-5 min-h-[44px] justify-center">
          <AppText tone="primary" weight="medium" className="text-[15px]">
            {t('auth.noAccount')}
          </AppText>
        </PressScale>
      </Screen>
    </KeyboardAvoidingView>
  );
}
