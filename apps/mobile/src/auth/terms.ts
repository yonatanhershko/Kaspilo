import { useSyncExternalStore } from 'react';

/** Bump when the terms text changes; stored with each sign-up. */
export const TERMS_VERSION = '2026-11-24';

/**
 * "Opened and read the terms" for the sign-up in progress. Lives in memory
 * only: a new app launch means the user reads them again.
 */
let read = false;
const listeners = new Set<() => void>();

export function markTermsRead() {
  read = true;
  listeners.forEach((listener) => listener());
}

export function resetTermsRead() {
  read = false;
  listeners.forEach((listener) => listener());
}

const subscribe = (listener: () => void) => {
  listeners.add(listener);
  return () => listeners.delete(listener);
};

export function useTermsRead(): boolean {
  return useSyncExternalStore(subscribe, () => read, () => read);
}
