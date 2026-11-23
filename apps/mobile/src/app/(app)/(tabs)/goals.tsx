import { type DepositSource, parseAmount, percentOf } from '@kaspilo/shared';
import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { View } from 'react-native';

import { useAuth } from '@/auth/AuthProvider';
import { AmountField } from '@/components/ui/AmountField';
import { AppText } from '@/components/ui/AppText';
import { Button } from '@/components/ui/Button';
import { Confetti } from '@/components/ui/Confetti';
import { Dialog } from '@/components/ui/Dialog';
import { Icon } from '@/components/ui/Icon';
import { PressScale } from '@/components/ui/PressScale';
import { ProgressFill } from '@/components/ui/ProgressFill';
import { Screen } from '@/components/ui/Screen';
import { Segmented } from '@/components/ui/Segmented';
import { EmptyState, ErrorState, Loading } from '@/components/ui/States';
import { TextField } from '@/components/ui/TextField';
import { useMoney } from '@/data/hooks';
import { type GoalWithSaved, useDeleteGoal, useDeposit, useGoals, useSaveGoal } from '@/data/queries';
import { useRowAlign } from '@/i18n';
import { noteGoalReached } from '@/lib/review';
import { WalletSwitcher } from '@/components/wallet/WalletSwitcher';
import { saveErrorKey } from '@/lib/network';

const GOAL_ICONS = ['flag', 'airplane', 'chart-line', 'home', 'car', 'school', 'beach', 'piggy-bank', 'gift', 'laptop'];

export default function GoalsScreen() {
  const { t } = useTranslation();
  const goals = useGoals();
  const [creating, setCreating] = useState(false);
  const [depositFor, setDepositFor] = useState<GoalWithSaved | null>(null);
  const [deleting, setDeleting] = useState<GoalWithSaved | null>(null);
  const remove = useDeleteGoal();
  // Deleted goals that kept their deposits are archived: not listed, deposits still count.
  const active = goals.data?.filter((g) => !g.archived_at) ?? [];
  const deleteGoal = async (mode: 'keep' | 'erase') => {
    if (deleting) await remove.mutateAsync({ id: deleting.id, mode }).catch(() => undefined);
    setDeleting(null);
  };

  return (
    <Screen leaves="low" scroll className="px-5 pb-8 pt-3">
      <View className="mb-2 flex-row items-center justify-between">
        <View className="w-11" />
        <AppText weight="bold" className="text-[20px]" accessibilityRole="header">
          {t('goals.title')}
        </AppText>
        <PressScale
          accessibilityRole="button"
          accessibilityLabel={t('goals.add')}
          className="h-11 w-11 items-center justify-center"
          onPress={() => setCreating(true)}>
          <Icon name="plus" size={26} tone="primary" />
        </PressScale>
      </View>
      <View className="mb-3">
        <WalletSwitcher center />
      </View>

      {goals.isLoading ? (
        <Loading />
      ) : goals.isError ? (
        <ErrorState onRetry={() => void goals.refetch()} />
      ) : active.length === 0 ? (
        <View className="items-center gap-4">
          <EmptyState text={t('goals.empty')} />
          <Button label={t('goals.add')} onPress={() => setCreating(true)} className="self-stretch" />
        </View>
      ) : (
        <View className="gap-4">
          {active.map((goal) => (
            <GoalCard key={goal.id} goal={goal} onDeposit={() => setDepositFor(goal)} onDelete={() => setDeleting(goal)} />
          ))}
        </View>
      )}

      {creating && <GoalDialog onClose={() => setCreating(false)} />}
      {depositFor && <DepositDialog goal={depositFor} onClose={() => setDepositFor(null)} />}
      <Dialog
        visible={!!deleting}
        title={t('goals.deleteTitle', { name: deleting?.name ?? '' })}
        onClose={() => setDeleting(null)}
        actions={[
          { label: t('goals.deleteKeep'), variant: 'accent', loading: remove.isPending, onPress: () => void deleteGoal('keep') },
          { label: t('goals.deleteErase'), variant: 'outline', disabled: remove.isPending, onPress: () => void deleteGoal('erase') },
          { label: t('common.cancel'), variant: 'outline', onPress: () => setDeleting(null) },
        ]}>
        <AppText className="text-[15px]">{t('goals.deleteBody')}</AppText>
      </Dialog>
    </Screen>
  );
}

function GoalCard({ goal, onDeposit, onDelete }: { goal: GoalWithSaved; onDeposit: () => void; onDelete: () => void }) {
  const { t } = useTranslation();
  const money = useMoney();
  const percent = Math.min(100, Math.floor(percentOf(goal.saved, goal.target_amount)));
  const reached = goal.saved >= goal.target_amount;
  const align = useRowAlign();
  // Confetti only at the moment the goal is reached, not on every visit to the screen.
  const [wasReached, setWasReached] = useState(reached);
  const [celebrate, setCelebrate] = useState(false);
  if (wasReached !== reached) {
    setWasReached(reached);
    setCelebrate(reached);
  }

  return (
    <View className="rounded-xl border border-border bg-surface p-4">
      <View className={`items-start justify-between ${align.row}`}>
        <View className="flex-1">
          <AppText weight="bold" className="text-[19px]">
            {goal.name}
          </AppText>
          <AppText tone="muted" className="text-[15px]">
            {t('goals.target', { amount: money.format(goal.target_amount) })}
          </AppText>
        </View>
        <Icon name={goal.icon} size={40} tone="primary" />
      </View>

      <View
        className="mt-3 h-[8px] overflow-hidden rounded-full bg-surface-muted"
        accessibilityRole="progressbar"
        accessibilityValue={{ min: 0, max: 100, now: percent }}>
        <ProgressFill ratio={percent / 100} introKey={`goal.${goal.id}`} className={reached ? 'bg-success' : 'bg-primary'} />
      </View>
      {/* Zero-height line under the bar: the confetti pops from here, above the rest of the card. */}
      <View style={{ zIndex: 1 }}>
        <Confetti play={celebrate} />
      </View>
      <View className={`mt-2 justify-between ${align.row}`}>
        <AppText className="text-[15px]">{t('goals.saved', { amount: money.format(goal.saved) })}</AppText>
        <AppText weight="medium" className="text-[15px]">
          {percent}%
        </AppText>
      </View>

      <Button label={t('goals.deposit')} onPress={onDeposit} className="mt-3" />
      <PressScale
        accessibilityRole="button"
        accessibilityLabel={t('goals.deleteTitle', { name: goal.name })}
        onPress={onDelete}
        className="mt-1 min-h-[44px] items-center justify-center">
        <AppText tone="muted" className="text-[13px]">
          {t('common.delete')}
        </AppText>
      </PressScale>
    </View>
  );
}

