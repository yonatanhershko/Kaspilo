import AsyncStorage from '@react-native-async-storage/async-storage';
import type { Currency } from '@kaspilo/shared';
import type { User } from '@supabase/supabase-js';
import { useSyncExternalStore } from 'react';

import { TERMS_VERSION } from '@/auth/terms';
import { currentLanguage } from '@/i18n';
import { trackSignupStarted } from '@/lib/analytics';
import { supabase } from '@/lib/supabase';

/**
 * Onboarding state on this phone (docs/spec.md "Onboarding"). Nothing here reaches the
 * server until an account exists: then the name goes to the profile at once, and the budget
 * and currency wait until the account first opens the app with access, because the database
 * lets a waiting account change only its name.
 */
export type OnboardingAnswers = {
  /** '' = not given or skipped. */
  name: string;
  /** Minor units. null = not given or skipped. */
  budget: number | null;
};

/** Answers kept for the account just created here, applied on its first entry with access. */
export type PendingSetup = { userId: string; budget: number | null; currency: Currency };

type Saved = { v: 1; done: boolean; answers: OnboardingAnswers; pending: PendingSetup | null };

/** Set right before a sign-up or sign-in started from onboarding's last screen. Memory only. */
export type OnboardingIntent = { termsAccepted: boolean };

type State = Saved & { loaded: boolean; intent: OnboardingIntent | null };

const KEY = 'kaspilo.onboarding';
const empty: OnboardingAnswers = { name: '', budget: null };

let state: State = { v: 1, loaded: false, done: false, answers: empty, pending: null, intent: null };
const listeners = new Set<() => void>();

function set(patch: Partial<State>) {
  state = { ...state, ...patch };
  listeners.forEach((listener) => listener());
}

async function persist() {
  const saved: Saved = { v: 1, done: state.done, answers: state.answers, pending: state.pending };
  await AsyncStorage.setItem(KEY, JSON.stringify(saved)).catch(() => undefined);
}

function isAnswers(value: unknown): value is OnboardingAnswers {
  const a = value as OnboardingAnswers | null;
  return (
    !!a &&
    typeof a.name === 'string' &&
    (a.budget === null || (Number.isSafeInteger(a.budget) && a.budget > 0))
  );
}

/** Call once at startup, before the first screen is chosen. */
export async function loadOnboarding(): Promise<void> {
  try {
    const raw = await AsyncStorage.getItem(KEY);
    const saved = raw ? (JSON.parse(raw) as Partial<Saved>) : null;
    set({
      loaded: true,
      done: saved?.done === true,
      answers: isAnswers(saved?.answers) ? saved.answers : empty,
      pending: saved?.pending && typeof saved.pending.userId === 'string' ? saved.pending : null,
    });
  } catch {
    set({ loaded: true });
  }
}

const subscribe = (listener: () => void) => {
  listeners.add(listener);
  return () => listeners.delete(listener);
};

export function useOnboarding(): State {
  return useSyncExternalStore(subscribe, () => state, () => state);
}

export function onboardingDone(): boolean {
  return state.done;
}

export function saveAnswers(patch: Partial<OnboardingAnswers>): void {
  set({ answers: { ...state.answers, ...patch } });
  void persist();
}

/** A sign-up button on the last screen was pressed (also counts as "sign-up started"). */
export function startFromOnboarding(intent: OnboardingIntent): void {
  set({ intent });
  trackSignupStarted();
}

/** The sign-in or sign-up from the last screen failed or was cancelled. */
export function clearOnboardingIntent(): void {
  if (state.intent) set({ intent: null });
}

/** Made by this sign-in: the auth user is a few seconds old and this is its first session. */
function isNewUser(user: User): boolean {
  const created = Date.parse(user.created_at);
  const lastSignIn = Date.parse(user.last_sign_in_at ?? user.created_at);
  if (Number.isNaN(created)) return false;
  return Math.abs(lastSignIn - created) < 60_000 && Date.now() - created < 10 * 60_000;
}

const settled = new Set<string>();

/**
 * Runs once per signed-in user per launch. Someone signed in on this phone, so onboarding is
 * over here. A new account made from onboarding keeps the answers; anyone else drops them.
 */
export async function settleSignIn(user: User): Promise<void> {
  if (settled.has(user.id)) return;
  settled.add(user.id);
  const intent = state.intent;
  const isNew = isNewUser(user);

  // A new account from the sign-in screen's Google / Apple button (docs/spec.md "Analytics").
  if (isNew && !intent) trackSignupStarted();
  if (state.done && !intent) return;

  let pending = state.pending;
  if (intent && isNew) {
    const { name, budget } = state.answers;
    if (name.trim()) {
      // The onboarding name wins over the one from Google or Apple.
      await supabase.from('profiles').update({ full_name: name.trim() }).eq('id', user.id);
    }
    pending = { userId: user.id, budget, currency: currentLanguage() === 'he' ? 'ILS' : 'USD' };
    // The terms were accepted on the last screen; Google / Apple accounts save that here.
    if (intent.termsAccepted && typeof user.user_metadata?.terms_version !== 'string') {
      await supabase.auth.updateUser({
        data: { terms_version: TERMS_VERSION, terms_accepted_at: new Date().toISOString() },
      });
    }
  }
  set({ done: true, answers: empty, pending, intent: null });
  await persist();
}

/**
 * First entry with access of the account made here: the onboarding budget becomes the
 * "Personal" wallet's overall budget (only if it has none yet) and the currency is set.
 * Kept for the next try if anything fails (offline). Returns true when something changed.
 */
export async function applyPendingSetup(userId: string): Promise<boolean> {
  const pending = state.pending;
  if (!pending || pending.userId !== userId) return false;

  const settings = await supabase
    .from('user_settings')
    .update({ currency: pending.currency })
    .eq('user_id', userId)
    .select('user_id');
  if (settings.error || !settings.data?.length) return false;

  if (pending.budget !== null) {
    const wallet = await supabase
      .from('wallets')
      .update({ overall_budget: pending.budget })
      .eq('user_id', userId)
      .eq('default_key', 'personal')
      .is('overall_budget', null);
    if (wallet.error) return false;
  }

  set({ pending: null });
  await persist();
  return true;
}
