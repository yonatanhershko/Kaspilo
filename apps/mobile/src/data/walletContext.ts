import type { Wallet } from '@kaspilo/shared';
import { createContext, useContext } from 'react';

export type WalletState = {
  /** The wallet the app shows now. */
  wallet: Wallet;
  /** All the user's wallets, in their order. */
  wallets: Wallet[];
  /** Switch to another wallet; remembered on this device. */
  select: (id: string) => void;
};

export const WalletContext = createContext<WalletState | null>(null);

/** The current wallet and the list. Only inside the signed-in app (WalletProvider). */
export function useWallet(): WalletState {
  const state = useContext(WalletContext);
  if (!state) throw new Error('useWallet outside WalletProvider');
  return state;
}

/** Id of the current wallet: every money query and key is scoped by it. */
export function useWalletId(): string {
  return useWallet().wallet.id;
}
