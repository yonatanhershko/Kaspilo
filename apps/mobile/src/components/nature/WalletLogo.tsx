import { View } from 'react-native';

import { Sway } from './Sway';
import { Wallet } from './Wallet';

/** The Kaspilo logo for the home header: a small wallet turning slowly in 3D. */
export function WalletLogo({ size = 44 }: { size?: number }) {
  return (
    <View accessibilityRole="image" accessibilityLabel="Kaspilo">
      <Sway rotateY={28} rotateX={8} tilt={2} bob={2} duration={2600}>
        <Wallet size={size} shadow={false} />
      </Sway>
    </View>
  );
}