function GoalDialog({ onClose }: { onClose: () => void }) {
  const { t } = useTranslation();
  const save = useSaveGoal();
  const [name, setName] = useState('');
  const [target, setTarget] = useState('');
  const [already, setAlready] = useState('');
  const [icon, setIcon] = useState('flag');
  const [error, setError] = useState<string | null>(null);

  const submit = async () => {
    const amount = parseAmount(target);
    if (name.trim().length === 0) return setError(t('goals.errors.name'));
    if (amount === null) return setError(t('goals.errors.target'));
    // Optional: money already saved before the goal existed. Empty = none.
    const alreadySaved = already.trim() === '' ? 0 : parseAmount(already);
    if (alreadySaved === null) return setError(t('add.errors.amount'));
    try {
      await save.mutateAsync({ name, target_amount: amount, icon, alreadySaved });
      onClose();
    } catch (e) {
      setError(t(saveErrorKey(e)));
    }
  };

  return (
    <Dialog
      visible
      title={t('goals.add')}
      onClose={onClose}
      actions={[
        { label: t('common.save'), onPress: submit, loading: save.isPending },
        { label: t('common.cancel'), variant: 'outline', onPress: onClose },
      ]}>
      <TextField label={t('goals.name')} value={name} onChangeText={setName} maxLength={60} />
      <View>
        <AppText tone="muted" className="mb-1 text-[13px]">
          {t('goals.targetAmount')}
        </AppText>
        <AmountField value={target} onChangeText={setTarget} label={t('goals.targetAmount')} size="normal" />
      </View>
      <View>
        <AppText tone="muted" className="mb-1 text-[13px]">
          {t('goals.alreadySavedOptional')}
        </AppText>
        <AmountField value={already} onChangeText={setAlready} label={t('goals.alreadySavedOptional')} size="normal" />
        <AppText tone="muted" className="mt-1 text-[13px]">
          {t('goals.alreadySavedNote')}
        </AppText>
      </View>
      <View className="flex-row flex-wrap gap-1">
        {GOAL_ICONS.map((item) => (
          <PressScale
            key={item}
            accessibilityRole="button"
            accessibilityLabel={item}
            accessibilityState={{ selected: item === icon }}
            onPress={() => setIcon(item)}
            className={`h-11 w-11 items-center justify-center rounded-full border ${
              item === icon ? 'border-primary bg-surface' : 'border-transparent'
            }`}>
            <Icon name={item} tone={item === icon ? 'primary' : 'muted'} />
          </PressScale>
        ))}
      </View>
      {error && (
        <AppText tone="danger" className="text-[14px]">
          {error}
        </AppText>
      )}
    </Dialog>
  );
}

function DepositDialog({ goal, onClose }: { goal: GoalWithSaved; onClose: () => void }) {
  const { t } = useTranslation();
  const deposit = useDeposit();
  const userId = useAuth().session?.user.id;
  const [amount, setAmount] = useState('');
  const [source, setSource] = useState<DepositSource>('new');
  const [error, setError] = useState<string | null>(null);

  const submit = async () => {
    const minor = parseAmount(amount);
    if (minor === null) return setError(t('add.errors.amount'));
    try {
      await deposit.mutateAsync({ goal_id: goal.id, amount: minor, source });
      const reached = goal.saved < goal.target_amount && goal.saved + minor >= goal.target_amount;
      if (reached && userId) void noteGoalReached(userId);
      onClose();
    } catch (e) {
      setError(t(saveErrorKey(e)));
    }
  };

  return (
    <Dialog
      visible
      title={t('goals.depositTitle', { name: goal.name })}
      onClose={onClose}
      actions={[
        { label: t('goals.deposit'), onPress: submit, loading: deposit.isPending },
        { label: t('common.cancel'), variant: 'outline', onPress: onClose },
      ]}>
      <Segmented
        options={[
          { value: 'new', label: t('goals.depositNow') },
          { value: 'existing', label: t('goals.alreadySaved') },
        ]}
        value={source}
        onChange={setSource}
      />
      <AmountField value={amount} onChangeText={setAmount} label={t('add.amount')} autoFocus />
      <AppText tone="muted" className="text-[13px]">
        {t(source === 'existing' ? 'goals.alreadySavedNote' : 'goals.depositNote')}
      </AppText>
      {error && (
        <AppText tone="danger" className="text-[14px]">
          {error}
        </AppText>
      )}
    </Dialog>
  );
}
