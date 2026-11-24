import AsyncStorage from '@react-native-async-storage/async-storage';

/** Small device-local preferences. Not sensitive, so plain storage is fine. */
export type ThemePreference = 'system' | 'light' | 'dark';
export type Language = 'he' | 'en' | 'es';

const THEME_KEY = 'kaspilo.theme';
const LANGUAGE_KEY = 'kaspilo.language';

export async function loadThemePreference(): Promise<ThemePreference> {
  const value = await AsyncStorage.getItem(THEME_KEY).catch(() => null);
  return value === 'light' || value === 'dark' ? value : 'system';
}

export async function saveThemePreference(value: ThemePreference): Promise<void> {
  await AsyncStorage.setItem(THEME_KEY, value);
}

/** null means the user never chose, so the phone language decides. */
export async function loadLanguagePreference(): Promise<Language | null> {
  const value = await AsyncStorage.getItem(LANGUAGE_KEY).catch(() => null);
  return value === 'he' || value === 'en' || value === 'es' ? value : null;
}

export async function saveLanguagePreference(value: Language): Promise<void> {
  await AsyncStorage.setItem(LANGUAGE_KEY, value);
}

/** The wallet last open on this device, per user. null = never chosen. */
export async function loadLastWallet(userId: string): Promise<string | null> {
  return AsyncStorage.getItem(`kaspilo.wallet.${userId}`).catch(() => null);
}

export async function saveLastWallet(userId: string, walletId: string): Promise<void> {
  await AsyncStorage.setItem(`kaspilo.wallet.${userId}`, walletId).catch(() => undefined);
}
