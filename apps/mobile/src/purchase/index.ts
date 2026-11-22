import AsyncStorage from '@react-native-async-storage/async-storage';
import type { Currency } from '@kaspilo/shared';
import Constants from 'expo-constants';
import { requireOptionalNativeModule } from 'expo-modules-core';

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

/** The user's switch, saved per device. On by default (spec). */
export async function getPurchasePref(): Promise<boolean> {
  const raw = await AsyncStorage.getItem(PREF_KEY).catch(() => null);
  return raw !== 'false';
}

export async function setPurchasePref(value: boolean): Promise<void> {
  await AsyncStorage.setItem(PREF_KEY, String(value)).catch(() => undefined);
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
  const enabled = await getPurchasePref();
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

export function openListenerSettings(): void {
  try {
    native?.openListenerSettings();
  } catch {
    // Nothing to open.
  }
}
