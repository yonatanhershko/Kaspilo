/**
 * Public runtime config. Values come from .env.development / .env.production
 * (or EAS environment variables). EXPO_PUBLIC_* ships in the bundle: no secrets here.
 */
function required(name: string, value: string | undefined): string {
  if (!value) {
    throw new Error(`Missing ${name}. Copy apps/mobile/.env.example to .env.development.`);
  }
  return value;
}

export type AppEnv = 'development' | 'production';

export const env = {
  appEnv: (process.env.EXPO_PUBLIC_APP_ENV === 'production' ? 'production' : 'development') as AppEnv,
  supabaseUrl: required('EXPO_PUBLIC_SUPABASE_URL', process.env.EXPO_PUBLIC_SUPABASE_URL),
  supabasePublishableKey: required(
    'EXPO_PUBLIC_SUPABASE_PUBLISHABLE_KEY',
    process.env.EXPO_PUBLIC_SUPABASE_PUBLISHABLE_KEY,
  ),
  /**
   * RevenueCat public SDK keys (not secret: they only identify the app to RevenueCat).
   * Production: the real App Store / Google Play apps. Development: the RevenueCat
   * Test Store key, so dev builds never touch real store products (docs/in-app-purchase.md).
   */
  revenueCat:
    process.env.EXPO_PUBLIC_APP_ENV === 'production'
      ? { ios: 'appl_kPflBzkzWfGBhbeSBjGdYXGGxLF', android: 'goog_VNepXKtYeMaxCzrVGzMHdbJGeAn' }
      : {
          ios: process.env.EXPO_PUBLIC_REVENUECAT_TEST_KEY ?? '',
          android: process.env.EXPO_PUBLIC_REVENUECAT_TEST_KEY ?? '',
        },
} as const;
