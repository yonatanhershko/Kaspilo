import { amountToInput, parseAmount, type RepeatFrequency, splitInstallments, todayISO } from '@kaspilo/shared';
import { router, useLocalSearchParams } from 'expo-router';
import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { KeyboardAvoidingView, Platform, Pressable, ScrollView, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { CategoryGrid } from '@/components/CategoryGrid';
import { AmountField } from '@/components/ui/AmountField';
import { AppText } from '@/components/ui/AppText';
import { Shake } from '@/components/ui/Shake';
import { Button } from '@/components/ui/Button';
import { DatePicker } from '@/components/ui/DatePicker';
import { Icon } from '@/components/ui/Icon';
import { Loading } from '@/components/ui/States';
import { TextField } from '@/components/ui/TextField';
import { useDateFormat, useMoney, useWalletName } from '@/data/hooks';
import { useWallet } from '@/data/walletContext';
import { useAuth } from '@/auth/AuthProvider';
import { useRowAlign } from '@/i18n';
import { useKeyboardVisible } from '@/lib/keyboard';
import { OfflineError, saveErrorKey } from '@/lib/network';
import { noteTransactionSaved } from '@/lib/review';
import {
  type Repeat,
  useAddTransaction,
  useCategories,
  useTransaction,
  useUpdateTransaction,
} from '@/data/queries';
import { PressScale } from '@/components/ui/PressScale';

type RepeatChoice = 'none' | RepeatFrequency | 'installments';
const repeatChoices: RepeatChoice[] = ['none', 'weekly', 'monthly', 'yearly', 'installments'];

/**
 * Add (or edit) one income or expense. Bottom sheet over the current screen.
 * Fast path: amount -> category -> save. Description, date and repeat are optional.
 */
/** Close the sheet. Opened by a direct link there is nothing to go back to. */
function closeSheet() {
  if (router.canGoBack()) router.back();
  else router.replace('/today');
}

export default function AddTransactionSheet() {
  const { t } = useTranslation();
  const insets = useSafeAreaInsets();
  // With the keyboard open it already covers the home-indicator area: no gap between sheet and keys.
  const keyboardOpen = useKeyboardVisible();
  const params = useLocalSearchParams<{ type?: string; id?: string }>();
  const editing = useTransaction(params.id);
  const categories = useCategories();
  const add = useAddTransaction();
  const update = useUpdateTransaction();
  const money = useMoney();
  const { short } = useDateFormat();
  const align = useRowAlign();
  const { wallet } = useWallet();
  const userId = useAuth().session?.user.id;
  const walletName = useWalletName()(wallet);

  const [amount, setAmount] = useState('');
  const [description, setDescription] = useState('');
  const [date, setDate] = useState(todayISO());
  const [categoryId, setCategoryId] = useState<string | null>(null);
  const [repeat, setRepeat] = useState<RepeatChoice>('none');
  const [count, setCount] = useState('3');
  const [pickingDate, setPickingDate] = useState(false);
  const [error, setError] = useState<string | null>(null);
  // Counts failed saves, so the message shakes again even when the text is the same.
  const [failures, setFailures] = useState(0);
  const fail = (message: string) => {
    setError(message);
    setFailures((n) => n + 1);
  };
  const [loadedId, setLoadedId] = useState<string | null>(null);

  // Fill the form once when the transaction being edited arrives.
  const loaded = editing.data;
  if (loaded && loadedId !== loaded.id) {
    setLoadedId(loaded.id);
    setAmount(amountToInput(loaded.amount));
    setDescription(loaded.description);
    setDate(loaded.date);
    setCategoryId(loaded.category_id);
  }

  const isEdit = !!params.id;
  const type = editing.data?.type ?? (params.type === 'income' ? 'income' : 'expense');
  const busy = add.isPending || update.isPending;

  const minor = parseAmount(amount);
  const installments = Number(count);
  const installmentsValid = Number.isInteger(installments) && installments >= 2 && installments <= 120;
  const preview =
    repeat === 'installments' && minor !== null && installmentsValid && minor >= installments
      ? splitInstallments(minor, installments)
      : null;

  const save = async () => {
    if (minor === null) return fail(t('add.errors.amount'));
    if (!categoryId) return fail(t('add.errors.category'));
    if (repeat === 'installments' && (!installmentsValid || minor < installments)) {
      return fail(t('add.errors.installments'));
    }
    setError(null);
    try {
      if (isEdit && params.id) {
        await update.mutateAsync({ id: params.id, amount: minor, description, date, category_id: categoryId });
      } else {
        const repeatInput: Repeat =
          repeat === 'none'
            ? { kind: 'none' }
            : repeat === 'installments'
              ? { kind: 'installments', count: installments }
              : { kind: 'recurring', frequency: repeat };
        const outcome = await add.mutateAsync({
          type,
          amount: minor,
          description,
          date,
          category_id: categoryId,
          repeat: repeatInput,
        });
        // Offline adds count once the server has them, not on the phone.
        if (userId && outcome === 'saved') void noteTransactionSaved(userId);
      }
      closeSheet();
    } catch (e) {
      // Offline only a plain income or expense can be added (docs/spec.md "Offline").
      fail(t(e instanceof OfflineError ? (isEdit ? 'offline.needsInternet' : 'offline.repeatNeedsInternet') : saveErrorKey(e)));
    }
  };

  return (
    <KeyboardAvoidingView style={{ flex: 1 }} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
      <Pressable
        className="flex-1 justify-end bg-black/40"
        onPress={closeSheet}
        accessibilityLabel={t('common.close')}>
        <Pressable
          onPress={(e) => e.stopPropagation()}
          className="max-h-[92%] rounded-t-xl bg-background"
          style={{ paddingBottom: keyboardOpen ? 0 : insets.bottom + 12 }}
          accessibilityViewIsModal>
          <View className="flex-row items-center justify-between px-5 pb-2 pt-4">
            <View
              className={`h-10 w-10 items-center justify-center rounded-full ${
                type === 'expense' ? 'bg-accent' : 'bg-primary'
              }`}>
              <Icon
                name={type === 'expense' ? 'arrow-down' : 'arrow-up'}
                tone={type === 'expense' ? 'onAccent' : 'onPrimary'}
              />
            </View>
            <AppText weight="bold" className="text-[19px]" accessibilityRole="header">
              {t(isEdit ? `add.editTitle.${type}` : `add.title.${type}`)}
            </AppText>
            <PressScale
              accessibilityRole="button"
              accessibilityLabel={t('common.close')}
              className="h-11 w-11 items-center justify-center"
              onPress={closeSheet}>
              <Icon name="close" size={24} />
            </PressScale>
          </View>
          {/* Which wallet this goes into, so nothing lands in the wrong book. */}
          <View
            accessible
            accessibilityLabel={t('wallets.inWallet', { name: walletName })}
            className={`-mt-1 mb-1 items-center justify-center gap-1.5 px-5 ${align.row}`}>
            <View style={{ width: 8, height: 8, borderRadius: 4, backgroundColor: wallet.color }} />
            <AppText tone="muted" className="shrink text-[13px]" numberOfLines={1}>
              {t('wallets.inWallet', { name: walletName })}
            </AppText>
          </View>

          {isEdit && editing.isLoading ? (
            <Loading />
          ) : (
            <ScrollView
              contentContainerClassName="gap-4 px-5 pb-2"
              keyboardShouldPersistTaps="handled"
              showsVerticalScrollIndicator={false}>
              <AmountField value={amount} onChangeText={setAmount} label={t('add.amount')} autoFocus={!isEdit} />

              <View>
                <AppText tone="muted" className="mb-1 text-[13px]">
                  {t('add.category')}
                </AppText>
                {categories.isLoading ? (
                  <Loading />
                ) : (
                  <CategoryGrid
                    type={type}
                    categories={categories.data ?? []}
                    selectedId={categoryId}
                    onSelect={setCategoryId}
                  />
                )}
              </View>

              <TextField
                label={t('add.description')}
                value={description}
                onChangeText={setDescription}
                maxLength={200}
                returnKeyType="done"
              />

              <View>
                <AppText tone="muted" className="mb-1 text-[13px]">
                  {t('add.date')}
                </AppText>
                <PressScale
                  accessibilityRole="button"
                  accessibilityLabel={`${t('add.date')}: ${short(date)}`}
                  onPress={() => setPickingDate(true)}
                  className="min-h-[52px] flex-row items-center gap-3 rounded-lg border border-border bg-surface px-4">
                  <Icon name="calendar" tone="primary" />
                  <AppText className="text-[16px]">{short(date)}</AppText>
                </PressScale>
              </View>

              {!isEdit && (
                <View>
                  <AppText tone="muted" className="mb-1 text-[13px]">
                    {t('add.repeat')}
                  </AppText>
                  <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerClassName="gap-2">
                    {repeatChoices.map((choice) => {
                      const selected = repeat === choice;
                      return (
                        <PressScale
                          key={choice}
                          accessibilityRole="button"
                          accessibilityState={{ selected }}
                          onPress={() => setRepeat(choice)}
                          className={`min-h-[44px] justify-center rounded-full border px-4 ${
                            selected ? 'border-primary bg-primary' : 'border-border bg-surface'
                          }`}>
                          <AppText tone={selected ? 'onPrimary' : 'text'} className="text-[14px]">
                            {t(`add.repeatOptions.${choice}`)}
                          </AppText>
                        </PressScale>
                      );
                    })}
                  </ScrollView>
                  {repeat === 'installments' && (
                    <View className="mt-3 gap-2">
                      <TextField
                        label={t('add.installmentsCount')}
                        value={count}
                        onChangeText={(text) => setCount(text.replace(/\D/g, '').slice(0, 3))}
                        keyboardType="number-pad"
                        inputMode="numeric"
                      />
                      {preview && (
                        <AppText tone="muted" className="text-[13px]">
                          {preview[0] === preview[preview.length - 1]
                            ? t('add.installmentsEven', {
                                count: preview.length,
                                each: money.format(preview[0]),
                              })
                            : t('add.installmentsUneven', {
                                count: preview.length,
                                first: money.format(preview[0]),
                                each: money.format(preview[1]),
                              })}
                        </AppText>
                      )}
                    </View>
                  )}
                  {(repeat === 'weekly' || repeat === 'monthly' || repeat === 'yearly') && (
                    <AppText tone="muted" className="mt-2 text-[13px]">
                      {t('add.recurringNote', { date: short(date) })}
                    </AppText>
                  )}
                </View>
              )}

              {error && (
                <Shake trigger={failures}>
                  <AppText tone="danger" className="text-[14px]" accessibilityLiveRegion="polite">
                    {error}
                  </AppText>
                </Shake>
              )}
              <Button label={t('common.save')} onPress={save} loading={busy} />
            </ScrollView>
          )}
        </Pressable>
      </Pressable>
      <DatePicker visible={pickingDate} value={date} onPick={setDate} onClose={() => setPickingDate(false)} />
    </KeyboardAvoidingView>
  );
}
