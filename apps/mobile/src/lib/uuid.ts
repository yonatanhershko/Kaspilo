import { requireOptionalNativeModule } from 'expo';

// expo-crypto's native module. Real builds (EAS, dev builds) and iOS Expo Go have it.
// Android Expo Go 58.0.5 does not, and importing expo-crypto there crashes every route.
const ExpoCrypto = requireOptionalNativeModule<{ randomUUID(): string }>('ExpoCrypto');

if (!ExpoCrypto && !__DEV__) {
  // A release build must always ship the native module.
  throw new Error('ExpoCrypto native module is missing');
}

// RFC 4122 v4 UUID. Native crypto when available; Math.random only in dev Expo Go.
export function randomUUID(): string {
  if (ExpoCrypto) return ExpoCrypto.randomUUID();
  return 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, (c) => {
    const r = Math.floor(Math.random() * 16);
    return (c === 'x' ? r : (r & 0x3) | 0x8).toString(16);
  });
}
