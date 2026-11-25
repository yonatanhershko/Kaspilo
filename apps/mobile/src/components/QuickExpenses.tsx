import { type Category, pickQuickExpenses, type QuickExpense, quickWindow, todayISO } from '@kaspilo/shared';
import { type ComponentRef, useEffect, useMemo, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { AccessibilityInfo, ScrollView, View } from 'react-native';
import Animated, {
  Easing,
  FadeInDown,
  FadeOutDown,
  useAnimatedStyle,
  useReducedMotion,
  useSharedValue,
  withTiming,
} from 'react-native-reanimated';

import { AppText } from '@/components/ui/AppText';
import { Icon } from '@/components/ui/Icon';
import { PressScale } from '@/components/ui/PressScale';
import { useCategoryName, useMoney } from '@/data/hooks';
import { useAddTransaction, useTransactions, useUndoAdd } from '@/data/queries';
import { useAuth } from '@/auth/AuthProvider';
import { useRowAlign } from '@/i18n';
import { useTheme } from '@/theme/ThemeProvider';
import { saveErrorKey } from '@/lib/network';
import { noteTransactionSaved } from '@/lib/review';
import { randomUUID } from '@/lib/uuid';

/** How long the "Saved · Undo" note stays (docs/spec.md "Quick expenses"). */
const NOTE_MS = 5000;

/** `saving` settles when the server (or the phone's queue) has it; Undo waits for it. */
export type QuickNote = {
  key: string;
  id: string | null;
  text: string;
  saving?: Promise<unknown>;
};

/**
 * Home row of quick expenses: one tap saves a pair the user adds often.
 * Shows nothing while loading, on error, or with no pair yet: it only speeds things up.
 */
export function QuickExpenses({
  categories,
  onNote,
}: {
  categories: Category[] | undefined;
  onNote: (note: QuickNote) => void;
}) {
  const { t } = useTranslation();
  const money = useMoney();
  const nameOf = useCategoryName();
  const align = useRowAlign();
  const userId = useAuth().session?.user.id;
  const today = todayISO();
  const recent = useTransactions(quickWindow(today));
  const add = useAddTransaction();
  const [busy, setBusy] = useState(false);
  const scroll = useRef<ComponentRef<typeof ScrollView>>(null);

  const byId = useMemo(() => new Map((categories ?? []).map((c) => [c.id, c])), [categories]);
  const pairs = useMemo(() => {
    const active = new Set((categories ?? []).filter((c) => c.type === 'expense' && !c.archived).map((c) => c.id));
    return pickQuickExpenses(recent.data ?? [], active, today);
  }, [recent.data, categories, today]);

  // Hebrew: the row starts at its right end. After layout, or Android keeps it at the left.
  const toStart = () => {
    if (align.he) requestAnimationFrame(() => scroll.current?.scrollToEnd({ animated: false }));
  };

  if (pairs.length === 0) return null;

  const save = async (pair: QuickExpense) => {
    if (busy) return;
    const category = byId.get(pair.category_id);
    const label = `${nameOf(category)} ${money.format(pair.amount)}`;
    const id = randomUUID();
    setBusy(true);
    const saving = add.mutateAsync({
      id,
      type: 'expense',
      amount: pair.amount,
      description: '',
      date: todayISO(),
      category_id: pair.category_id,
      repeat: { kind: 'none' },
    });
    // The note shows at once; the save goes on behind it.
    onNote({ key: id, id, text: t('quick.saved', { item: label }), saving });
    try {
      const outcome = await saving;
      if (userId && outcome === 'saved') void noteTransactionSaved(userId);
    } catch (e) {
      onNote({ key: randomUUID(), id: null, text: t(saveErrorKey(e)) });
    } finally {
      setBusy(false);
    }
  };

  return (
    <ScrollView
      ref={scroll}
      horizontal
      showsHorizontalScrollIndicator={false}
      className="-mx-5 mt-3"
      // Hebrew starts at the right: the most used pill sits under the right thumb.
      // flexGrow: with few pills the row still fills the width, so they sit at the right.
      contentContainerStyle={{ flexGrow: 1 }}
      contentContainerClassName={`gap-2 px-5 ${align.row}`}
      onLayout={toStart}
      onContentSizeChange={toStart}>
      {pairs.map((pair) => {
        const category = byId.get(pair.category_id);
        const name = nameOf(category);
        return (
          <PressScale
            key={`${pair.category_id}:${pair.amount}`}
            accessibilityRole="button"
            accessibilityLabel={t('quick.add', {
              item: `${name} ${money.format(pair.amount)}`,
            })}
            accessibilityState={{ busy }}
            onPress={() => void save(pair)}
            scaleTo={0.94}
            hitSlop={{ top: 6, bottom: 6 }}
            className={`h-9 items-center gap-1.5 rounded-full border-[1.5px] border-secondary bg-surface px-3.5 active:opacity-80 ${align.row}`}>
            {category && <Icon name={category.icon} size={17} color={category.color} set="category" />}
            <AppText className="text-[14px]" numberOfLines={1}>
              {name}
            </AppText>
            <AppText weight="medium" className="text-[14px]">
              {money.format(pair.amount)}
            </AppText>
          </PressScale>
        );
      })}
    </ScrollView>
  );
}

/** Rises from the bottom for 5 s with a shrinking line; "Undo" deletes the quick add. */
export function QuickNoteToast({ note, bottom, onDone }: { note: QuickNote; bottom: number; onDone: () => void }) {
  const { t } = useTranslation();
  const align = useRowAlign();
  const reduceMotion = useReducedMotion();
  const undo = useUndoAdd();
  const { colors } = useTheme();
  const left = useSharedValue(1);

  useEffect(() => {
    AccessibilityInfo.announceForAccessibility(note.text);
    left.value = 1;
    if (!reduceMotion) {
      left.value = withTiming(0, { duration: NOTE_MS, easing: Easing.linear });
    }
    const timer = setTimeout(onDone, NOTE_MS);
    return () => clearTimeout(timer);
    // A new note (new key) restarts it.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [note.key]);

  const line = useAnimatedStyle(() => ({ width: `${left.value * 100}%` }));

  const onUndo = async () => {
    if (!note.id) return;
    onDone();
    try {
      // A failed save has nothing to undo; its own error note shows instead.
      if (note.saving) await note.saving;
      await undo.mutateAsync(note.id);
      AccessibilityInfo.announceForAccessibility(t('quick.undone'));
    } catch {
      AccessibilityInfo.announceForAccessibility(t('common.errorGeneric'));
    }
  };

  return (
    <Animated.View
      key={note.key}
      entering={FadeInDown.duration(350).easing(Easing.out(Easing.cubic))}
      exiting={FadeOutDown.duration(220)}
      pointerEvents="box-none"
      className="absolute left-4 right-4"
      style={{ bottom }}
      accessibilityLiveRegion="polite">
      <View className="overflow-hidden rounded-xl bg-primary">
        <View className={`min-h-[48px] items-center gap-2 px-4 ${align.row}`}>
          {note.id && <Icon name="check-circle" size={20} tone="onPrimary" />}
          <AppText tone="onPrimary" className="flex-1 text-[15px]" numberOfLines={1}>
            {note.text}
          </AppText>
          {note.id && (
            <PressScale
              accessibilityRole="button"
              accessibilityLabel={t('quick.undo')}
              onPress={() => void onUndo()}
              className="min-h-[44px] min-w-[44px] items-center justify-center px-2">
              <AppText weight="bold" tone="onPrimary" className="text-[15px]">
                {t('quick.undo')}
              </AppText>
            </PressScale>
          )}
        </View>
        {!reduceMotion && (
          <Animated.View style={[{ height: 3, backgroundColor: colors.onPrimary, opacity: 0.45 }, line]} />
        )}
      </View>
    </Animated.View>
  );
}
