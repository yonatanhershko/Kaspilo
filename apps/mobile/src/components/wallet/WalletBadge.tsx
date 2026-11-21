import type { Wallet } from '@kaspilo/shared';

import { CategoryIcon } from '@/components/ui/Icon';

/** Round badge with the wallet's icon in its color. */
export function WalletBadge({ wallet, size = 40 }: { wallet: Pick<Wallet, 'icon' | 'color'>; size?: number }) {
  return <CategoryIcon icon={wallet.icon} color={wallet.color} size={size} />;
}
