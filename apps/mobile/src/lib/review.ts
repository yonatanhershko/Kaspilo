import AsyncStorage from '@react-native-async-storage/async-storage';
import { nativeApplicationVersion, nativeBuildVersion } from '@/lib/nativeApp';
import Constants, { ExecutionEnvironment } from 'expo-constants';
import { Linking, Platform } from 'react-native';
import * as StoreReview from 'expo-store-review';

/**
 * App review prompt and store links. Rules: docs/spec.md "About and app review".
 * Counters live on the phone, per user.
 */
const DAY_MS = 24 * 60 * 60 * 1000;
const MIN_DAYS = 7;
const MIN_SAVED = 10;
const GAP_DAYS = 120;
/** Wait until the add sheet has closed and home is back before asking. */
const ASK_DELAY_MS = 900;

type ReviewState = { firstOpen: number; saved: number; lastAsked: number | null };

const key = (userId: string) => `kaspilo.review.${userId}`;

async function load(userId: string): Promise<ReviewState | null> {
  try {
    const raw = await AsyncStorage.getItem(key(userId));
    return raw ? (JSON.parse(raw) as ReviewState) : null;
  } catch {
    return null;
  }
}

async function store(userId: string, state: ReviewState) {
  await AsyncStorage.setItem(key(userId), JSON.stringify(state)).catch(() => undefined);
}

/** First time this user opens the app on this phone: start the 7-day clock. */
export async function markFirstOpen(userId: string) {
  if (await load(userId)) return;
  await store(userId, { firstOpen: Date.now(), saved: 0, lastAsked: null });
}

/** A new transaction was saved: count it, then maybe ask for a review. */
export async function noteTransactionSaved(userId: string) {
  const state = (await load(userId)) ?? { firstOpen: Date.now(), saved: 0, lastAsked: null };
  const next = { ...state, saved: state.saved + 1 };
  await store(userId, next);
  await maybeAsk(userId, next);
}

/** A deposit just reached a goal's target: a happy moment, maybe ask. */
export async function noteGoalReached(userId: string) {
  const state = await load(userId);
  if (state) await maybeAsk(userId, state);
}

async function maybeAsk(userId: string, state: ReviewState) {
  const now = Date.now();
  if (now - state.firstOpen < MIN_DAYS * DAY_MS) return;
  if (state.saved < MIN_SAVED) return;
  if (state.lastAsked !== null && now - state.lastAsked < GAP_DAYS * DAY_MS) return;
  try {
    if (!(await StoreReview.isAvailableAsync())) return;
    await store(userId, { ...state, lastAsked: now });
    await new Promise((resolve) => setTimeout(resolve, ASK_DELAY_MS));
    // The OS decides whether the dialog really shows; we never learn the answer.
    await StoreReview.requestReview();
  } catch {
    // A review prompt is never worth an error on screen.
  }
}

/** The store page where the user writes a review, or null until the app is in the store. */
export function writeReviewUrl(): string | null {
  const url = StoreReview.storeUrl();
  if (!url) return null;
  if (Platform.OS === 'ios') return `${url}${url.includes('?') ? '&' : '?'}action=write-review`;
  return url;
}

export function openWriteReview() {
  const url = writeReviewUrl();
  if (url) void Linking.openURL(url);
}

/** "1.0.0 (12)". In Expo Go the build number belongs to Expo Go, so it is left out. */
export function appVersionLabel(): string {
  const version = Constants.expoConfig?.version ?? nativeApplicationVersion ?? '';
  const inExpoGo = Constants.executionEnvironment === ExecutionEnvironment.StoreClient;
  const build = inExpoGo ? null : nativeBuildVersion;
  return build ? `${version} (${build})` : version;
}
