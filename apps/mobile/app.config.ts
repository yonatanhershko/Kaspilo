import type { ExpoConfig } from 'expo/config';

/**
 * Two fully separate app variants so dev and prod can sit on one phone:
 *   development -> "Kaspilo Dev", kaspilo-dev://, com.kaspilo.app.dev
 *   production  -> "Kaspilo",     kaspilo://,     com.kaspilo.app
 * APP_VARIANT is set per build profile in eas.json. Local `expo start` is development.
 */
const variant = process.env.APP_VARIANT === 'production' ? 'production' : 'development';
const isProd = variant === 'production';

// The EAS project (@yonatan88/kaspilo, made 2026-11-20 for the rename; the old @yonatan88/finny
// is no longer used), shared by dev and prod. Needed for builds and push tokens.
// Not a secret. Written here and not only in .env, because the EAS CLI does not read .env files.
const easProjectId = process.env.EAS_PROJECT_ID || 'dfa79492-dd02-4e54-ac4a-a3eba11d5059';

// Firebase config for Android push (delivery only): path to google-services.json, set once
// the owner has downloaded it (GOOGLE_SERVICES_JSON=./google-services.json). See docs/notifications-setup.md.
const googleServicesFile = process.env.GOOGLE_SERVICES_JSON || undefined;

const bundleId = isProd ? 'com.kaspilo.app' : 'com.kaspilo.app.dev';

// Google sign-in client IDs (Google Cloud project finny-f9dba: a project ID can never change, only its display name). Not secrets: they ship inside the app.
// Web client = the one Supabase uses, shared by dev and prod. iOS client: one per bundle ID.
// Android clients need no ID here (Google matches package + SHA-1). See docs/google-sign-in.md.
const googleWebClientId =
  process.env.EXPO_PUBLIC_GOOGLE_WEB_CLIENT_ID ||
  '542359804466-g6fep91ls990ksosp6r886gqp3ll7v7f.apps.googleusercontent.com';
const googleIosClientId = isProd
  ? process.env.EXPO_PUBLIC_GOOGLE_IOS_CLIENT_ID_PROD
  : process.env.EXPO_PUBLIC_GOOGLE_IOS_CLIENT_ID_DEV ||
    // "Kaspilo iOS dev" client, bundle ID com.kaspilo.app.dev (made 2026-11-20 for the rename).
    '542359804466-v0ko2s3tu7hsqvm1va9t151k7hrtoihr.apps.googleusercontent.com';
// iOS needs the reversed client ID as a URL scheme so Google can hand back to the app.
const googleIosUrlScheme = googleIosClientId
  ? `com.googleusercontent.apps.${googleIosClientId.replace('.apps.googleusercontent.com', '')}`
  : undefined;

const config: ExpoConfig = {
  name: isProd ? 'Kaspilo' : 'Kaspilo Dev',
  slug: 'kaspilo',
  owner: 'yonatan88',
  version: '1.0.0',
  orientation: 'portrait',
  icon: './assets/images/icon.png',
  scheme: isProd ? 'kaspilo' : 'kaspilo-dev',
  userInterfaceStyle: 'automatic',
  // EAS Update (docs/ci-cd.md): JS-only fixes reach installed apps without a store review.
  // An update only goes to builds with the same app version (runtime), so a native change needs a new build.
  runtimeVersion: { policy: 'appVersion' },
  updates: { url: `https://u.expo.dev/${easProjectId}` },
  ios: {
    bundleIdentifier: bundleId,
    // Optional: signing team for local device builds, set per machine (APPLE_TEAM_ID=...). Not stored in git.
    appleTeamId: process.env.APPLE_TEAM_ID,
    supportsTablet: false,
    // Sign in with Apple (App Store guideline 4.8, since Google sign-in is offered). EAS turns
    // the capability on for the App ID at build time.
    usesAppleSignIn: true,
    // No custom encryption (HTTPS only), so App Store Connect skips the export-compliance question.
    infoPlist: { ITSAppUsesNonExemptEncryption: false },
  },
  android: {
    package: bundleId,
    googleServicesFile,
    adaptiveIcon: {
      backgroundColor: '#F5F1E8',
      foregroundImage: './assets/images/android-icon-foreground.png',
      backgroundImage: './assets/images/android-icon-background.png',
      monochromeImage: './assets/images/android-icon-monochrome.png',
    },
    predictiveBackGestureEnabled: false,
  },
  web: {
    output: 'single',
    favicon: './assets/images/favicon.png',
  },
  plugins: [
    'expo-router',
    'expo-secure-store',
    // Push + local notifications. The small Android status-bar icon is the default one for now.
    'expo-notifications',
    // Native Google sign-in. Android needs no plugin options; iOS only once its client ID is set.
    ...(googleIosUrlScheme
      ? [['@react-native-google-signin/google-signin', { iosUrlScheme: googleIosUrlScheme }] as [string, object]]
      : []),
    'expo-apple-authentication',
    ['expo-localization', { supportedLocales: { ios: ['he', 'en'], android: ['he', 'en'] } }],
    [
      'expo-splash-screen',
      {
        backgroundColor: '#F5F1E8',
        image: './assets/images/splash-icon.png',
        imageWidth: 160,
        // The native splash can only follow the phone's setting; the moving one after it follows the app's.
        dark: { backgroundColor: '#16211C', image: './assets/images/splash-icon.png' },
      },
    ],
  ],
  experiments: {
    typedRoutes: true,
    reactCompiler: true,
  },
  extra: {
    appVariant: variant,
    supportsRTL: true,
    googleClientIds: { web: googleWebClientId, ios: googleIosClientId },
    ...(easProjectId ? { eas: { projectId: easProjectId } } : {}),
  },
};

export default config;
