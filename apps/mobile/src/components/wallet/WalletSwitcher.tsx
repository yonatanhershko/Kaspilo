import { type Wallet, WALLET_LIMIT } from '@kaspilo/shared';
import { router } from 'expo-router';
import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { View } from 'react-native';

import { AppText } from '@/components/ui/AppText';
import { BottomSheet } from '@/components/ui/BottomSheet';
import { Icon } from '@/components/ui/Icon';
import { PressScale } from '@/components/ui/PressScale';
import { useWalletName } from '@/data/hooks';
import { useWallet } from '@/data/walletContext';
import { useRowAlign } from '@/i18n';

import { WalletBadge } from './WalletBadge';
import { WalletForm } from './WalletForm';

type Mode = { kind: 'list' } | { kind: 'new' } | { kind: 'edit'; wallet: Wallet };

/**
 * The current wallet as a chip (color dot, name, chevron). Tap opens a sheet from
 * the bottom: switch, edit, or add a wallet. Deleting lives in More → Wallets only.
 */
export function WalletSwitcher({ center = false }: { center?: boolean }) {
  const { t } = useTranslation();
  const align = useRowAlign();
  const nameOf = useWalletName();
  const { wallet, wallets, select } = useWallet();
  const [open, setOpen] = useState(false);
  const [mode, setMode] = useState<Mode>({ kind: 'list' });

  const close = () => setOpen(false);
  const show = () => {
    setMode({ kind: 'list' });
    setOpen(true);
  };
  const name = nameOf(wallet);
  const atLimit = wallets.length >= WALLET_LIMIT;

  const title =
    mode.kind === 'new' ? t('wallets.new') : mode.kind === 'edit' ? t('wallets.edit') : t('wallets.title');

  return (
    <>
      <PressScale
        accessibilityRole="button"
        accessibilityLabel={t('wallets.chipLabel', { name })}
        accessibilityHint={t('wallets.chipHint')}
        hitSlop={4}
        onPress={show}
        style={{ maxWidth: '70%' }}
        className={`min-h-[40px] items-center gap-2 rounded-full border border-border bg-surface px-3.5 ${align.row} ${
          center ? 'self-center' : ''
        }`}>
        <View style={{ width: 10, height: 10, borderRadius: 5, backgroundColor: wallet.color }} />
        <AppText weight="medium" className="shrink text-[15px]" numberOfLines={1}>
          {name}
        </AppText>
        <Icon name="chevron-down" size={18} tone="muted" />
      </PressScale>

      <BottomSheet visible={open} onClose={close} title={title}>
        {mode.kind === 'list' ? (
          <View className="gap-3">
            <View className="overflow-hidden rounded-xl border border-border bg-surface">
              {wallets.map((item, index) => {
                const current = item.id === wallet.id;
                const itemName = nameOf(item);
                return (
                  <View
                    key={item.id}
                    className={`min-h-[60px] items-center ${align.row} ${index > 0 ? 'border-t border-border' : ''}`}>
                    <PressScale
                      accessibilityRole="radio"
                      accessibilityState={{ selected: current }}
                      accessibilityLabel={itemName}
                      onPress={() => {
                        select(item.id);
                        close();
                      }}
                      className={`min-h-[60px] flex-1 items-center gap-3 px-3 ${align.row}`}>
                      <WalletBadge wallet={item} size={36} />
                      <AppText weight={current ? 'medium' : 'regular'} className="flex-1 text-[16px]" numberOfLines={1}>
                        {itemName}
                      </AppText>
                      {current && <Icon name="check" tone="primary" />}
                    </PressScale>
                    <PressScale
                      accessibilityRole="button"
                      accessibilityLabel={t('wallets.editNamed', { name: itemName })}
                      onPress={() => setMode({ kind: 'edit', wallet: item })}
                      className="h-[60px] w-12 items-center justify-center">
                      <Icon name="pencil-outline" size={20} tone="muted" />
                    </PressScale>
                  </View>
                );
              })}
            </View>

            {atLimit ? (
              <AppText tone="muted" className="text-[14px]">
                {t('wallets.limitNote', { max: WALLET_LIMIT })}
              </AppText>
            ) : (
              <PressScale
                accessibilityRole="button"
                accessibilityLabel={t('wallets.new')}
                onPress={() => setMode({ kind: 'new' })}
                className={`min-h-[52px] items-center gap-3 rounded-xl border border-dashed border-primary px-4 ${align.row}`}>
                <Icon name="plus" tone="primary" />
                <AppText weight="medium" tone="primary" className="flex-1 text-[16px]">
                  {t('wallets.new')}
                </AppText>
                <AppText tone="muted" className="text-[14px]">
                  {`${wallets.length}/${WALLET_LIMIT}`}
                </AppText>
              </PressScale>
            )}

            <PressScale
              accessibilityRole="button"
              onPress={() => {
                close();
                router.push('/wallets');
              }}
              className={`min-h-[44px] items-center justify-center gap-2 ${align.row}`}>
              <Icon name="cog-outline" size={18} tone="muted" />
              <AppText tone="muted" className="text-[14px]">
                {t('wallets.manage')}
              </AppText>
            </PressScale>
          </View>
        ) : (
          <WalletForm
            key={mode.kind === 'edit' ? mode.wallet.id : 'new'}
            wallet={mode.kind === 'edit' ? mode.wallet : undefined}
            usedColors={wallets.map((w) => w.color)}
            onCancel={() => setMode({ kind: 'list' })}
            onSaved={(saved) => {
              if (mode.kind === 'new') {
                // A new wallet opens right away.
                select(saved.id);
                close();
              } else {
                setMode({ kind: 'list' });
              }
            }}
          />
        )}
      </BottomSheet>
    </>
  );
}
