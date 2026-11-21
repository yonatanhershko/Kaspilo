import { reloadAppAsync } from 'expo';
import { getLocales } from 'expo-localization';
import { createInstance } from 'i18next';
import { useSyncExternalStore } from 'react';
import { initReactI18next } from 'react-i18next';
import { I18nManager, Platform } from 'react-native';

import AsyncStorage from '@react-native-async-storage/async-storage';

import { type Language, saveLanguagePreference } from '@/lib/preferences';

import en from './en.json';
import he from './he.json';

const i18n = createInstance();

export const languages: Language[] = ['he', 'en'];
const RELOAD_MARK_KEY = 'kaspilo.dirReload';

/** Hebrew phone -> Hebrew. Any other phone language -> English. */
export function deviceLanguage(): Language {
  const code = getLocales()[0]?.languageCode;
  // Older Android reports Hebrew as "iw".
  if (code === 'he' || code === 'iw') return 'he';
  return 'en';
}

/**
 * The layout never mirrors: same on iPhone, Android and web (owner decision).
 * Hebrew only changes text alignment and icon/text row order, see `useRowAlign`.
 * A phone set to Hebrew would otherwise flip everything natively, so switch that off.
 * Native needs one reload the first time the flag changes.
 */
async function applyDirection(language: Language): Promise<void> {
  if (Platform.OS === 'web') {
    if (typeof document !== 'undefined') {
      document.documentElement.dir = 'ltr';
      document.documentElement.lang = language;
    }
    return;
  }
  I18nManager.allowRTL(false);
  I18nManager.forceRTL(false);
  if (!I18nManager.isRTL) {
    await AsyncStorage.removeItem(RELOAD_MARK_KEY).catch(() => undefined);
    return;
  }
  // One reload only. If the platform still reports RTL after it, do not loop.
  const tried = await AsyncStorage.getItem(RELOAD_MARK_KEY).catch(() => null);
  if (tried === 'ltr') return;
  await AsyncStorage.setItem(RELOAD_MARK_KEY, 'ltr').catch(() => undefined);
  await reloadAppAsync();
}

/**
 * Row direction and text alignment for the active language, same on every platform.
 *  - `row`: use instead of `flex-row` for rows of icon + text (Hebrew: icon at the right).
 *  - `text`: style for text-like things that are not `AppText` (TextInput).
 */
export function useRowAlign() {
  const he = useLanguage() === 'he';
  return {
    he,
    row: he ? ('flex-row-reverse' as const) : ('flex-row' as const),
    text: { textAlign: he ? 'right' : 'left', writingDirection: he ? 'rtl' : 'ltr' } as const,
  };
}

/** Call once at startup. `saved` is the user's earlier choice, if any. */
export async function initI18n(saved: Language | null): Promise<void> {
  const language = saved ?? deviceLanguage();
  await i18n.use(initReactI18next).init({
    resources: { he: { translation: he }, en: { translation: en } },
    lng: language,
    fallbackLng: 'en',
    interpolation: { escapeValue: false },
  });
  await applyDirection(language);
}

/** User picked a language in settings. No reload: the layout does not flip. */
export async function changeLanguage(language: Language): Promise<void> {
  await saveLanguagePreference(language);
  await i18n.changeLanguage(language);
  await applyDirection(language);
}

export const currentLanguage = (): Language => (i18n.language === 'en' ? 'en' : 'he');

function subscribeToLanguage(onChange: () => void) {
  i18n.on('languageChanged', onChange);
  return () => i18n.off('languageChanged', onChange);
}

/** Active language as React state. Use this in components, not currentLanguage(). */
export function useLanguage(): Language {
  return useSyncExternalStore(subscribeToLanguage, currentLanguage, currentLanguage);
}

export default i18n;
