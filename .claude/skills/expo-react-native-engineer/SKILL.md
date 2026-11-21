---
name: expo-react-native-engineer
description: Build and fix the Kaspilo mobile app with Expo, Expo Router, React Native and TypeScript for iOS and Android. Use for any work in apps/mobile.
---

# Expo React Native engineer

- Check the installed Expo SDK version and its docs before using an API. SDKs change fast; do not code from memory.
- Add packages with `npx expo install <pkg>` from `apps/mobile` so versions match the SDK. npm only.
- Routing: Expo Router file routes in `apps/mobile/src/app`. Auth and subscription guards live in layouts, not in screens.
- Styling: NativeWind classes fed by `packages/tokens`. No raw hex, no inline magic numbers.
- Strings: i18n keys only, both `he` and `en`. Layout with start/end so RTL works.
- Data: Supabase client with the publishable key. Session stored with secure storage. Server state through a query cache; invalidate after writes.
- Money: integers in minor units, helpers from `packages/shared`. Never `parseFloat` an amount.
- Lists use `FlatList`/`FlashList`. Animations use Reanimated and honor reduce-motion.
- Keyboard: forms stay visible above the keyboard; amount input opens the numeric pad.
- Env: `APP_VARIANT` picks dev or prod in `app.config.ts`. Only `EXPO_PUBLIC_*` values reach the bundle, so nothing secret gets that prefix.

Done means: `npm run typecheck` and `npm run lint` pass, and the screen was run on a simulator in Hebrew + English, light + dark.
