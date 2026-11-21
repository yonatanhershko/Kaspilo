import { colors as tokenColors } from '@kaspilo/tokens';
import { useColorScheme, View } from 'react-native';

import type { ThemePreference } from '@/lib/preferences';

import { Backdrop } from './Backdrop';
import { WalletLoader } from './WalletLoader';

/**
 * Loading screen: the logo wallet popping its cards on the app background. Shown
 * after the native splash (which cannot animate) hands over. No words on purpose:
 * it shows before the saved language is read, so text would flash in the wrong
 * language. Works before the theme provider exists: the user's saved light/dark choice
 * once it is read, the phone's setting until then (and for "system").
 */
export function SplashScreenArt({ preference = 'system' }: { preference?: ThemePreference | null }) {
  const phone = useColorScheme() === 'dark' ? 'dark' : 'light';
  const scheme = preference === 'light' || preference === 'dark' ? preference : phone;
  return (
    <View
      accessibilityLabel="Kaspilo"
      style={{
        flex: 1,
        alignItems: 'center',
        justifyContent: 'center',
        backgroundColor: tokenColors[scheme].background,
      }}>
      <Backdrop theme={scheme} />
      <WalletLoader width={160} burstColor={tokenColors[scheme].accent} />
    </View>
  );
}
