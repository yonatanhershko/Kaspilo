import AsyncStorage from '@react-native-async-storage/async-storage';
import { addDays } from 'date-fns/addDays';
import { set } from 'date-fns/set';
import Constants from 'expo-constants';
import * as Device from 'expo-device';
import { useSyncExternalStore } from 'react';
import { Platform } from 'react-native';

import i18n, { currentLanguage } from '@/i18n';
import { hasApplicationModule } from '@/lib/nativeApp';
import { disablePurchaseDetection } from '@/purchase';
import { supabase } from '@/lib/supabase';

/**
 * Notifications. Rules: docs/spec.md "Notifications".
 *  - Renewal reminders are sent by the server (push). The phone only registers
 *    its push token, with its language and both switches (the admin's manual
 *    send respects them).
 *  - Inactivity reminders are scheduled here, on the phone, on every app open.
 * Switches are saved per device.
 */

export type NotificationKind = 'subscription' | 'inactivity';
export type NotificationPrefs = Record<NotificationKind, boolean>;
export type PermissionState = 'granted' | 'denied' | 'undetermined' | 'unsupported';

/** Routes a notification tap may open. Anything else is ignored. */
export const NOTIFICATION_ROUTES = ['/renew', '/today'] as const;
export type NotificationRoute = (typeof NOTIFICATION_ROUTES)[number];

const PREFS_KEY = 'kaspilo.notifications';
const ASKED_KEY = 'kaspilo.notifications.asked';
const TOKEN_KEY = 'kaspilo.notifications.token';
const CHANNEL_ID = 'default';

/** Days after the last app open, and the hour of day, for the inactivity reminders. */
const INACTIVITY_DAYS = [4, 14, 24] as const;
const INACTIVITY_HOUR = 19;
const inactivityId = (index: number) => `kaspilo-inactive-${index + 1}`;

// Expo Go on Android lacks a native module expo-notifications loads, so there it is not loaded at all.
export const notificationsSupported = Platform.OS !== 'web' && hasApplicationModule;
const supported = notificationsSupported;
// eslint-disable-next-line @typescript-eslint/no-require-imports
const Notifications = (supported ? require('expo-notifications') : null) as typeof import('expo-notifications');

// ---- per-device switches ----------------------------------------------------

let prefs: NotificationPrefs = { subscription: true, inactivity: true };
let prefsLoaded = false;
const listeners = new Set<() => void>();

async function loadPrefs(): Promise<NotificationPrefs> {
  if (prefsLoaded) return prefs;
  const raw = await AsyncStorage.getItem(PREFS_KEY).catch(() => null);
  if (raw) {
    try {
      const saved = JSON.parse(raw) as Partial<NotificationPrefs>;
      prefs = {
        subscription: saved.subscription !== false,
        inactivity: saved.inactivity !== false,
      };
    } catch {
      // unreadable value: keep the defaults (all on)
    }
  }
  prefsLoaded = true;
  listeners.forEach((notify) => notify());
  return prefs;
}

function subscribe(onChange: () => void) {
  listeners.add(onChange);
  void loadPrefs();
  return () => {
    listeners.delete(onChange);
  };
}

/** The switches as React state. */
export function useNotificationPrefs(): NotificationPrefs {
  return useSyncExternalStore(
    subscribe,
    () => prefs,
    () => prefs,
  );
}

/** Flip one switch: saved on the device, then applied. */
export async function setNotificationPref(kind: NotificationKind, value: boolean): Promise<void> {
  await loadPrefs();
  prefs = { ...prefs, [kind]: value };
  listeners.forEach((notify) => notify());
  await AsyncStorage.setItem(PREFS_KEY, JSON.stringify(prefs)).catch(() => undefined);
  // Both switches also go to the server: the admin's manual send respects them.
  if (kind === 'inactivity') await scheduleInactivityReminders();
  await syncPushToken();
}

// ---- permission -------------------------------------------------------------

export async function getPermission(): Promise<PermissionState> {
  if (!supported) return 'unsupported';
  try {
    const current = await Notifications.getPermissionsAsync();
    if (current.granted) return 'granted';
    return current.canAskAgain ? 'undetermined' : 'denied';
  } catch {
    return 'unsupported';
  }
}

/** Shows the system prompt. Call only after the app's own explanation. */
export async function requestPermission(): Promise<PermissionState> {
  if (!supported) return 'unsupported';
  await AsyncStorage.setItem(ASKED_KEY, '1').catch(() => undefined);
  try {
    const result = await Notifications.requestPermissionsAsync();
    if (result.granted) return 'granted';
    return result.canAskAgain ? 'undetermined' : 'denied';
  } catch {
    return 'unsupported';
  }
}

