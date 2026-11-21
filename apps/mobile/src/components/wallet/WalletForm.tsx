import { categoryPalette } from '@kaspilo/tokens';
import type { Wallet } from '@kaspilo/shared';
import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { View } from 'react-native';

import { CategoryForm } from '@/components/CategoryGrid';
import { AppText } from '@/components/ui/AppText';
import { Button } from '@/components/ui/Button';
import { useWalletName } from '@/data/hooks';
import { useCreateWallet, useUpdateWallet, WalletLimitError } from '@/data/queries';
import { saveErrorKey } from '@/lib/network';

export const WALLET_ICONS = [
  'wallet-outline',
  'briefcase-outline',
  'home-outline',
  'account-group-outline',
  'piggy-bank-outline',
  'store-outline',
  'airplane',
  'car-outline',
  'heart-outline',
  'school-outline',
] as const;

/**
 * Name, icon and color of a wallet. With `wallet` it edits that one,
 * without it creates a new one (default categories come from the server).
 */
export function WalletForm({
  wallet,
  usedColors = [],
  onSaved,
  onCancel,
}: {
  wallet?: Wallet;
  /** Colors other wallets use: a new wallet starts on one that is free. */
  usedColors?: string[];
  onSaved: (wallet: Wallet) => void;
  onCancel: () => void;
}) {
  const { t } = useTranslation();
  const nameOf = useWalletName();
  const create = useCreateWallet();
  const update = useUpdateWallet();
  const [draft, setDraft] = useState(() => ({
    name: wallet ? nameOf(wallet) : '',
    icon: wallet?.icon ?? WALLET_ICONS[1],
    color: wallet?.color ?? (categoryPalette.find((c) => !usedColors.includes(c)) ?? categoryPalette[0]),
  }));
  const [error, setError] = useState<string | null>(null);
  const busy = create.isPending || update.isPending;

  const save = async () => {
    const name = draft.name.trim();
    if (name.length === 0) return setError(t('wallets.nameRequired'));
    setError(null);
    try {
      if (wallet) {
        // Keep the translated default name while the user did not change it.
        const unchanged = !wallet.name && name === nameOf(wallet);
        onSaved(
          await update.mutateAsync({
            id: wallet.id,
            name: unchanged ? null : name,
            icon: draft.icon,
            color: draft.color,
          }),
        );
      } else {
        onSaved(await create.mutateAsync({ name, icon: draft.icon, color: draft.color }));
      }
    } catch (e) {
      setError(e instanceof WalletLimitError ? t('wallets.limitReached') : t(saveErrorKey(e)));
    }
  };

  return (
    <View className="gap-4">
      <CategoryForm
        name={draft.name}
        icon={draft.icon}
        color={draft.color}
        label={t('wallets.name')}
        maxLength={30}
        icons={WALLET_ICONS}
        error={error}
        onChange={(patch) => {
          setError(null);
          setDraft((d) => ({ ...d, ...patch }));
        }}
      />
      {!wallet && (
        <AppText tone="muted" className="text-[13px]">
          {t('wallets.newNote')}
        </AppText>
      )}
      <View className="gap-2">
        <Button label={t('common.save')} onPress={() => void save()} loading={busy} />
        <Button label={t('common.cancel')} variant="outline" onPress={onCancel} disabled={busy} />
      </View>
    </View>
  );
}
