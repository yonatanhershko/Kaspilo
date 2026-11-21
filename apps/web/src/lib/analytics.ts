import type { AnalyticsDay, AnalyticsReport } from "@kaspilo/shared";

import { supabase } from "@/lib/supabase";

/** Product analytics for the admin (docs/spec.md "Analytics"). Days are Israel time. */

export type Range =
  | { kind: "last"; days: 7 | 30 | 90 }
  | { kind: "month"; month: string } // YYYY-MM
  | { kind: "year"; year: number };

const israelDay = new Intl.DateTimeFormat("en-CA", { timeZone: "Asia/Jerusalem" });

/** Today in Israel, as YYYY-MM-DD. */
export function israelToday(): string {
  return israelDay.format(new Date());
}

function addDays(day: string, n: number): string {
  const d = new Date(`${day}T00:00:00Z`);
  d.setUTCDate(d.getUTCDate() + n);
  return d.toISOString().slice(0, 10);
}

export function rangeDates(range: Range): { from: string; to: string } {
  const today = israelToday();
  if (range.kind === "last") return { from: addDays(today, -(range.days - 1)), to: today };
  if (range.kind === "month") {
    const [y, m] = range.month.split("-").map(Number);
    const last = new Date(Date.UTC(y, m, 0)).getUTCDate();
    return { from: `${range.month}-01`, to: `${range.month}-${String(last).padStart(2, "0")}` };
  }
  return { from: `${range.year}-01-01`, to: `${range.year}-12-31` };
}

export function rangeKey(range: Range): string {
  return range.kind === "last" ? `last-${range.days}` : range.kind === "month" ? range.month : String(range.year);
}

export async function fetchAnalytics(range: Range): Promise<AnalyticsReport> {
  const { from, to } = rangeDates(range);
  const { data, error } = await supabase.rpc("admin_analytics", { p_from: from, p_to: to });
  if (error) throw new Error(error.message);
  return data;
}

export type Point = { label: string; dau: number; new_users: number; returning_users: number };

const shortDay = new Intl.DateTimeFormat("en-GB", { day: "numeric", month: "short", timeZone: "UTC" });
const shortMonth = new Intl.DateTimeFormat("en-GB", { month: "short", timeZone: "UTC" });

/**
 * Chart points: one per day, or for a year one per month holding the average per day
 * (a sum of daily active users would count the same person many times).
 */
export function chartPoints(days: AnalyticsDay[], range: Range): Point[] {
  if (range.kind !== "year") {
    return days.map((d) => ({
      label: shortDay.format(new Date(`${d.day}T00:00:00Z`)),
      dau: d.dau,
      new_users: d.new_users,
      returning_users: d.returning_users,
    }));
  }
  const months = new Map<string, AnalyticsDay[]>();
  for (const d of days) {
    const key = d.day.slice(0, 7);
    months.set(key, [...(months.get(key) ?? []), d]);
  }
  const avg = (list: AnalyticsDay[], pick: (d: AnalyticsDay) => number) =>
    Math.round(list.reduce((sum, d) => sum + pick(d), 0) / list.length);
  return [...months.entries()].map(([key, list]) => ({
    label: shortMonth.format(new Date(`${key}-01T00:00:00Z`)),
    dau: avg(list, (d) => d.dau),
    new_users: avg(list, (d) => d.new_users),
    returning_users: avg(list, (d) => d.returning_users),
  }));
}

export const funnelSteps = [
  { key: "first_opens", label: "First open" },
  { key: "signups_started", label: "Sign-up started" },
  { key: "signups_completed", label: "Sign-up completed" },
  { key: "approved", label: "Approved" },
  { key: "first_entries", label: "First app entry" },
] as const;

export function funnel(days: AnalyticsDay[]) {
  return funnelSteps.map((step) => ({
    ...step,
    count: days.reduce((sum, d) => sum + d[step.key], 0),
  }));
}

/** Share as a whole percent, or null when there is nothing to divide by. */
export function percent(part: number, whole: number): number | null {
  return whole > 0 ? Math.round((part * 100) / whole) : null;
}

const csvColumns: (keyof AnalyticsDay)[] = [
  "day",
  "dau",
  "wau",
  "mau",
  "dau_ios",
  "dau_android",
  "new_users",
  "returning_users",
  "first_opens",
  "signups_started",
  "signups_completed",
  "approved",
  "first_entries",
];

/** The daily numbers as CSV. Counts only, no user ids. */
export function toCsv(days: AnalyticsDay[]): string {
  const lines = [csvColumns.join(",")];
  for (const d of days) lines.push(csvColumns.map((c) => String(d[c])).join(","));
  return `${lines.join("\n")}\n`;
}

export function downloadCsv(days: AnalyticsDay[], range: Range) {
  const blob = new Blob([toCsv(days)], { type: "text/csv;charset=utf-8" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = `kaspilo-analytics-${rangeKey(range)}.csv`;
  a.click();
  URL.revokeObjectURL(url);
}
