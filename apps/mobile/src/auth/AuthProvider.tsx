import { callPasswordAuth, hasAccess, lockMinutes, type PasswordAuthRequest, type PasswordAuthResult, type Profile } from '@kaspilo/shared';
import { isAuthRetryableFetchError, type Session } from '@supabase/supabase-js';
import type { TFunction } from 'i18next';
import { createContext, type ReactNode, use, useCallback, useEffect, useState } from 'react';
import { AppState } from 'react-native';

import { clearOfflineData, loadProfile as loadSavedProfile, saveProfile } from '@/lib/offlineCache';
import { secureStorage } from '@/lib/secure-storage';
import { env } from '@/lib/env';
import { AUTH_STORAGE_KEY, supabase } from '@/lib/supabase';
import { resetOutbox } from '@/data/outbox';
import { clearNotificationsOnSignOut } from '@/notifications';

import { signInWithApple } from './apple';
import { signInWithGoogle, signOutGoogle } from './google';
import { TERMS_VERSION } from './terms';
import { MIN_PASSWORD_LENGTH } from './validation';

/** Error codes the screens translate. Anything unknown becomes `generic`. */
export type AuthErrorCode =
  | 'invalidCredentials'
  | 'emailTaken'
  | 'emailInvalid'
  | 'codeInvalid'
  | 'tooManyRequests'
  | 'locked'
  | 'passwordLeaked'
  | 'weakPassword'
  | 'confirmEmail'
  | 'network'
  | 'generic';

type AuthContextValue = {
  /** True until the stored session (and its profile) has been read once. */
  loading: boolean;
  session: Session | null;
  profile: Profile | null;
  /** The profile could not be loaded (for example, no network). */
  profileError: boolean;
  /** May use the app. The database enforces this too; this only drives navigation. */
  access: boolean;
  /**
   * The signed-in user accepted the terms. Email sign-up accepts them on the way in;
   * a first Google or Apple sign-in is sent to accept them before anything else.
   */
  termsAccepted: boolean;
  signIn: (email: string, password: string) => Promise<AuthErrorCode | null>;
  /** Sign in or sign up with Google. `cancelled` = the user closed the Google page. */
  signInWithGoogle: () => Promise<AuthErrorCode | 'cancelled' | null>;
  /** Sign in or sign up with Apple (iPhone only). `cancelled` = the user closed Apple's sheet. */
  signInWithApple: () => Promise<AuthErrorCode | 'cancelled' | null>;
  /** Saves the current terms version and time on the signed-in user. */
  acceptTerms: () => Promise<AuthErrorCode | null>;
  signUp: (fullName: string, email: string, password: string) => Promise<AuthErrorCode | null>;
  /** Sends a 6-digit reset code to the email. Same answer for unknown emails. */
  requestPasswordReset: (email: string) => Promise<AuthErrorCode | null>;
  /** Checks the code, then sets the new password. Signs the user in on success. */
  resetPassword: (email: string, code: string, newPassword: string) => Promise<AuthErrorCode | null>;
  signOut: () => Promise<void>;
  refreshProfile: () => Promise<void>;
};

const AuthContext = createContext<AuthContextValue | null>(null);

/**
 * Reads the profile. Offline, the last one read is used (docs/spec.md "Offline"),
 * so a failed read never locks a user out just for having no signal.
 */
async function readProfile(id: string): Promise<{ data: Profile | null; failed: boolean }> {
  const { data, error } = await supabase.from('profiles').select('*').eq('id', id).maybeSingle();
  if (!error) {
    if (data) void saveProfile(data);
    return { data, failed: false };
  }
  const saved = await loadSavedProfile(id);
  return { data: saved, failed: !saved };
}

/** The session as last stored on the phone, read without the network. */
async function storedSession(): Promise<Session | null> {
  try {
    const raw = await secureStorage.getItem(AUTH_STORAGE_KEY);
    const parsed = raw ? (JSON.parse(raw) as Session) : null;
    return parsed?.access_token && parsed.user ? parsed : null;
  } catch {
    return null;
  }
}

function toErrorCode(error: { code?: string; status?: number; message?: string }): AuthErrorCode {
  // Dev only: show why Supabase refused, so a vague message in the UI is never a mystery.
  // Never logs the password or the email.
  if (__DEV__) {
    console.warn('[auth] error', { code: error.code, status: error.status, message: error.message });
  }
  switch (error.code) {
    case 'invalid_credentials':
      return 'invalidCredentials';
    case 'user_already_exists':
    case 'email_exists':
      return 'emailTaken';
    case 'otp_expired':
    case 'otp_disabled':
      return 'codeInvalid';
    case 'over_email_send_rate_limit':
    case 'over_request_rate_limit':
      return 'tooManyRequests';
    case 'locked':
      return 'locked';
    case 'password_leaked':
      return 'passwordLeaked';
    case 'validation_failed':
    case 'email_address_invalid':
      return 'emailInvalid';
    case 'weak_password':
      return 'weakPassword';
    case 'email_not_confirmed':
      return 'confirmEmail';
    default:
      // fetch failures surface with no status
      return error.status === undefined || error.status === 0 ? 'network' : 'generic';
  }
}

/** Minutes left of the last lock reported, for the "locked" message. */
let lastLockMinutes = 15;

/** The message for an auth error code, with its numbers filled in. */
export function authErrorText(t: TFunction, code: AuthErrorCode): string {
  return t(`auth.errors.${code}`, { minutes: lastLockMinutes, min: MIN_PASSWORD_LENGTH });
}

