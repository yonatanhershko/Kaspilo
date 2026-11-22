import { Platform } from 'react-native';

import { randomUUID } from '@/lib/uuid';
import { supabase } from '@/lib/supabase';

export type AppleResult = 'ok' | 'cancelled' | 'failed';

/**
 * Loaded only on iPhone: on Android Expo Go importing these throws (no native module,
 * same as ExpoCrypto in src/lib/uuid.ts).
 */
function modules() {
  /* eslint-disable @typescript-eslint/no-require-imports */
  return {
    Apple: require('expo-apple-authentication') as typeof import('expo-apple-authentication'),
    Crypto: require('expo-crypto') as typeof import('expo-crypto'),
  };
  /* eslint-enable @typescript-eslint/no-require-imports */
}

/**
 * Sign in with Apple, iPhone only (docs/spec.md "Auth"). Apple's own sheet, then
 * Supabase checks the ID token (audience = the bundle ID). Android has no button.
 */
export async function appleAvailable(): Promise<boolean> {
  if (Platform.OS !== 'ios') return false;
  try {
    return await modules().Apple.isAvailableAsync();
  } catch {
    return false;
  }
}

/** Sign-in and sign-up in one. Apple sends the name only the very first time. */
export async function signInWithApple(): Promise<AppleResult> {
  try {
    const { Apple, Crypto } = modules();
    // Apple gets the hash, Supabase the raw value: a stolen token cannot be replayed.
    const rawNonce = randomUUID();
    const hashedNonce = await Crypto.digestStringAsync(Crypto.CryptoDigestAlgorithm.SHA256, rawNonce);
    const credential = await Apple.signInAsync({
      requestedScopes: [Apple.AppleAuthenticationScope.FULL_NAME, Apple.AppleAuthenticationScope.EMAIL],
      nonce: hashedNonce,
    });
    if (!credential.identityToken) return 'failed';
    const { data, error } = await supabase.auth.signInWithIdToken({
      provider: 'apple',
      token: credential.identityToken,
      nonce: rawNonce,
    });
    if (error || !data.user) return 'failed';

    // The ID token has no name, so a new profile starts empty: fill it from this first sheet.
    const fullName = [credential.fullName?.givenName, credential.fullName?.familyName]
      .filter(Boolean)
      .join(' ')
      .trim();
    if (fullName) {
      await supabase.auth.updateUser({ data: { full_name: fullName } });
      await supabase.from('profiles').update({ full_name: fullName }).eq('id', data.user.id).eq('full_name', '');
    }
    return 'ok';
  } catch (e) {
    if ((e as { code?: string }).code === 'ERR_REQUEST_CANCELED') return 'cancelled';
    return 'failed';
  }
}

/** True when the signed-in user came in with Apple. */
export async function isAppleUser(): Promise<boolean> {
  const { data } = await supabase.auth.getUser();
  return !!data.user?.identities?.some((i) => i.provider === 'apple');
}

/**
 * Before deleting an Apple user's account: Apple's sheet once more for a fresh code,
 * then the server revokes the app's access at Apple (guideline 5.1.1(v)).
 * 'cancelled' = the user closed the sheet, so the deletion stops.
 * 'failed' = Apple or the server refused; the account is still deleted (docs/spec.md).
 */
export async function revokeApple(): Promise<AppleResult> {
  try {
    if (!(await appleAvailable())) return 'failed';
    const { Apple } = modules();
    const credential = await Apple.signInAsync({ requestedScopes: [] });
    if (!credential.authorizationCode) return 'failed';
    const { error } = await supabase.functions.invoke('apple-revoke', {
      body: { code: credential.authorizationCode },
    });
    return error ? 'failed' : 'ok';
  } catch (e) {
    if ((e as { code?: string }).code === 'ERR_REQUEST_CANCELED') return 'cancelled';
    return 'failed';
  }
}
