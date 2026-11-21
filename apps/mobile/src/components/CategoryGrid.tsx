import { categoryPalette } from '@kaspilo/tokens';
import type { Category, TransactionType } from '@kaspilo/shared';
import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { ScrollView, View } from 'react-native';

import { useCategoryName } from '@/data/hooks';
import { useSaveCategory } from '@/data/queries';

import { AppText } from './ui/AppText';
import { Dialog } from './ui/Dialog';
import { CategoryIcon, Icon } from './ui/Icon';
import { TextField } from './ui/TextField';
import { PressScale } from '@/components/ui/PressScale';
import { saveErrorKey } from '@/lib/network';

export const CATEGORY_ICONS = [
  'tag', 'car', 'gas-station', 'bus', 'silverware-fork-knife', 'coffee', 'cart', 'food-apple',
  'home', 'receipt', 'cellphone', 'shopping', 'tshirt-crew', 'gift', 'movie-open', 'beach',
  'heart-pulse', 'medical-bag', 'dumbbell', 'school', 'baby-carriage', 'paw', 'briefcase',
  'laptop', 'bank', 'cash-multiple', 'piggy-bank', 'credit-card-outline', 'chart-line', 'airplane',
] as const;

/** Name, icon and color for a new or existing category. */
export function CategoryForm({
  name,
  icon,
  color,
  onChange,
  error,
  label,
  maxLength = 40,
  icons = CATEGORY_ICONS,
}: {
  name: string;
  icon: string;
  color: string;
  onChange: (patch: { name?: string; icon?: string; color?: string }) => void;
  error?: string | null;
  /** Name field label. Default: the category name label. */
  label?: string;
  maxLength?: number;
  icons?: readonly string[];
}) {
  const { t } = useTranslation();
  return (
    <View className="gap-3">
      <TextField
        label={label ?? t('categories.name')}
        value={name}
        onChangeText={(text) => onChange({ name: text })}
        error={error}
        maxLength={maxLength}
      />
      <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerClassName="gap-2">
        {icons.map((item) => (
          <PressScale
            key={item}
            accessibilityRole="button"
            accessibilityLabel={item}
            accessibilityState={{ selected: item === icon }}
            onPress={() => onChange({ icon: item })}
            className={`h-11 w-11 items-center justify-center rounded-full border ${
              item === icon ? 'border-primary bg-surface' : 'border-transparent'
            }`}>
            <Icon name={item} color={item === icon ? color : undefined} tone="muted" />
          </PressScale>
        ))}
      </ScrollView>
      <View className="flex-row flex-wrap gap-2">
        {categoryPalette.map((item) => (
          <PressScale
            key={item}
            accessibilityRole="button"
            accessibilityLabel={item}
            accessibilityState={{ selected: item === color }}
            onPress={() => onChange({ color: item })}
            className={`h-11 w-11 items-center justify-center rounded-full border-2 ${
              item === color ? 'border-text' : 'border-transparent'
            }`}>
            <View style={{ width: 28, height: 28, borderRadius: 14, backgroundColor: item }} />
          </PressScale>
        ))}
      </View>
    </View>
  );
}

/** Icon grid for picking a category, with a "+" tile at the end to add one. */
export function CategoryGrid({
  type,
  categories,
  selectedId,
  onSelect,
}: {
  type: TransactionType;
  categories: Category[];
  selectedId: string | null;
  onSelect: (id: string) => void;
}) {
  const { t } = useTranslation();
  const nameOf = useCategoryName();
  const save = useSaveCategory();
  const [adding, setAdding] = useState(false);
  const [draft, setDraft] = useState({ name: '', icon: 'tag', color: categoryPalette[0] as string });
  const [error, setError] = useState<string | null>(null);

  const visible = categories.filter((c) => c.type === type && (!c.archived || c.id === selectedId));

  const create = async () => {
    if (draft.name.trim().length === 0) {
      setError(t('categories.nameRequired'));
      return;
    }
    try {
      const created = await save.mutateAsync({ type, ...draft, name: draft.name.trim() });
      onSelect(created.id);
      setAdding(false);
      setDraft({ name: '', icon: 'tag', color: categoryPalette[0] });
      setError(null);
    } catch (e) {
      setError(t(saveErrorKey(e)));
    }
  };

  return (
    <>
      <View className="flex-row flex-wrap" style={{ marginHorizontal: -4 }}>
        {visible.map((category) => {
          const selected = category.id === selectedId;
          return (
            <View key={category.id} style={{ width: '25%', padding: 4 }}>
              <PressScale
                accessibilityRole="button"
                accessibilityState={{ selected }}
                accessibilityLabel={nameOf(category)}
                onPress={() => onSelect(category.id)}
                className={`min-h-[76px] items-center justify-center gap-1 rounded-lg border px-1 py-2 ${
                  selected ? 'border-primary bg-leaf-light' : 'border-border bg-surface'
                }`}>
                <CategoryIcon icon={category.icon} color={category.color} size={34} />
                <AppText className="text-center text-[12px]" numberOfLines={1}>
                  {nameOf(category)}
                </AppText>
              </PressScale>
            </View>
          );
        })}
        <View style={{ width: '25%', padding: 4 }}>
          <PressScale
            accessibilityRole="button"
            accessibilityLabel={t('categories.add')}
            onPress={() => setAdding(true)}
            className="min-h-[76px] items-center justify-center gap-1 rounded-lg border border-dashed border-primary px-1 py-2">
            <Icon name="plus" tone="primary" size={26} />
            <AppText tone="primary" className="text-center text-[12px]" numberOfLines={1}>
              {t('categories.new')}
            </AppText>
          </PressScale>
        </View>
      </View>

      <Dialog
        visible={adding}
        title={t('categories.add')}
        onClose={() => setAdding(false)}
        actions={[
          { label: t('common.save'), onPress: create, loading: save.isPending },
          { label: t('common.cancel'), variant: 'outline', onPress: () => setAdding(false) },
        ]}>
        <CategoryForm {...draft} error={error} onChange={(patch) => setDraft({ ...draft, ...patch })} />
      </Dialog>
    </>
  );
}
