import { fromISODate, type ISODate, toISODate, todayISO } from '@kaspilo/shared';
import { addMonths } from 'date-fns/addMonths';
import { getDay } from 'date-fns/getDay';
import { getDaysInMonth } from 'date-fns/getDaysInMonth';
import { startOfMonth } from 'date-fns/startOfMonth';
import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Modal, Pressable, View } from 'react-native';

import { useDateFormat } from '@/data/hooks';
import { useLanguage } from '@/i18n';

import { AppText } from './AppText';
import { Button } from './Button';
import { Icon } from './Icon';
import { PressScale } from './PressScale';

/** Month-grid date picker in the app's own style. Calendar math by date-fns. */
export function DatePicker({
  visible,
  value,
  onPick,
  onClose,
}: {
  visible: boolean;
  value: ISODate;
  onPick: (date: ISODate) => void;
  onClose: () => void;
}) {
  const { t } = useTranslation();
  const language = useLanguage();
  const { monthYear } = useDateFormat();
  const [month, setMonth] = useState(() => startOfMonth(fromISODate(value)));

  const today = todayISO();
  const leading = getDay(month); // Sunday-first, as used in Israel
  const days = getDaysInMonth(month);
  const cells: (number | null)[] = [
    ...Array<null>(leading).fill(null),
    ...Array.from({ length: days }, (_, i) => i + 1),
  ];
  while (cells.length % 7 !== 0) cells.push(null);

  const weekdayFormat = new Intl.DateTimeFormat(language === 'he' ? 'he-IL' : 'en-GB', {
    weekday: 'narrow',
    timeZone: 'UTC',
  });
  // 2023-01-01 was a Sunday
  const weekdays = Array.from({ length: 7 }, (_, i) => weekdayFormat.format(new Date(Date.UTC(2023, 0, 1 + i))));

  const isoOf = (day: number) => toISODate(new Date(month.getFullYear(), month.getMonth(), day));

  return (
    <Modal visible={visible} transparent animationType="fade" onRequestClose={onClose}>
      <Pressable className="flex-1 items-center justify-center bg-black/40 px-6" onPress={onClose}>
        <Pressable
          className="w-full max-w-[380px] rounded-xl bg-background p-4"
          onPress={(e) => e.stopPropagation()}
          accessibilityViewIsModal>
          <View className="mb-2 flex-row items-center justify-between">
            <PressScale
              accessibilityRole="button"
              accessibilityLabel={t('common.previous')}
              className="h-11 w-11 items-center justify-center"
              onPress={() => setMonth(addMonths(month, -1))}>
              <Icon name="chevron-left" />
            </PressScale>
            <AppText weight="medium" className="text-[16px]">
              {monthYear(toISODate(month))}
            </AppText>
            <PressScale
              accessibilityRole="button"
              accessibilityLabel={t('common.nextItem')}
              className="h-11 w-11 items-center justify-center"
              onPress={() => setMonth(addMonths(month, 1))}>
              <Icon name="chevron-right" />
            </PressScale>
          </View>

          <View className="flex-row">
            {weekdays.map((d, i) => (
              <View key={i} className="flex-1 items-center py-1">
                <AppText tone="muted" className="text-[12px]">
                  {d}
                </AppText>
              </View>
            ))}
          </View>
          <View className="flex-row flex-wrap">
            {cells.map((day, i) => {
              if (day === null) return <View key={i} style={{ width: `${100 / 7}%`, height: 44 }} />;
              const iso = isoOf(day);
              const selected = iso === value;
              return (
                <PressScale
                  key={i}
                  accessibilityRole="button"
                  accessibilityState={{ selected }}
                  accessibilityLabel={iso}
                  style={{ width: `${100 / 7}%`, height: 44 }}
                  className="items-center justify-center"
                  onPress={() => {
                    onPick(iso);
                    onClose();
                  }}>
                  <View
                    className={`h-9 w-9 items-center justify-center rounded-full ${
                      selected ? 'bg-primary' : iso === today ? 'border border-primary' : ''
                    }`}>
                    <AppText
                      weight={selected ? 'bold' : 'regular'}
                      tone={selected ? 'onPrimary' : 'text'}
                      className="text-[15px]">
                      {day}
                    </AppText>
                  </View>
                </PressScale>
              );
            })}
          </View>

          <View className="mt-2 flex-row gap-2">
            <Button
              label={t('common.today')}
              variant="outline"
              className="flex-1"
              onPress={() => {
                onPick(today);
                onClose();
              }}
            />
            <Button label={t('common.close')} variant="outline" className="flex-1" onPress={onClose} />
          </View>
        </Pressable>
      </Pressable>
    </Modal>
  );
}
