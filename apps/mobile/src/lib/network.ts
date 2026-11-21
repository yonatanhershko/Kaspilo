import NetInfo, { type NetInfoState, useNetInfo } from '@react-native-community/netinfo';
import { focusManager, onlineManager } from '@tanstack/react-query';
import { AppState, Platform } from 'react-native';

/**
 * Connection state for the offline rules (docs/spec.md "Offline").
 * "Unknown" counts as online: only a clear "no connection" switches to offline.
 */
function online(state: Pick<NetInfoState, 'isConnected' | 'isInternetReachable'>): boolean {
  return state.isConnected !== false && state.isInternetReachable !== false;
}

/** React Query pauses fetching while offline (cached data stays on screen) and refetches on return. */
onlineManager.setEventListener((setOnline) => NetInfo.addEventListener((state) => setOnline(online(state))));

// Back from the background counts as focus: stale data refreshes.
if (Platform.OS !== 'web') {
  focusManager.setEventListener((setFocused) => {
    const sub = AppState.addEventListener('change', (state) => setFocused(state === 'active'));
    return () => sub.remove();
  });
}

export async function isOnline(): Promise<boolean> {
  return online(await NetInfo.fetch());
}

export function useOnline(): boolean {
  return online(useNetInfo());
}

/** Call fn each time the connection comes back. Returns the unsubscribe. */
export function onReconnect(fn: () => void): () => void {
  let was = true;
  return NetInfo.addEventListener((state) => {
    const now = online(state);
    if (now && !was) fn();
    was = now;
  });
}

/** Thrown when an action needs the internet and there is none. */
export class OfflineError extends Error {
  constructor() {
    super('offline');
  }
}

/** The server refused: this user sent too many requests (docs/spec.md "Request limits"). */
export class RateLimitError extends Error {
  constructor() {
    super('rate_limited');
  }
}

/** i18n key for a failed save: the rate-limit message, else the given one. */
export function saveErrorKey(e: unknown, fallback = 'common.errorGeneric'): string {
  return e instanceof RateLimitError ? 'common.tooManyActions' : fallback;
}

/**
 * A failed Supabase call that may work later (no connection, timeout, server busy),
 * as opposed to a refusal by the server (rules, missing row) that will fail again.
 */
export function isTransient(result: { status?: number; error?: { code?: string } | null }): boolean {
  const status = result.status ?? 0;
  if (status === 0 || !result.error?.code) return true;
  return status === 401 || status === 408 || status === 429 || status >= 500;
}
