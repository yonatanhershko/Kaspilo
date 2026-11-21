import Constants from 'expo-constants';
import * as Linking from 'expo-linking';
import * as WebBrowser from 'expo-web-browser';
import { isRunningInExpoGo } from 'expo';
import { Platform, TurboModuleRegistry } from 'react-native';

import { supabase } from '@/lib/supabase';

// Web: closes the sign-in popup once it lands back on the app.
WebBrowser.maybeCompleteAuthSession();

export type GoogleResult = 'ok' | 'cancelled' | 'failed';

type GoogleIds = { web?: string; ios?: string };
const ids = (Constants.expoConfig?.extra?.googleClientIds ?? {}) as GoogleIds;

/**
 * Native sign-in (Google's own sheet, shows "Kaspilo") needs the native module, which
 * Expo Go and web do not have, and on iOS an iOS client ID. Otherwise: browser flow.
 */
const useNative =
  Platform.OS !== 'web' &&
  !isRunningInExpoGo() &&
  // Also checks the module is really in this build (asking does not throw, loading does).
  TurboModuleRegistry.get('RNGoogleSignin') != null &&
  !!ids.web &&
  (Platform.OS !== 'ios' || !!ids.ios);

/** Loaded only when used: importing it in Expo Go throws (no native module). */
function nativeModule() {
  // eslint-disable-next-line @typescript-eslint/no-require-imports
  return require('@react-native-google-signin/google-signin') as typeof import('@react-native-google-signin/google-signin');
}

let configured = false;

/**
 * Google sign-in and sign-up in one. A new Google user gets a profile from the
 * same trigger as email sign-up (name from Google).
 */
export async function signInWithGoogle(): Promise<GoogleResult> {
  return useNative ? signInNative() : signInBrowser();
}

/** Lets the next sign-in show the account picker again. Never throws. */
export async function signOutGoogle(): Promise<void> {
  if (!useNative) return;
  try {
    await nativeModule().GoogleSignin.signOut();
  } catch {
    // Not signed in with Google on this device: nothing to do.
  }
}

/** Google's native sheet, then Supabase checks the ID token (audience = web client ID). */
async function signInNative(): Promise<GoogleResult> {
  const { GoogleSignin, isErrorWithCode, statusCodes } = nativeModule();
  try {
    if (!configured) {
      GoogleSignin.configure({ webClientId: ids.web, iosClientId: ids.ios });
      configured = true;
    }
    if (Platform.OS === 'android') await GoogleSignin.hasPlayServices();
    const response = await GoogleSignin.signIn();
    if (response.type !== 'success') return 'cancelled';
    const token = response.data.idToken;
    if (!token) return 'failed';
    const { error } = await supabase.auth.signInWithIdToken({ provider: 'google', token });
    return error ? 'failed' : 'ok';
  } catch (e) {
    if (isErrorWithCode(e) && (e.code === statusCodes.SIGN_IN_CANCELLED || e.code === statusCodes.IN_PROGRESS)) {
      return 'cancelled';
    }
    return 'failed';
  }
}

/** Where Google (through Supabase) sends the user back: kaspilo-dev://auth-callback, kaspilo://auth-callback on prod. */
export const googleRedirectUrl = () => Linking.createURL('auth-callback');

/** Reads `#access_token=…&refresh_token=…` (or the query string) from the redirect URL. */
function tokensFrom(url: string): { access_token: string; refresh_token: string } | null {
  const part = url.includes('#') ? url.split('#')[1] : (url.split('?')[1] ?? '');
  const params: Record<string, string> = {};
  for (const pair of part.split('&')) {
    const [key, value = ''] = pair.split('=');
    if (key) params[decodeURIComponent(key)] = decodeURIComponent(value.replace(/\+/g, ' '));
  }
  return params.access_token && params.refresh_token
    ? { access_token: params.access_token, refresh_token: params.refresh_token }
    : null;
}

/**
 * Fallback for web and Expo Go: Supabase's hosted Google page in the system browser
 * (Google shows the Supabase project address there), then the session from the redirect.
 */
async function signInBrowser(): Promise<GoogleResult> {
  const redirectTo = googleRedirectUrl();
  const { data, error } = await supabase.auth.signInWithOAuth({
    provider: 'google',
    options: { redirectTo, skipBrowserRedirect: true, queryParams: { prompt: 'select_account' } },
  });
  if (error || !data.url) return 'failed';

  let result: WebBrowser.WebBrowserAuthSessionResult;
  try {
    result = await WebBrowser.openAuthSessionAsync(data.url, redirectTo);
  } catch {
    // For example a blocked popup on web: show an error, never crash.
    return 'failed';
  }
  if (result.type !== 'success') return 'cancelled';

  const tokens = tokensFrom(result.url);
  if (!tokens) return 'failed';
  const { error: sessionError } = await supabase.auth.setSession(tokens);
  return sessionError ? 'failed' : 'ok';
}
