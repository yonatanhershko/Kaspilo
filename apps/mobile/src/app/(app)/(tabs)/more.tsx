import { amountToInput, type Currency, currencySymbol, isAppleHiddenEmail, parseAmount } from '@kaspilo/shared';
import { router } from 'expo-router';
import { type ReactNode, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { View } from 'react-native';

import { isAppleUser, revokeApple } from '@/auth/apple';
import { useAuth } from '@/auth/AuthProvider';
import { AmountField } from '@/components/ui/AmountField';
import { AppText } from '@/components/ui/AppText';
import { Dialog } from '@/components/ui/Dialog';
import { Icon } from '@/components/ui/Icon';
import { Screen } from '@/components/ui/Screen';
import { TextField } from '@/components/ui/TextField';
import { useMoney, useWalletName } from '@/data/hooks';
import { useUpdateSettings, useUpdateWallet } from '@/data/queries';
import { useOutbox } from '@/data/outbox';
import { useWallet } from '@/data/walletContext';
import { changeLanguage, LANGUAGE_NAMES, languages, useLanguage, useRowAlign } from '@/i18n';
import type { Language, ThemePreference } from '@/lib/preferences';
import { supabase } from '@/lib/supabase';
import { useTheme } from '@/theme/ThemeProvider';
import { PressScale } from '@/components/ui/PressScale';

type Open = null | 'name' | 'language' | 'theme' | 'currency' | 'startDay' | 'budget' | 'delete' | 'signOut';


const CURRENCY_ICON = { ILS: 'currency-ils', USD: 'currency-usd', EUR: 'currency-eur' } as const;
export default function MoreScreen() {
  const { t } = useTranslation();
  const language = useLanguage();
  const align = useRowAlign();
  const { preference, setPreference } = useTheme();
  const { profile, session, signOut, refreshProfile } = useAuth();
  // Deleting an Apple account shows Apple's sheet once more (to disconnect at Apple): say so first.
  const appleAccount = !!session?.user.identities?.some((i) => i.provider === 'apple');
  // Apple's "Hide My Email" address means nothing to read, so show a label instead.
  const shownEmail = isAppleHiddenEmail(profile?.email) ? t('more.appleHiddenEmail') : profile?.email;
  const update = useUpdateSettings();
  const { wallet } = useWallet();
  const walletName = useWalletName()(wallet);
  const updateWallet = useUpdateWallet();
  const saveWallet = (patch: { month_start_day?: number; overall_budget?: number | null }) =>
    updateWallet.mutateAsync({ id: wallet.id, ...patch });
  const money = useMoney();
  // Transactions added offline and not sent yet are lost on sign out: warn first.
  const unsent = useOutbox().length;

  const [open, setOpen] = useState<Open>(null);
  const [text, setText] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const show = (which: Open, initial = '') => {
    setText(initial);
    setError(null);
    setOpen(which);
  };
  const close = () => setOpen(null);

  const run = async (action: () => Promise<unknown>) => {
    setBusy(true);
    setError(null);
    try {
      await action();
      close();
    } catch (e) {
      // The user closed a system sheet (Apple): stay in the dialog, no error.
      if (!(e instanceof Error && e.message === 'cancelled')) setError(t('common.errorGeneric'));
    } finally {
      setBusy(false);
    }
  };

  const themeLabel: Record<ThemePreference, string> = {
    system: t('settings.themeSystem'),
    light: t('settings.themeLight'),
    dark: t('settings.themeDark'),
  };
  // Budget month and overall budget belong to the current wallet.
  const startDay = wallet.month_start_day;
  const overall = wallet.overall_budget;
  const chevron = align.he ? 'chevron-left' : 'chevron-right';

  const row = (icon: string, label: string, value: string | null, onPress: () => void, danger = false) => (
    <PressScale
      accessibilityRole="button"
      accessibilityLabel={value ? `${label}: ${value}` : label}
      onPress={onPress}
      className={`min-h-[56px] items-center gap-3 px-4 active:opacity-70 ${align.row}`}>
      <Icon name={icon} tone={danger ? 'danger' : 'primary'} />
      <AppText tone={danger ? 'danger' : 'text'} className="flex-1 text-[16px]">
        {label}
      </AppText>
      {value && (
        <AppText tone="muted" className="text-[14px]">
          {value}
        </AppText>
      )}
      <Icon name={chevron} tone="muted" size={20} />
    </PressScale>
  );

  const group = (children: ReactNode[]) => (
    <View className="overflow-hidden rounded-xl border border-border bg-surface">
      {children.map((child, i) => (
        <View key={i} className={i > 0 ? 'border-t border-border' : ''}>
          {child}
        </View>
      ))}
    </View>
  );

  const choices = <T extends string>(options: { value: T; label: string }[], current: T, pick: (v: T) => void) => (
    <View className="gap-2">
      {options.map((option) => {
        const selected = option.value === current;
        return (
          <PressScale
            key={option.value}
            accessibilityRole="radio"
            accessibilityState={{ selected }}
            onPress={() => pick(option.value)}
            className={`min-h-[48px] items-center justify-between rounded-lg border px-4 ${align.row} ${
              selected ? 'border-primary bg-leaf-light' : 'border-border bg-surface'
            }`}>
            <AppText className="text-[16px]">{option.label}</AppText>
            {selected && <Icon name="check" tone="primary" />}
          </PressScale>
        );
      })}
    </View>
  );

  return (
    <Screen leaves="low" scroll className="gap-4 px-5 pb-8 pt-3">
      <AppText weight="bold" className="text-center text-[20px]" accessibilityRole="header">
        {t('tabs.more')}
      </AppText>

      {group([
        row('account-circle-outline', t('more.account'), profile?.full_name || shownEmail || null, () =>
          show('name', profile?.full_name ?? ''),
        ),
        row('translate', t('settings.language'), LANGUAGE_NAMES[language], () => show('language')),
        row('theme-light-dark', t('settings.theme'), themeLabel[preference], () => show('theme')),
      ])}

      {group([
        row(
          CURRENCY_ICON[money.currency],
          t('more.currency'),
          currencySymbol[money.currency],
          () => show('currency'),
        ),
        row('wallet-outline', t('wallets.title'), walletName, () => router.push('/wallets')),
      ])}

      <AppText tone="muted" className="-mb-2 px-1 text-[13px]">
        {t('wallets.settingsOf', { name: walletName })}
      </AppText>
      {group([
        row('calendar-start', t('more.monthStart'), String(startDay), () => show('startDay', String(startDay))),
        row(
          'chart-donut',
          t('more.overallBudget'),
          overall === null ? t('more.notSet') : money.format(overall),
          () => show('budget', overall === null ? '' : amountToInput(overall)),
        ),
        row('shape-outline', t('more.categories'), null, () => router.push('/categories')),
        row('history', t('more.history'), null, () => router.push('/history')),
      ])}

      {group([
        row('bell-outline', t('notifications.title'), null, () => router.push('/notifications')),
        row('trash-can-outline', t('more.deleteAccount'), null, () => show('delete'), true),
      ])}

      {group([row('information-outline', t('about.title'), null, () => router.push('/about'))])}

      <PressScale
        accessibilityRole="button"
        onPress={() => (unsent > 0 ? show('signOut') : void signOut())}
        className={`min-h-[56px] items-center gap-3 rounded-xl border border-danger bg-danger-surface px-4 active:opacity-70 ${align.row}`}>
        <Icon name="logout" tone="danger" />
        <AppText tone="danger" weight="medium" className="text-[16px]">
          {t('auth.signOut')}
        </AppText>
      </PressScale>

      <Dialog
        visible={open === 'name'}
        title={t('more.account')}
        onClose={close}
        actions={[
          {
            label: t('common.save'),
            loading: busy,
            onPress: () => {
              if (text.trim().length < 2) return setError(t('auth.errors.nameRequired'));
              void run(async () => {
                if (!profile) return;
                const { error: failed } = await supabase.from('profiles').update({ full_name: text.trim() }).eq('id', profile.id);
                if (failed) throw new Error(failed.message);
                await refreshProfile();
              });
            },
          },
          { label: t('common.cancel'), variant: 'outline', onPress: close },
        ]}>
        <TextField label={t('auth.fullName')} value={text} onChangeText={setText} error={error} maxLength={80} />
        <AppText tone="muted" className="text-[13px]">
          {shownEmail}
        </AppText>
      </Dialog>

      <Dialog
        visible={open === 'language'}
        title={t('settings.language')}
        onClose={close}
        actions={[{ label: t('common.close'), variant: 'outline', onPress: close }]}>
        {choices<Language>(
          languages.map((value) => ({ value, label: LANGUAGE_NAMES[value] })),
          language,
          (value) => {
            close();
            void changeLanguage(value);
          },
        )}
      </Dialog>

      <Dialog
        visible={open === 'theme'}
        title={t('settings.theme')}
        onClose={close}
        actions={[{ label: t('common.close'), variant: 'outline', onPress: close }]}>
        {choices<ThemePreference>(
          (['system', 'light', 'dark'] as const).map((value) => ({ value, label: themeLabel[value] })),
          preference,
          setPreference,
        )}
      </Dialog>

      <Dialog
        visible={open === 'currency'}
        title={t('more.currency')}
        onClose={close}
        actions={[{ label: t('common.close'), variant: 'outline', onPress: close }]}>
        {choices<Currency>(
          [
            { value: 'ILS', label: `₪  ${t('more.currencyILS')}` },
            { value: 'USD', label: `$  ${t('more.currencyUSD')}` },
            { value: 'EUR', label: `€  ${t('more.currencyEUR')}` },
          ],
          money.currency,
          (value) => void run(() => update.mutateAsync({ currency: value })),
        )}
        <AppText tone="muted" className="text-[13px]">
          {t('more.currencyNote')}
        </AppText>
        {error && <AppText tone="danger" className="text-[14px]">{error}</AppText>}
      </Dialog>

      <Dialog
        visible={open === 'startDay'}
        title={t('more.monthStart')}
        onClose={close}
        actions={[
          {
            label: t('common.save'),
            loading: busy,
            onPress: () => {
              const day = Number(text);
              if (!Number.isInteger(day) || day < 1 || day > 31) return setError(t('more.monthStartError'));
              void run(() => saveWallet({ month_start_day: day }));
            },
          },
          { label: t('common.cancel'), variant: 'outline', onPress: close },
        ]}>
        <TextField
          label={t('more.monthStartLabel')}
          value={text}
          onChangeText={(value) => setText(value.replace(/\D/g, '').slice(0, 2))}
          keyboardType="number-pad"
          inputMode="numeric"
          error={error}
        />
        <AppText tone="muted" className="text-[13px]">
          {t('more.monthStartNote')}
        </AppText>
      </Dialog>

      <Dialog
        visible={open === 'budget'}
        title={t('more.overallBudget')}
        onClose={close}
        actions={[
          {
            label: t('common.save'),
            loading: busy,
            onPress: () => {
              const value = parseAmount(text);
              if (value === null) return setError(t('add.errors.amount'));
              void run(() => saveWallet({ overall_budget: value }));
            },
          },
          ...(overall !== null
            ? [
                {
                  label: t('category.removeBudget'),
                  variant: 'accent' as const,
                  onPress: () => void run(() => saveWallet({ overall_budget: null })),
                },
              ]
            : []),
          { label: t('common.cancel'), variant: 'outline' as const, onPress: close },
        ]}>
        <AmountField value={text} onChangeText={setText} label={t('more.overallBudget')} autoFocus />
        {error && <AppText tone="danger" className="text-[14px]">{error}</AppText>}
      </Dialog>

      <Dialog
        visible={open === 'signOut'}
        title={t('auth.signOut')}
        onClose={close}
        actions={[
          { label: t('offline.signOutAnyway'), variant: 'accent', loading: busy, onPress: () => void run(signOut) },
          { label: t('common.cancel'), variant: 'outline', onPress: close },
        ]}>
        <AppText className="text-[15px] leading-[22px]">{t('offline.signOutWarning', { count: unsent })}</AppText>
      </Dialog>

      <Dialog
        visible={open === 'delete'}
        title={t('more.deleteTitle')}
        onClose={close}
        actions={[
          {
            label: t('more.deleteConfirm'),
            variant: 'accent',
            loading: busy,
            disabled: text.trim() !== t('more.deleteWord'),
            onPress: () =>
              void run(async () => {
                // Apple users: revoke at Apple first. Closing Apple's sheet stops the deletion.
                if ((await isAppleUser()) && (await revokeApple()) === 'cancelled') throw new Error('cancelled');
                const { error: failed } = await supabase.rpc('delete_account');
                if (failed) throw new Error(failed.message);
                await signOut();
              }),
          },
          { label: t('common.cancel'), variant: 'outline', onPress: close },
        ]}>
        <AppText className="text-[15px] leading-[22px]">{t('more.deleteBody')}</AppText>
        {appleAccount && (
          <AppText className="text-[15px] leading-[22px]">{t('more.deleteAppleNote')}</AppText>
        )}
        <TextField
          label={t('more.deleteTypeToConfirm', { word: t('more.deleteWord') })}
          value={text}
          onChangeText={setText}
          autoCapitalize="none"
          error={error}
        />
      </Dialog>
    </Screen>
  );
}