/**
 * Runs a password action through the `auth-password` Edge Function, then starts the
 * session it returns. Returns null on success, or the error code. 'confirmEmail' when
 * sign-up worked but Supabase still asks for email confirmation (no session).
 */
async function passwordAction(request: PasswordAuthRequest): Promise<AuthErrorCode | null> {
  const result: PasswordAuthResult = await callPasswordAuth(env.supabaseUrl, env.supabasePublishableKey, request);
  if (!result.ok) {
    if (result.code === 'locked') lastLockMinutes = lockMinutes(result.retryAfter);
    return toErrorCode({ code: result.code, status: result.status });
  }
  if (!result.session) return 'confirmEmail';
  const { error } = await supabase.auth.setSession(result.session);
  return error ? toErrorCode(error) : null;
}

export function AuthProvider({ children }: { children: ReactNode }) {
  const [sessionLoaded, setSessionLoaded] = useState(false);
  const [session, setSession] = useState<Session | null>(null);
  const [profile, setProfile] = useState<Profile | null>(null);
  const [profileError, setProfileError] = useState(false);
  const [profileLoadedFor, setProfileLoadedFor] = useState<string | null>(null);

  const userId = session?.user.id ?? null;

  useEffect(() => {
    void supabase.auth.getSession().then(async ({ data, error }) => {
      // Offline with an expired access token the refresh fails, but the session is
      // still stored and refreshes once the internet is back. Keep the user in.
      const offline = !data.session && error && isAuthRetryableFetchError(error);
      setSession(offline ? await storedSession() : data.session);
      setSessionLoaded(true);
    });
    // Keep this callback synchronous: calling Supabase inside it can deadlock.
    // The first state comes from getSession above, which also covers offline starts.
    const { data } = supabase.auth.onAuthStateChange((event, next) => {
      if (event !== 'INITIAL_SESSION') setSession(next);
    });
    return () => data.subscription.unsubscribe();
  }, []);

  const applyProfile = useCallback((id: string, data: Profile | null, failed: boolean) => {
    setProfile(failed ? null : data);
    setProfileError(failed || !data);
    setProfileLoadedFor(id);
  }, []);

  const fetchProfile = useCallback(
    async (id: string) => {
      const { data, failed } = await readProfile(id);
      applyProfile(id, data, failed);
    },
    [applyProfile],
  );

  useEffect(() => {
    if (!userId) return;
    let alive = true;
    void readProfile(userId).then(({ data, failed }) => {
      if (alive) applyProfile(userId, data, failed);
    });
    return () => {
      alive = false;
    };
  }, [userId, applyProfile]);

  // An admin may approve while the app is in the background: re-check on return.
  useEffect(() => {
    if (!userId) return;
    const sub = AppState.addEventListener('change', (state) => {
      if (state === 'active') void fetchProfile(userId);
    });
    return () => sub.remove();
  }, [userId, fetchProfile]);

  const signedInProfile = userId && profileLoadedFor === userId ? profile : null;

  const value: AuthContextValue = {
    loading: !sessionLoaded || (userId !== null && profileLoadedFor !== userId),
    session,
    profile: signedInProfile,
    profileError: userId !== null && profileLoadedFor === userId && profileError,
    access: signedInProfile ? hasAccess(signedInProfile) : false,
    termsAccepted: typeof session?.user.user_metadata?.terms_version === 'string',
    signIn: (email, password) => passwordAction({ action: 'sign-in', email: email.trim(), password }),
    signInWithGoogle: async () => {
      const result = await signInWithGoogle();
      if (result === 'cancelled') return 'cancelled';
      return result === 'ok' ? null : 'generic';
    },
    signInWithApple: async () => {
      const result = await signInWithApple();
      if (result === 'cancelled') return 'cancelled';
      return result === 'ok' ? null : 'generic';
    },
    acceptTerms: async () => {
      // Updates the session too (USER_UPDATED), so the guard moves on by itself.
      const { error } = await supabase.auth.updateUser({
        data: { terms_version: TERMS_VERSION, terms_accepted_at: new Date().toISOString() },
      });
      return error ? toErrorCode(error) : null;
    },
    // The function saves the terms version and the time it accepted them.
    signUp: (fullName, email, password) =>
      passwordAction({
        action: 'sign-up',
        email: email.trim(),
        password,
        fullName: fullName.trim(),
        termsVersion: TERMS_VERSION,
      }),
    requestPasswordReset: async (email) => {
      const { error } = await supabase.auth.resetPasswordForEmail(email.trim());
      return error ? toErrorCode(error) : null;
    },
    resetPassword: (email, code, newPassword) =>
      passwordAction({ action: 'reset', email: email.trim(), password: newPassword, code: code.trim() }),
    signOut: async () => {
      // While still signed in: this device stops getting the user's reminders.
      await clearNotificationsOnSignOut();
      // Offline data of this user (cache, unsent queue, last profile) leaves with them.
      if (userId) {
        resetOutbox();
        await clearOfflineData(userId);
      }
      // Offline the server call fails and the session would stay: then sign out on this phone only.
      const { error } = await supabase.auth.signOut();
      if (error) await supabase.auth.signOut({ scope: 'local' });
      await signOutGoogle();
    },
    refreshProfile: async () => {
      if (userId) await fetchProfile(userId);
    },
  };

  return <AuthContext value={value}>{children}</AuthContext>;
}

export function useAuth(): AuthContextValue {
  const value = use(AuthContext);
  if (!value) throw new Error('useAuth must be used inside AuthProvider');
  return value;
}
