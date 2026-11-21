import { router } from 'expo-router';
import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { KeyboardAvoidingView, Platform, View } from 'react-native';

import { authErrorText, useAuth } from '@/auth/AuthProvider';
import { checkEmail, checkPassword, MIN_PASSWORD_LENGTH } from '@/auth/validation';
import { WalletHero } from '@/components/nature/WalletHero';
import { AppText } from '@/components/ui/AppText';
import { Button } from '@/components/ui/Button';
import { Screen } from '@/components/ui/Screen';
import { TextField } from '@/components/ui/TextField';
import { PressScale } from '@/components/ui/PressScale';

/**
 * Forgot password in two steps: email -> code from the email + new password.
 * On success the user is signed in and the root guard sends them on.
 */
export default function ForgotPasswordScreen() {
  const { t } = useTranslation();
  const { requestPasswordReset, resetPassword } = useAuth();
  const [step, setStep] = useState<'email' | 'code'>('email');
  const [email, setEmail] = useState('');
  const [code, setCode] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const sendCode = async () => {
    const problem = checkEmail(email);
    if (problem) {
      setError(t(problem));
      return;
    }
    setError(null);
    setBusy(true);
    const failure = await requestPasswordReset(email);
    setBusy(false);
    if (failure) {
      setError(authErrorText(t, failure));
      return;
    }
    setStep('code');
  };

  const submitNewPassword = async () => {
    if (code.trim().length < 6) {
      setError(t('auth.errors.codeInvalid'));
      return;
    }
    const problem = checkPassword(password);
    if (problem) {
      setError(t(problem, { min: MIN_PASSWORD_LENGTH }));
      return;
    }
    setError(null);
    setBusy(true);
    const failure = await resetPassword(email, code, password);
    setBusy(false);
    if (failure) setError(authErrorText(t, failure));
  };

  return (
    <KeyboardAvoidingView
      style={{ flex: 1 }}
      behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
      <Screen leaves="high" scroll className="items-center px-6 pb-8 pt-2">
        <WalletHero size={210} />
        <AppText weight="bold" className="mb-2 text-[26px]">
          {t('auth.forgot.title')}
        </AppText>
        <AppText tone="muted" className="mb-5 text-center text-[15px]">
          {step === 'email' ? t('auth.forgot.emailHelp') : t('auth.forgot.codeHelp', { email: email.trim() })}
        </AppText>

        <View className="w-full gap-4">
          {step === 'email' ? (
            <>
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
                returnKeyType="go"
                onSubmitEditing={sendCode}
              />
              <Button label={t('auth.forgot.sendCode')} onPress={sendCode} loading={busy} />
            </>
          ) : (
            <>
              <TextField
                key="code"
                label={t('auth.forgot.code')}
                value={code}
                onChangeText={(value) => setCode(value.replace(/\D/g, '').slice(0, 8))}
                autoFocus
                keyboardType="number-pad"
                autoComplete="one-time-code"
                textContentType="oneTimeCode"
                maxLength={8}
                returnKeyType="next"
              />
              <TextField
                key="password"
                label={t('auth.forgot.newPassword', { min: MIN_PASSWORD_LENGTH })}
                value={password}
                onChangeText={setPassword}
                error={error}
                secureTextEntry
                autoCapitalize="none"
                autoComplete="new-password"
                textContentType="newPassword"
                returnKeyType="go"
                onSubmitEditing={submitNewPassword}
              />
              <Button label={t('auth.forgot.save')} onPress={submitNewPassword} loading={busy} />
              <Button
                label={t('auth.forgot.resend')}
                variant="outline"
                onPress={sendCode}
                disabled={busy}
              />
            </>
          )}
        </View>

        <PressScale
          accessibilityRole="link"
          onPress={() => (router.canGoBack() ? router.back() : router.replace('/sign-in'))}
          className="mt-5 min-h-[44px] justify-center">
          <AppText tone="primary" weight="medium" className="text-[15px]">
            {t('auth.forgot.backToSignIn')}
          </AppText>
        </PressScale>
      </Screen>
    </KeyboardAvoidingView>
  );
}
