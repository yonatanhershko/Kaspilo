import * as SecureStore from 'expo-secure-store';
import { Platform } from 'react-native';

/**
 * Session storage for Supabase auth.
 * Native: Keychain / Keystore through expo-secure-store. One entry is limited to
 * about 2 KB, and a session is larger, so the value is split into chunks.
 * Web (dev preview only): localStorage.
 */
const CHUNK_SIZE = 1800;

const countKey = (key: string) => `${key}.n`;
const chunkKey = (key: string, index: number) => `${key}.${index}`;

/**
 * The Keychain can refuse (a build without its entitlement, a locked device during a
 * background refresh). A refusal must never become an uncaught error or keep the app on its
 * splash: a read gives "no session", a write is skipped and the user stays signed in for
 * this run. Warned once in dev so the cause is visible.
 */
let warned = false;
function keychainFailed(action: string, error: unknown) {
  if (__DEV__ && !warned) {
    warned = true;
    console.warn(`[secure-storage] ${action} failed: ${error instanceof Error ? error.message : String(error)}`);
  }
}

async function removeNative(key: string): Promise<void> {
  const count = Number((await SecureStore.getItemAsync(countKey(key))) ?? 0);
  for (let i = 0; i < count; i += 1) {
    await SecureStore.deleteItemAsync(chunkKey(key, i));
  }
  await SecureStore.deleteItemAsync(countKey(key));
}

export const secureStorage = {
  async getItem(key: string): Promise<string | null> {
    if (Platform.OS === 'web') {
      return typeof localStorage === 'undefined' ? null : localStorage.getItem(key);
    }
    try {
      const count = Number((await SecureStore.getItemAsync(countKey(key))) ?? 0);
      if (count === 0) return null;
      const parts: string[] = [];
      for (let i = 0; i < count; i += 1) {
        const part = await SecureStore.getItemAsync(chunkKey(key, i));
        if (part === null) return null;
        parts.push(part);
      }
      return parts.join('');
    } catch (error) {
      keychainFailed('read', error);
      return null;
    }
  },

  async setItem(key: string, value: string): Promise<void> {
    if (Platform.OS === 'web') {
      if (typeof localStorage !== 'undefined') localStorage.setItem(key, value);
      return;
    }
    try {
      await removeNative(key);
      const count = Math.ceil(value.length / CHUNK_SIZE);
      for (let i = 0; i < count; i += 1) {
        await SecureStore.setItemAsync(
          chunkKey(key, i),
          value.slice(i * CHUNK_SIZE, (i + 1) * CHUNK_SIZE),
        );
      }
      await SecureStore.setItemAsync(countKey(key), String(count));
    } catch (error) {
      keychainFailed('write', error);
    }
  },

  async removeItem(key: string): Promise<void> {
    if (Platform.OS === 'web') {
      if (typeof localStorage !== 'undefined') localStorage.removeItem(key);
      return;
    }
    try {
      await removeNative(key);
    } catch (error) {
      keychainFailed('remove', error);
    }
  },
};
