import AsyncStorage from '@react-native-async-storage/async-storage';
import type { AnalyticsEventName } from '@kaspilo/shared';
import Constants from 'expo-constants';
import { randomUUID } from '@/lib/uuid';
import { Platform } from 'react-native';

import { nativeApplicationVersion } from '@/lib/nativeApp';
import { isTransient } from '@/lib/network';
import { supabase } from '@/lib/supabase';

/**
 * Product analytics (docs/spec.md "Analytics"): how many open, sign up, and come back.
 * Never money: no amounts, categories or wallets are ever sent.
 * Events wait in a small queue on the phone and go out when there is internet;
 * one older than 7 days is dropped. Sign-up completed is recorded by the database itself.
 */

type Queued = {
  name: AnalyticsEventName;
  at: string;
  /** Who was signed in when it happened; a user event is sent only in that same session. */
  userId: string | null;
};

const DEVICE_KEY = 'kaspilo.analytics.device';
const QUEUE_KEY = 'kaspilo.analytics.queue';
const enteredKey = (userId: string) => `kaspilo.analytics.entered.${userId}`;
const MAX_AGE_MS = 7 * 24 * 60 * 60 * 1000;
const APP_OPEN_GAP_MS = 30 * 60 * 1000;
const MAX_QUEUE = 200;

const platform = Platform.OS === 'ios' || Platform.OS === 'android' || Platform.OS === 'web' ? Platform.OS : null;
const version = (Constants.expoConfig?.version ?? nativeApplicationVersion ?? '').slice(0, 20) || null;

let deviceId: Promise<{ id: string; isNew: boolean }> | null = null;
let queue: Queued[] | null = null;
let sending: Promise<void> | null = null;
let lastAppOpen = { userId: '', at: 0 };

/** A random id for this install, made on the phone. Removed with the app. */
function device() {
  deviceId ??= (async () => {
    const saved = await AsyncStorage.getItem(DEVICE_KEY).catch(() => null);
    if (saved) return { id: saved, isNew: false };
    const id = randomUUID();
    await AsyncStorage.setItem(DEVICE_KEY, id).catch(() => undefined);
    return { id, isNew: true };
  })();
  return deviceId;
}

async function load(): Promise<Queued[]> {
  if (queue) return queue;
  try {
    const raw = await AsyncStorage.getItem(QUEUE_KEY);
    queue ??= raw ? (JSON.parse(raw) as Queued[]) : [];
  } catch {
    queue ??= [];
  }
  return queue;
}

function save() {
  void AsyncStorage.setItem(QUEUE_KEY, JSON.stringify(queue ?? [])).catch(() => undefined);
}

async function add(name: AnalyticsEventName, userId: string | null) {
  const items = await load();
  items.push({ name, at: new Date().toISOString(), userId });
  if (items.length > MAX_QUEUE) items.splice(0, items.length - MAX_QUEUE);
  save();
  void flushAnalytics();
}

/** Send what is waiting, oldest first. Stops on a passing failure (no internet) and tries later. */
export function flushAnalytics(): Promise<void> {
  sending ??= (async () => {
    try {
      const items = await load();
      const { id } = await device();
      const current = (await supabase.auth.getSession()).data.session?.user.id ?? null;
      while (items.length > 0) {
        const item = items[0];
        const stale = Date.now() - Date.parse(item.at) > MAX_AGE_MS;
        // A user event from another session cannot be sent any more.
        const orphan = item.userId !== null && item.userId !== current;
        if (!stale && !orphan) {
          const result = await supabase.rpc('track_event', {
            p_name: item.name,
            p_device_id: id,
            p_platform: platform,
            p_app_version: version,
            p_occurred_at: item.at,
          });
          if (result.error && isTransient(result)) return;
        }
        items.shift();
        save();
      }
    } catch {
      // Analytics never breaks the app; the queue stays for next time.
    } finally {
      sending = null;
    }
  })();
  return sending;
}

/** On every launch: the first launch on this install is recorded once. */
export async function trackFirstOpen() {
  const { isNew } = await device();
  if (isNew) await add('first_open', null);
  else void flushAnalytics();
}

/** A sign-up button on onboarding's last screen, or a new account from the sign-in screen's Google / Apple. */
export function trackSignupStarted() {
  void add('signup_started', null);
}

/** The signed-in app with access opened: first entry once per user, and an app open. */
export async function trackAppEntry(userId: string) {
  const key = enteredKey(userId);
  if (!(await AsyncStorage.getItem(key).catch(() => null))) {
    await AsyncStorage.setItem(key, '1').catch(() => undefined);
    await add('first_app_entry', userId);
  }
  trackAppOpen(userId);
}

/** The app came to the front while signed in. At most once per 30 minutes (the server checks too). */
export function trackAppOpen(userId: string) {
  if (lastAppOpen.userId === userId && Date.now() - lastAppOpen.at < APP_OPEN_GAP_MS) return;
  lastAppOpen = { userId, at: Date.now() };
  void add('app_open', userId);
}

let lastPaywall = { userId: '', at: 0 };

/** The paywall was shown. At most once per 30 minutes per user (the server checks too). */
export function trackPaywallViewed(userId: string) {
  if (lastPaywall.userId === userId && Date.now() - lastPaywall.at < APP_OPEN_GAP_MS) return;
  lastPaywall = { userId, at: Date.now() };
  void add('paywall_viewed', userId);
}
