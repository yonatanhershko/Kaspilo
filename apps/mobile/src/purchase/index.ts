import AsyncStorage from '@react-native-async-storage/async-storage';
import type { Currency } from '@kaspilo/shared';
import Constants from 'expo-constants';
import { requireOptionalNativeModule } from 'expo-modules-core';
import { useSyncExternalStore } from 'react';
import { Platform } from 'react-native';

import i18n from '@/i18n';

/**
 * Purchase detection (docs/spec.md "Notifications" → "Purchase detected").
 * The reminder is made natively, without this JavaScript: the iPhone App Intent and the
 * Android Google Wallet listener read the state written here. So the state carries all
 * they need: the switch, until when access lasts, the currency and the texts.
 */
type Native = {
  setState(json: string): void;
  lastDetectedAt(): number | null;
  isListenerEnabled(): boolean;
  openListenerSettings(): void;
};

const native = requireOptionalNativeModule<Native>('KaspiloPurchase');

/** False in Expo Go and on builds made before purchase detection. */
export const purchaseDetectionAvailable = native != null;

const PREF_KEY = 'kaspilo.purchase.enabled';
const SETUP_KEY = 'kaspilo.purchase.setupDone';

/** The user's switch, saved per device. On by default (spec). */
export async function getPurchasePref(): Promise<boolean> {
  const raw = await AsyncStorage.getItem(PREF_KEY).catch(() => null);
  return raw !== 'false';
}

// ---- switch + setup, shared by the Notifications screen, the setup flow and the sync ----

export type PurchasePrefs = { enabled: boolean; setupDone: boolean; loaded: boolean };

let prefs: PurchasePrefs = { enabled: true, setupDone: false, loaded: false };
const listeners = new Set<() => void>();
let loading: Promise<void> | null = null;

function update(next: Partial<PurchasePrefs>) {
  prefs = { ...prefs, ...next };
  listeners.forEach((notify) => notify());
}

function loadPrefs(): Promise<void> {
  loading ??= (async () => {
    const [enabled, setup] = await Promise.all([
      getPurchasePref(),
      AsyncStorage.getItem(SETUP_KEY).catch(() => null),
    ]);
    update({ enabled, setupDone: setup === 'true', loaded: true });
  })();
  return loading;
}

function subscribe(listener: () => void) {
  listeners.add(listener);
  void loadPrefs();
  return () => listeners.delete(listener);
}

export function usePurchasePrefs(): PurchasePrefs {
  return useSyncExternalStore(
    subscribe,
    () => prefs,
    () => prefs,
  );
}

export async function setPurchasePref(value: boolean): Promise<void> {
  await loadPrefs();
  update({ enabled: value });
  await AsyncStorage.setItem(PREF_KEY, String(value)).catch(() => undefined);
}

/** The setup guide was finished on this phone: the row shows the switch from now on. */
export async function markPurchaseSetupDone(): Promise<void> {
  await loadPrefs();
  update({ setupDone: true, enabled: true });
  await Promise.all([
    AsyncStorage.setItem(SETUP_KEY, 'true'),
    AsyncStorage.setItem(PREF_KEY, 'true'),
  ]).catch(() => undefined);
}

function scheme(): string {
  const value = Constants.expoConfig?.scheme;
  return (Array.isArray(value) ? value[0] : value) ?? '';
}

/** Placeholders stay in: the native side fills them. */
function texts() {
  const keep = { amount: '{{amount}}', merchant: '{{merchant}}' };
  return {
    title: i18n.t('notifications.purchaseAlert.title'),
    withAmount: i18n.t('notifications.purchaseAlert.withAmount', keep),
    merchantOnly: i18n.t('notifications.purchaseAlert.merchantOnly', keep),
    genericTitle: i18n.t('notifications.purchaseAlert.genericTitle'),
    genericBody: i18n.t('notifications.purchaseAlert.genericBody'),
    channel: i18n.t('notifications.purchaseAlert.channel'),
  };
}

/**
 * Called on every open of the signed-in app (and on language or currency change).
 * `accessUntil`: the plan's end, or null when it never ends (admin, family).
 */
export async function syncPurchaseDetection(input: { currency: Currency; accessUntil: string | null }): Promise<void> {
  if (!native) return;
  await loadPrefs();
  const enabled = prefs.enabled;
  const until = input.accessUntil ? new Date(input.accessUntil).getTime() : null;
  try {
    native.setState(
      JSON.stringify({
        enabled,
        accessUntil: Number.isFinite(until) ? until : null,
        currency: input.currency,
        scheme: scheme(),
        texts: texts(),
      }),
    );
  } catch {
    // Best effort: detection simply stays as it was.
  }
}

/** Signed out or access ended: no reminders until the app syncs again. */
export function disablePurchaseDetection(): void {
  try {
    native?.setState(JSON.stringify({ enabled: false }));
  } catch {
    // Best effort.
  }
}

/** When a purchase was last caught on this phone (ms), or null. Used by the setup screen. */
export function lastPurchaseDetectedAt(): number | null {
  try {
    return native?.lastDetectedAt() ?? null;
  } catch {
    return null;
  }
}

/** Android: whether Kaspilo is on under the phone's "Notification access". */
export function isListenerEnabled(): boolean {
  try {
    return native?.isListenerEnabled() ?? false;
  } catch {
    return false;
  }
}

/** iPhone's major iOS version (26 for "26.1"), 0 on Android. */
export const iosMajor = Platform.OS === 'ios' ? parseInt(String(Platform.Version), 10) || 0 : 0;

/** The Wallet "Transaction" automation exists from iOS 17. */
export const purchaseNeedsNewerIos = Platform.OS === 'ios' && iosMajor < 17;

/**
 * iOS 27 and later: the shared Kaspilo shortcut (an iCloud link) already holds the Wallet
 * automation, so setup is "add shortcut" + its switches (docs/spec.md). It must be made on an
 * iOS 27 iPhone, named "Kaspilo". Empty until then: iOS 27 gets the manual guide. Setting it is JS
 * only, so it can reach installed apps by an EAS Update.
 */
export const IOS27_SHORTCUT_URL = '';

/** Whether this iPhone gets the quick iOS 27 path. */
export const quickSetupHere = Platform.OS === 'ios' && iosMajor >= 27 && IOS27_SHORTCUT_URL !== '';

/** iPhone below iOS 27: the setup opens with the advice to update, manual setup under it (owner 2026-11-23). */
export const adviseIosUpdate = Platform.OS === 'ios' && iosMajor < 27;

export function openListenerSettings(): void {
  try {
    native?.openListenerSettings();
  } catch {
    // Nothing to open.
  }
}