/** True when the app's own explanation was already shown once on this device. */
export async function wasAsked(): Promise<boolean> {
  return (await AsyncStorage.getItem(ASKED_KEY).catch(() => null)) === '1';
}

export async function markAsked(): Promise<void> {
  await AsyncStorage.setItem(ASKED_KEY, '1').catch(() => undefined);
}

// ---- setup ------------------------------------------------------------------

let configured = false;

/** Once per app start: how a notification shows while the app is open, and the Android channel. */
export async function configureNotifications(): Promise<void> {
  if (!supported || configured) return;
  configured = true;
  try {
    Notifications.setNotificationHandler({
      handleNotification: async () => ({
        shouldShowBanner: true,
        shouldShowList: true,
        shouldPlaySound: true,
        shouldSetBadge: false,
      }),
    });
    if (Platform.OS === 'android') {
      await Notifications.setNotificationChannelAsync(CHANNEL_ID, {
        name: 'Kaspilo',
        importance: Notifications.AndroidImportance.DEFAULT,
      });
    }
  } catch {
    configured = false;
  }
}

// ---- inactivity (local) -----------------------------------------------------

async function cancelInactivityReminders(): Promise<void> {
  if (!supported) return;
  await Promise.all(
    INACTIVITY_DAYS.map((_, index) =>
      Notifications.cancelScheduledNotificationAsync(inactivityId(index)).catch(() => undefined),
    ),
  );
}

/**
 * Restarts the inactivity countdown from now: reminders at 19:00 on day 4, 14
 * and 24, then nothing. Called on every app open, so an active user never gets
 * one. Texts are in the app language of the moment; a language change calls
 * this again.
 */
export async function scheduleInactivityReminders(now = new Date()): Promise<void> {
  if (!supported) return;
  try {
    await cancelInactivityReminders();
    const { inactivity } = await loadPrefs();
    if (!inactivity || (await getPermission()) !== 'granted') return;

    await Promise.all(
      INACTIVITY_DAYS.map((days, index) =>
        Notifications.scheduleNotificationAsync({
          identifier: inactivityId(index),
          content: {
            title: i18n.t(`notifications.inactive.${index + 1}.title`),
            body: i18n.t(`notifications.inactive.${index + 1}.body`),
            data: { url: '/today' satisfies NotificationRoute },
          },
          trigger: {
            type: Notifications.SchedulableTriggerInputTypes.DATE,
            date: set(addDays(now, days), { hours: INACTIVITY_HOUR, minutes: 0, seconds: 0, milliseconds: 0 }),
            channelId: CHANNEL_ID,
          },
        }),
      ),
    );
  } catch {
    // Scheduling is best effort; a failure here must never break the app.
  }
}

// ---- renewal (push token) ---------------------------------------------------

function easProjectId(): string | null {
  const extra = Constants.expoConfig?.extra as { eas?: { projectId?: string } } | undefined;
  return extra?.eas?.projectId ?? Constants.easConfig?.projectId ?? null;
}

/**
 * Saves this device's push token on the server, with the app language and the
 * renewal switch. Quietly does nothing where push cannot work: web, simulator,
 * no permission, or a build without push credentials (see docs/notifications-setup.md).
 */
export async function syncPushToken(): Promise<void> {
  if (!supported || !Device.isDevice) return;
  const projectId = easProjectId();
  if (!projectId) return;
  try {
    if ((await getPermission()) !== 'granted') return;
    const { subscription, inactivity } = await loadPrefs();
    const { data: token } = await Notifications.getExpoPushTokenAsync({ projectId });
    const { error } = await supabase.rpc('register_push_token', {
      p_token: token,
      p_platform: Platform.OS,
      p_language: currentLanguage(),
      p_subscription_reminders: subscription,
      p_inactivity_reminders: inactivity,
    });
    if (!error) await AsyncStorage.setItem(TOKEN_KEY, token).catch(() => undefined);
  } catch {
    // No push credentials in this build, or no network. Tried again on the next open.
  }
}

/** Sign-out: this device stops getting reminders. Call while still signed in. */
export async function clearNotificationsOnSignOut(): Promise<void> {
  disablePurchaseDetection();
  if (!supported) return;
  try {
    await cancelInactivityReminders();
    const token = await AsyncStorage.getItem(TOKEN_KEY);
    if (token) {
      await supabase.rpc('unregister_push_token', { p_token: token });
      await AsyncStorage.removeItem(TOKEN_KEY);
    }
  } catch {
    // Best effort: sign-out must still go through.
  }
}

/** Everything that runs when the app opens or returns to the front. */
export async function refreshNotifications(): Promise<void> {
  await configureNotifications();
  await Promise.all([scheduleInactivityReminders(), syncPushToken()]);
}
