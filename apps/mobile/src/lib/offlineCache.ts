import AsyncStorage from '@react-native-async-storage/async-storage';
import type { Profile } from '@kaspilo/shared';

/**
 * What the phone keeps per user for offline use (docs/spec.md "Offline"):
 * the data cache, the last profile read from the server, and the queue of
 * transactions not sent yet. All of it is cleared on sign out and account deletion.
 */
export const cacheKey = (userId: string) => `kaspilo.cache.${userId}`;
export const outboxKey = (userId: string) => `kaspilo.outbox.${userId}`;
const profileKey = (userId: string) => `kaspilo.profile.${userId}`;

/** Keys being cleared: late writes (the cache saves on a timer) must not bring them back. */
const blocked = new Set<string>();

/** AsyncStorage for the data cache, which ignores writes while that user is being cleared. */
export const cacheStorage = {
  getItem: (key: string) => AsyncStorage.getItem(key),
  setItem: async (key: string, value: string) => {
    if (!blocked.has(key)) await AsyncStorage.setItem(key, value);
  },
  removeItem: (key: string) => AsyncStorage.removeItem(key),
};

/** The signed-in app opened for this user: their cache may be written again. */
export function allowCache(userId: string) {
  blocked.delete(cacheKey(userId));
}

export async function saveProfile(profile: Profile) {
  await AsyncStorage.setItem(profileKey(profile.id), JSON.stringify(profile)).catch(() => undefined);
}

/** The last profile the server gave, or null. Display only: the server decides access. */
export async function loadProfile(userId: string): Promise<Profile | null> {
  try {
    const raw = await AsyncStorage.getItem(profileKey(userId));
    return raw ? (JSON.parse(raw) as Profile) : null;
  } catch {
    return null;
  }
}

export async function clearOfflineData(userId: string) {
  blocked.add(cacheKey(userId));
  await AsyncStorage.multiRemove([cacheKey(userId), outboxKey(userId), profileKey(userId)]).catch(() => undefined);
}
