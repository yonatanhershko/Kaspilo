import { type Wallet, WALLET_LIMIT } from '@kaspilo/shared';
import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { View } from 'react-native';

import { ScreenHeader } from '@/components/ScreenHeader';
import { AppText } from '@/components/ui/AppText';
import { BottomSheet } from '@/components/ui/BottomSheet';
import { Button } from '@/components/ui/Button';
import { Dialog } from '@/components/ui/Dialog';
import { Icon } from '@/components/ui/Icon';
import { PressScale } from '@/components/ui/PressScale';
import { Screen } from '@/components/ui/Screen';
import { TextField } from '@/components/ui/TextField';
import { WalletBadge } from '@/components/wallet/WalletBadge';
import { WalletForm } from '@/components/wallet/WalletForm';
import { useWalletName } from '@/data/hooks';
import { useDeleteWallet, useMoveWallet } from '@/data/queries';
import { useWallet } from '@/data/walletContext';
import { useRowAlign } from '@/i18n';
import { useExportWallet } from '@/lib/walletExport';

type Form = null | { kind: 'new' } | { kind: 'edit'; wallet: Wallet };

/** More → Wallets: order, edit, export and delete. Rules: docs/spec.md "Wallets". */
export default function WalletsScreen() {
  const { t } = useTranslation();
  const align = useRowAlign();
  const nameOf = useWalletName();
  const { wallet: current, wallets, select } = useWallet();
  const move = useMoveWallet();
  const remove = useDeleteWallet();
  const exportWallet = useExportWallet();

  const [form, setForm] = useState<Form>(null);
  const [actionsFor, setActionsFor] = useState<Wallet | null>(null);
  const [deleting, setDeleting] = useState<Wallet | null>(null);
  const [typed, setTyped] = useState('');
  const [message, setMessage] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [exporting, setExporting] = useState(false);

  const onlyOne = wallets.length <= 1;
  const atLimit = wallets.length >= WALLET_LIMIT;

  const runExport = async (wallet: Wallet) => {
    setExporting(true);
    setMessage(null);
    try {
      const shared = await exportWallet(wallet);
      setMessage(shared ? t('export.done') : t('export.unavailable'));
    } catch {
      setMessage(t('export.failed'));
    } finally {
      setExporting(false);
    }
  };

  const confirmDelete = async () => {
    if (!deleting) return;
    setError(null);
    try {
      await remove.mutateAsync(deleting.id);
      // Deleting the open wallet: move to the first one that is left.
      if (deleting.id === current.id) {
        const next = wallets.find((w) => w.id !== deleting.id);
        if (next) select(next.id);
      }
      setDeleting(null);
    } catch {
      setError(t('common.errorGeneric'));
    }
  };

  return (
    <Screen leaves="low" scroll className="px-5 pb-8 pt-2">
      <ScreenHeader title={t('wallets.title')} />

      <View className="overflow-hidden rounded-xl border border-border bg-surface">
        {wallets.map((wallet, index) => {
          const name = nameOf(wallet);
          const isCurrent = wallet.id === current.id;
          return (
            <View
              key={wallet.id}
              className={`min-h-[64px] items-center ${align.row} ${index > 0 ? 'border-t border-border' : ''}`}>
              <PressScale
                accessibilityRole="button"
                accessibilityLabel={isCurrent ? `${name}, ${t('wallets.current')}` : name}
                accessibilityHint={t('wallets.rowHint')}
                onPress={() => {
                  setMessage(null);
                  setActionsFor(wallet);
                }}
                className={`min-h-[64px] flex-1 items-center gap-3 px-3 ${align.row}`}>
                <WalletBadge wallet={wallet} size={40} />
                <View className="flex-1">
                  <AppText weight="medium" className="text-[16px]" numberOfLines={1}>
                    {name}
                  </AppText>
                  {isCurrent && (
                    <AppText tone="primary" className="text-[13px]">
                      {t('wallets.current')}
                    </AppText>
                  )}
                </View>
              </PressScale>
              {wallets.length > 1 && (
                <View className="flex-row">
                  <PressScale
                    accessibilityRole="button"
                    accessibilityLabel={t('wallets.moveUp', { name })}
                    accessibilityState={{ disabled: index === 0 }}
                    disabled={index === 0 || move.isPending}
                    onPress={() => move.mutate({ list: wallets, from: index, to: index - 1 })}
                    className={`h-11 w-11 items-center justify-center ${index === 0 ? 'opacity-30' : ''}`}>
                    <Icon name="chevron-up" tone="muted" />
                  </PressScale>
                  <PressScale
                    accessibilityRole="button"
                    accessibilityLabel={t('wallets.moveDown', { name })}
                    accessibilityState={{ disabled: index === wallets.length - 1 }}
                    disabled={index === wallets.length - 1 || move.isPending}
                    onPress={() => move.mutate({ list: wallets, from: index, to: index + 1 })}
                    className={`h-11 w-11 items-center justify-center ${
                      index === wallets.length - 1 ? 'opacity-30' : ''
                    }`}>
                    <Icon name="chevron-down" tone="muted" />
                  </PressScale>
                </View>
              )}
            </View>
          );
        })}
      </View>

      <AppText tone="muted" className="mt-2 text-[13px]">
        {t('wallets.limitNote', { max: WALLET_LIMIT })}
      </AppText>
      {message && (
        <AppText tone="muted" className="mt-2 text-center text-[13px]" accessibilityLiveRegion="polite">
          {message}
        </AppText>
      )}

      {!atLimit && (
        <Button
          label={`${t('wallets.new')}  ${wallets.length}/${WALLET_LIMIT}`}
          variant="outline"
          onPress={() => setForm({ kind: 'new' })}
          className="mt-4"
        />
      )}

      <BottomSheet
        visible={!!form}
        onClose={() => setForm(null)}
        title={form?.kind === 'edit' ? t('wallets.edit') : t('wallets.new')}>
        {form && (
          <WalletForm
            key={form.kind === 'edit' ? form.wallet.id : 'new'}
            wallet={form.kind === 'edit' ? form.wallet : undefined}
            usedColors={wallets.map((w) => w.color)}
            onCancel={() => setForm(null)}
            onSaved={() => setForm(null)}
          />
        )}
      </BottomSheet>

      <Dialog
        visible={!!actionsFor}
        title={nameOf(actionsFor ?? undefined)}
        onClose={() => setActionsFor(null)}
        actions={[
          ...(actionsFor && actionsFor.id !== current.id
            ? [
                {
                  label: t('wallets.open'),
                  onPress: () => {
                    select(actionsFor.id);
                    setActionsFor(null);
                  },
                },
              ]
            : []),
          {
            label: t('wallets.edit'),
            variant: 'outline' as const,
            onPress: () => {
              if (actionsFor) setForm({ kind: 'edit', wallet: actionsFor });
              setActionsFor(null);
            },
          },
          {
            label: t('wallets.export'),
            variant: 'outline' as const,
            loading: exporting,
            onPress: () => {
              const wallet = actionsFor;
              setActionsFor(null);
              if (wallet) void runExport(wallet);
            },
          },
          ...(onlyOne
            ? []
            : [
                {
                  label: t('wallets.delete'),
                  variant: 'accent' as const,
                  onPress: () => {
                    setTyped('');
                    setError(null);
                    setDeleting(actionsFor);
                    setActionsFor(null);
                  },
                },
              ]),
          { label: t('common.cancel'), variant: 'outline' as const, onPress: () => setActionsFor(null) },
        ]}>
        {onlyOne && (
          <AppText tone="muted" className="text-[14px]">
            {t('wallets.lastNote')}
          </AppText>
        )}
      </Dialog>

      <Dialog
        visible={!!deleting}
        title={t('wallets.deleteTitle', { name: nameOf(deleting ?? undefined) })}
        onClose={() => setDeleting(null)}
        actions={[
          {
            label: t('wallets.deleteConfirm'),
            variant: 'accent',
            loading: remove.isPending,
            disabled: !deleting || typed.trim() !== nameOf(deleting).trim(),
            onPress: () => void confirmDelete(),
          },
          {
            label: t('wallets.exportFirst'),
            variant: 'outline',
            loading: exporting,
            onPress: () => {
              if (deleting) void runExport(deleting);
            },
          },
          { label: t('common.cancel'), variant: 'outline', onPress: () => setDeleting(null) },
        ]}>
        <AppText className="text-[15px] leading-[22px]">{t('wallets.deleteBody')}</AppText>
        <TextField
          label={t('wallets.deleteTypeName', { name: nameOf(deleting ?? undefined) })}
          value={typed}
          onChangeText={setTyped}
          autoCapitalize="none"
          autoCorrect={false}
          error={error}
        />
        {message && (
          <AppText tone="muted" className="text-[13px]" accessibilityLiveRegion="polite">
            {message}
          </AppText>
        )}
      </Dialog>
    </Screen>
  );
}
