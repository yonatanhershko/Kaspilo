import { requireOptionalNativeModule } from 'expo-modules-core';

/**
 * App version info without importing expo-application, whose native module is
 * missing in Expo Go on Android (importing it there throws on load).
 */
const native = requireOptionalNativeModule<{
  nativeApplicationVersion?: string | null;
  nativeBuildVersion?: string | null;
}>('ExpoApplication');

/** False in Expo Go on Android. expo-notifications needs it too. */
export const hasApplicationModule = native != null;
export const nativeApplicationVersion: string | null = native?.nativeApplicationVersion ?? null;
export const nativeBuildVersion: string | null = native?.nativeBuildVersion ?? null;
