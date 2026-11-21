/**
 * Budget periods. Calendar math is done by date-fns, never by hand.
 * Dates are plain calendar dates as "YYYY-MM-DD" strings: no time, no time zone.
 *
 * A budget month starts on the user's `startDay` (1-31). In a month that is
 * shorter than `startDay`, it starts on that month's last day
 * (start day 31 -> 28 or 29 Feb, 30 Apr, ...).
 */
// One module per function: the `date-fns` index pulls in the whole library.
import { addMonths } from 'date-fns/addMonths';
import { addWeeks } from 'date-fns/addWeeks';
import { addYears } from 'date-fns/addYears';
import { format } from 'date-fns/format';
import { getDaysInMonth } from 'date-fns/getDaysInMonth';
import { parse } from 'date-fns/parse';
import { setDate } from 'date-fns/setDate';
import { startOfMonth } from 'date-fns/startOfMonth';
import { subDays } from 'date-fns/subDays';

export type ISODate = string;
export type Period = { start: ISODate; end: ISODate };
export type Frequency = 'weekly' | 'monthly' | 'yearly';

const ISO = 'yyyy-MM-dd';

export const toISODate = (date: Date): ISODate => format(date, ISO);
export const fromISODate = (iso: ISODate): Date => parse(iso, ISO, new Date(2000, 0, 1));

export function todayISO(now: Date = new Date()): ISODate {
  return toISODate(now);
}

export function isValidStartDay(day: number): boolean {
  return Number.isInteger(day) && day >= 1 && day <= 31;
}

/** The start date of the period that begins in `monthStart`'s month. */
function periodStartInMonth(monthStart: Date, startDay: number): Date {
  return setDate(monthStart, Math.min(startDay, getDaysInMonth(monthStart)));
}

/** The budget month that contains `date`. */
export function periodFor(date: ISODate, startDay: number): Period {
  if (!isValidStartDay(startDay)) throw new Error('startDay must be 1-31');
  const day = fromISODate(date);
  const thisMonth = startOfMonth(day);
  let start = periodStartInMonth(thisMonth, startDay);
  if (day < start) start = periodStartInMonth(addMonths(thisMonth, -1), startDay);
  const nextStart = periodStartInMonth(addMonths(startOfMonth(start), 1), startDay);
  return { start: toISODate(start), end: toISODate(subDays(nextStart, 1)) };
}

/** The period `offset` budget months after (or before) `period`. */
export function shiftPeriod(period: Period, offset: number, startDay: number): Period {
  const month = addMonths(startOfMonth(fromISODate(period.start)), offset);
  const start = periodStartInMonth(month, startDay);
  const nextStart = periodStartInMonth(addMonths(month, 1), startDay);
  return { start: toISODate(start), end: toISODate(subDays(nextStart, 1)) };
}

/** Calendar year, 1 January to 31 December. */
export function yearPeriod(year: number): Period {
  return { start: `${year}-01-01`, end: `${year}-12-31` };
}

export function yearOf(date: ISODate): number {
  return fromISODate(date).getFullYear();
}

export function isInPeriod(date: ISODate, period: Period): boolean {
  return date >= period.start && date <= period.end;
}

/**
 * The n-th occurrence (0-based) of a repeating date. Always computed from the
 * first date, so a rule that starts on the 31st stays on month ends
 * (31 Jan, 28 Feb, 31 Mar) instead of drifting to the 28th.
 */
export function occurrenceDate(first: ISODate, frequency: Frequency, n: number): ISODate {
  const start = fromISODate(first);
  const date =
    frequency === 'weekly' ? addWeeks(start, n) : frequency === 'monthly' ? addMonths(start, n) : addYears(start, n);
  return toISODate(date);
}
