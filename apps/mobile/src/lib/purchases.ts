/**
 * In-app purchase through RevenueCat (docs/spec.md "Subscription and access").
 *
 * The phone only talks to the store. Access itself is decided by the server: after a
 * purchase or a restore the app asks the `revenuecat-sync` function to re-read the
 * subscription from RevenueCat, then reloads the profile. The phone's own purchase
 * result is never trusted.
 *
 * RevenueCat customer id = the Supabase user id (set after sign-in, cleared on sign-out).
 */
import { Linking, Platform } from 'react-native';
import Purchases, {
  INTRO_ELIGIBILITY_STATUS,
  LOG_LEVEL,
  PACKAGE_TYPE,
  PURCHASES_ERROR_CODE,
  type PurchasesPackage,
} from 'react-native-purchases';

import { env } from '@/lib/env';
import { supabase } from '@/lib/supabase';

const apiKey = Platform.OS === 'ios' ? env.revenueCat.ios : Platform.OS === 'android' ? env.revenueCat.android : '';

/** False on web, or in development without a RevenueCat test key. */
export const purchasesAvailable = apiKey !== '';

let configured = false;
let currentUser: string | null = null;

function configure(userId: string): boolean {
  if (!purchasesAvailable) return false;
  if (!configured) {
    if (__DEV__) void Purchases.setLogLevel(LOG_LEVEL.WARN);
    Purchases.configure({ apiKey, appUserID: userId });
    configured = true;
    currentUser = userId;
  }
  return true;
}

/** Ties the store account on this phone to the signed-in Kaspilo user. */
export async function identifyPurchaser(userId: string): Promise<void> {
  if (!configure(userId) || currentUser === userId) return;
  try {
    await Purchases.logIn(userId);
    currentUser = userId;
  } catch {
    // Retried on the next screen that needs it.
  }
}

/** On sign-out: the next user on this phone must not inherit this one's customer id. */
export async function forgetPurchaser(): Promise<void> {
  if (!configured || currentUser === null) return;
  currentUser = null;
  try {
    await Purchases.logOut();
  } catch {
    // Already anonymous.
  }
}

export type Plans = { yearly: PurchasesPackage | null; monthly: PurchasesPackage | null };

/** The two plans of the current offering, with the store's own prices for this country. */
export async function loadPlans(userId: string): Promise<Plans | null> {
  if (!configure(userId)) return null;
  await identifyPurchaser(userId);
  const offerings = await Purchases.getOfferings();
  const packages = offerings.current?.availablePackages ?? [];
  return {
    yearly: packages.find((p) => p.packageType === PACKAGE_TYPE.ANNUAL) ?? null,
    monthly: packages.find((p) => p.packageType === PACKAGE_TYPE.MONTHLY) ?? null,
  };
}

/**
 * Whether this store account still gets the free trial on the package. The store enforces
 * one trial per Apple ID / Google account (docs/spec.md "Prices and trial"); Google only
 * offers the free phase to eligible accounts, Apple is asked.
 */
export async function trialEligible(pkg: PurchasesPackage): Promise<boolean> {
  const product = pkg.product;
  if (Platform.OS === 'android') return !!product.defaultOption?.freePhase;
  if (!product.introPrice || product.introPrice.price !== 0) return false;
  try {
    const result = await Purchases.checkTrialOrIntroductoryPriceEligibility([product.identifier]);
    return result[product.identifier]?.status !== INTRO_ELIGIBILITY_STATUS.INTRO_ELIGIBILITY_STATUS_INELIGIBLE;
  } catch {
    return true;
  }
}

/**
 * Another amount written the way the store wrote a price: same currency sign, place and
 * decimal mark ("$112.90" + 941 -> "$9.41", "112,90 €" + 941 -> "9,41 €").
 */
export function inStoreStyle(priceString: string, minor: number): string {
  const number = /\d(?:[\d.,\s\u00A0\u202F]*\d)?/.exec(priceString);
  if (!number) return priceString;
  const comma = /,\d{2}$/.test(number[0]);
  const whole = Math.floor(minor / 100).toString();
  const cents = (minor % 100).toString().padStart(2, '0');
  return priceString.replace(number[0], `${whole}${comma ? ',' : '.'}${cents}`);
}

/** A store price (decimal, at most 2 places) in minor units. Rounding only removes float noise. */
export function minorUnits(price: number): number {
  return Math.round(price * 100);
}

/** 'unconfirmed' = the store took it, but the server could not confirm it yet (Restore picks it up). */
export type PurchaseResult = 'ok' | 'cancelled' | 'pending' | 'network' | 'failed' | 'unconfirmed';

type StoreError = { code?: string; userCancelled?: boolean | null };

function storeErrorResult(error: unknown): PurchaseResult {
  const e = (error ?? {}) as StoreError;
  if (e.userCancelled || e.code === PURCHASES_ERROR_CODE.PURCHASE_CANCELLED_ERROR) return 'cancelled';
  if (e.code === PURCHASES_ERROR_CODE.PAYMENT_PENDING_ERROR) return 'pending';
  if (e.code === PURCHASES_ERROR_CODE.NETWORK_ERROR || e.code === PURCHASES_ERROR_CODE.OFFLINE_CONNECTION_ERROR) {
    return 'network';
  }
  return 'failed';
}

/**
 * Asks the server to re-read this user's store subscription and recompute access.
 * Tried a few times: the store sometimes needs a moment before RevenueCat sees a new purchase.
 */
export async function syncWithServer(tries = 3): Promise<boolean> {
  for (let i = 0; i < tries; i++) {
    const { data, error } = await supabase.functions.invoke<{ status: string | null }>('revenuecat-sync', {
      body: { action: 'sync' },
    });
    if (!error && data?.status === 'active') return true;
    if (i < tries - 1) await new Promise((r) => setTimeout(r, 1500 * (i + 1)));
  }
  return false;
}

/** Opens the store's payment sheet, then lets the server confirm. */
export async function buy(pkg: PurchasesPackage): Promise<PurchaseResult> {
  try {
    await Purchases.purchasePackage(pkg);
  } catch (error) {
    return storeErrorResult(error);
  }
  return (await syncWithServer()) ? 'ok' : 'unconfirmed';
}

export type RestoreResult = 'ok' | 'none' | 'network' | 'failed';

/** "Restore purchases": the store account's subscriptions, synced with the server. */
export async function restore(userId: string): Promise<RestoreResult> {
  if (!configure(userId)) return 'failed';
  try {
    await identifyPurchaser(userId);
    await Purchases.restorePurchases();
  } catch (error) {
    const r = storeErrorResult(error);
    return r === 'network' ? 'network' : 'failed';
  }
  return (await syncWithServer(2)) ? 'ok' : 'none';
}

const STORE_SUBSCRIPTIONS_URL =
  Platform.OS === 'ios'
    ? 'https://apps.apple.com/account/subscriptions'
    : 'https://play.google.com/store/account/subscriptions';

/** The store's own "manage subscription" page (cancel, change payment method). */
export async function openManageSubscriptions(userId: string | null): Promise<void> {
  if (userId && configure(userId)) {
    try {
      await Purchases.showManageSubscriptions();
      return;
    } catch {
      // Fall back to the store's web page below.
    }
  }
  await Linking.openURL(STORE_SUBSCRIPTIONS_URL);
}

/** Before account deletion: removes the user from RevenueCat (the store subscription stays). */
export async function forgetOnServer(): Promise<void> {
  await supabase.functions.invoke('revenuecat-sync', { body: { action: 'forget' } });
}
