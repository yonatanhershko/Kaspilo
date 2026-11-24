"use client";

import type { AnalyticsDay, PlatformSplit, RetentionCohort, SubscriptionReport } from "@kaspilo/shared";
import { useEffect, useState } from "react";
import {
  Area,
  AreaChart,
  Bar,
  BarChart,
  CartesianGrid,
  Legend,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";

import { Button, Card, DataState } from "@/components/ui";
import {
  chartPoints,
  downloadCsv,
  fetchAnalytics,
  funnel,
  israelToday,
  percent,
  type Range,
  rangeDates,
  rangeKey,
} from "@/lib/analytics";
import { fetchSubscriptionReport } from "@/lib/admin-api";
import { formatDate } from "@/lib/format";
import { useAsync } from "@/lib/use-async";

const FIRST_YEAR = 2026;

/**
 * Chart colors from the theme tokens. SVG attributes cannot read CSS variables,
 * so the values are read once on the page (and again if the theme changes).
 */
function useChartColors() {
  const read = () => {
    const css = typeof window === "undefined" ? null : getComputedStyle(document.documentElement);
    const v = (name: string) => css?.getPropertyValue(name).trim() || "currentColor";
    return {
      primary: v("--kaspilo-primary"),
      accent: v("--kaspilo-accent"),
      muted: v("--kaspilo-text-muted"),
      border: v("--kaspilo-border"),
      surfaceMuted: v("--kaspilo-surface-muted"),
    };
  };
  const [colors, setColors] = useState(read);
  useEffect(() => {
    const media = window.matchMedia("(prefers-color-scheme: dark)");
    const update = () => setColors(read());
    const observer = new MutationObserver(update);
    observer.observe(document.documentElement, { attributes: true, attributeFilter: ["style", "class", "data-theme"] });
    media.addEventListener("change", update);
    return () => {
      observer.disconnect();
      media.removeEventListener("change", update);
    };
  }, []);
  return colors;
}

type ChartColors = ReturnType<typeof useChartColors>;

const axis = (c: ChartColors) => ({ fontSize: 11, fill: c.muted });
const tooltip = {
  contentStyle: {
    background: "var(--kaspilo-surface)",
    border: "1px solid var(--kaspilo-border)",
    borderRadius: 10,
    fontSize: 12,
    color: "var(--kaspilo-text)",
  },
  labelStyle: { color: "var(--kaspilo-text)", fontWeight: 500 },
};

/** Growth, use and engagement. Never money (docs/spec.md "Analytics"). */
export function AnalyticsPage() {
  const [range, setRange] = useState<Range>({ kind: "last", days: 30 });
  const report = useAsync(() => fetchAnalytics(range), rangeKey(range));
  const subs = useAsync(() => {
    const { from, to } = rangeDates(range);
    return fetchSubscriptionReport(from, to);
  }, `subs-${rangeKey(range)}`);
  const data = report.data;
  const last = data?.days.at(-1);

  return (
    <div className="space-y-6">
      <header className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="text-2xl font-bold md:text-3xl">Analytics</h1>
          <p className="text-text-muted">Growth, use and engagement. Israel time.</p>
        </div>
        <Button
          variant="ghost"
          className="h-11"
          disabled={!data?.days.length}
          onClick={() => data && downloadCsv(data.days, range)}
        >
          Download CSV
        </Button>
      </header>

      <RangePicker range={range} onChange={setRange} />

      <DataState
        loading={report.loading && !data}
        error={report.error}
        empty={false}
        emptyText=""
        onRetry={report.reload}
      />

      {data && last && (
        <>
          <div className="grid grid-cols-2 gap-3 md:gap-4 xl:grid-cols-4">
            <Kpi label="DAU" value={last.dau} />
            <Kpi label="WAU" value={last.wau} />
            <Kpi label="MAU" value={last.mau} />
            <Kpi label="DAU / MAU" value={last.mau ? `${percent(last.dau, last.mau)}%` : "—"} />
          </div>
          <p className="-mt-3 text-xs text-text-muted">
            {last.day === israelToday() ? "Today so far" : `On ${formatDate(last.day)}`}
          </p>

          <div className="grid gap-6 lg:grid-cols-2">
            <Card title="Daily active users">
              {range.kind === "year" && <YearNote />}
              <DauChart days={data.days} range={range} />
            </Card>
            <Card title="New vs returning">
              {range.kind === "year" && <YearNote />}
              <NewReturningChart days={data.days} range={range} />
            </Card>
            <Card title="Funnel">
              <Funnel days={data.days} />
            </Card>
            <Card title="Platform">
              <Platforms split={data.platforms} />
            </Card>
            <Card title="Signed up, never started">
              <p className="text-4xl font-bold">{data.not_started}</p>
              <p className="mt-2 text-sm text-text-muted">
                Users with access who added no transaction in the 7 days after their first entry. All
                time, not only this range.
              </p>
            </Card>
          </div>

          <Card title="Subscriptions">
            <DataState
              loading={subs.loading && !subs.data}
              error={subs.error}
              empty={false}
              emptyText=""
              onRetry={subs.reload}
            />
            {subs.data && <Subscriptions report={subs.data} />}
          </Card>

          <Card title="Retention by weekly cohort">
            <Retention cohorts={data.retention} />
          </Card>
        </>
      )}
    </div>
  );
}

function Kpi({ label, value }: { label: string; value: number | string }) {
  return (
    <div className="rounded-2xl border border-border bg-surface p-4 md:p-5">
      <p className="text-sm text-text-muted">{label}</p>
      <p className="mt-1 text-2xl font-bold md:text-3xl">
        {typeof value === "number" ? value.toLocaleString("en") : value}
      </p>
    </div>
  );
}

function YearNote() {
  return <p className="mb-2 text-xs text-text-muted">Monthly average per day</p>;
}

const presets = [7, 30, 90] as const;
const monthName = new Intl.DateTimeFormat("en-GB", { month: "long", year: "numeric", timeZone: "UTC" });

function RangePicker({ range, onChange }: { range: Range; onChange: (r: Range) => void }) {
  const today = israelToday();
  const thisYear = Number(today.slice(0, 4));
  const years = Array.from({ length: thisYear - FIRST_YEAR + 1 }, (_, i) => thisYear - i);
  // Every month from the first year until this one, newest first.
  const months: string[] = [];
  for (let y = thisYear; y >= FIRST_YEAR; y--) {
    const lastMonth = y === thisYear ? Number(today.slice(5, 7)) : 12;
    for (let m = lastMonth; m >= 1; m--) months.push(`${y}-${String(m).padStart(2, "0")}`);
  }
  const chip = (on: boolean) =>
    `inline-flex h-11 items-center rounded-full border px-4 text-sm font-medium transition ${
      on ? "border-primary bg-primary text-on-primary" : "border-border bg-surface hover:bg-surface-muted"
    }`;

  return (
    <div className="flex flex-wrap items-center gap-2" role="group" aria-label="Date range">
      {presets.map((days) => (
        <button
          key={days}
          type="button"
          aria-pressed={range.kind === "last" && range.days === days}
          className={chip(range.kind === "last" && range.days === days)}
          onClick={() => onChange({ kind: "last", days })}
        >
          {days} days
        </button>
      ))}
      <label className={chip(range.kind === "month")}>
        <span className="sr-only">Month</span>
        <select
          value={range.kind === "month" ? range.month : ""}
          onChange={(e) => e.target.value && onChange({ kind: "month", month: e.target.value })}
          className="bg-transparent text-sm outline-none"
        >
          <option value="">Month</option>
          {months.map((m) => (
            <option key={m} value={m}>
              {monthName.format(new Date(`${m}-01T00:00:00Z`))}
            </option>
          ))}
        </select>
      </label>
      <label className={chip(range.kind === "year")}>
        <span className="sr-only">Year</span>
        <select
          value={range.kind === "year" ? String(range.year) : ""}
          onChange={(e) => e.target.value && onChange({ kind: "year", year: Number(e.target.value) })}
          className="bg-transparent text-sm outline-none"
        >
          <option value="">Year</option>
          {years.map((y) => (
            <option key={y} value={y}>
              {y}
            </option>
          ))}
        </select>
      </label>
    </div>
  );
}

function DauChart({ days, range }: { days: AnalyticsDay[]; range: Range }) {
  const c = useChartColors();
  const points = chartPoints(days, range);
  return (
    <div className="h-56" role="img" aria-label="Daily active users over the chosen range">
      <ResponsiveContainer width="100%" height="100%">
        <AreaChart data={points} margin={{ top: 8, right: 8, left: -20, bottom: 0 }}>
          <CartesianGrid stroke={c.border} vertical={false} />
          <XAxis dataKey="label" tick={axis(c)} tickLine={false} axisLine={false} minTickGap={16} />
          <YAxis allowDecimals={false} tick={axis(c)} tickLine={false} axisLine={false} />
          <Tooltip {...tooltip} />
          <Area
            type="monotone"
            dataKey="dau"
            name="Active users"
            stroke={c.primary}
            strokeWidth={2}
            fill={c.primary}
            fillOpacity={0.12}
          />
        </AreaChart>
      </ResponsiveContainer>
    </div>
  );
}

function NewReturningChart({ days, range }: { days: AnalyticsDay[]; range: Range }) {
  const c = useChartColors();
  const points = chartPoints(days, range);
  return (
    <div className="h-56" role="img" aria-label="New and returning users per day">
      <ResponsiveContainer width="100%" height="100%">
        <BarChart data={points} margin={{ top: 8, right: 8, left: -20, bottom: 0 }}>
          <CartesianGrid stroke={c.border} vertical={false} />
          <XAxis dataKey="label" tick={axis(c)} tickLine={false} axisLine={false} minTickGap={16} />
          <YAxis allowDecimals={false} tick={axis(c)} tickLine={false} axisLine={false} />
          <Tooltip {...tooltip} cursor={{ fill: c.surfaceMuted }} />
          <Legend iconType="square" iconSize={10} wrapperStyle={{ fontSize: 12 }} />
          <Bar dataKey="returning_users" name="Returning" stackId="u" fill={c.primary} maxBarSize={24} />
          <Bar
            dataKey="new_users"
            name="New"
            stackId="u"
            fill={c.accent}
            radius={[4, 4, 0, 0]}
            maxBarSize={24}
          />
        </BarChart>
      </ResponsiveContainer>
    </div>
  );
}

function Funnel({ days }: { days: AnalyticsDay[] }) {
  const steps = funnel(days);
  const top = steps[0].count;
  return (
    <ol className="space-y-3">
      {steps.map((step, i) => {
        const width = percent(step.count, Math.max(top, ...steps.map((s) => s.count))) ?? 0;
        const drop = i > 0 ? percent(steps[i - 1].count - step.count, steps[i - 1].count) : null;
        return (
          <li key={step.key}>
            <div className="flex items-baseline justify-between gap-2 text-sm">
              <span>{step.label}</span>
              <span className="tabular-nums">
                <span className="font-semibold">{step.count}</span>
                {drop !== null && drop > 0 && <span className="ms-2 text-text-muted">−{drop}%</span>}
              </span>
            </div>
            <div className="mt-1 h-2.5 rounded-full bg-surface-muted">
              <div className="h-2.5 rounded-full bg-primary" style={{ width: `${width}%` }} />
            </div>
          </li>
        );
      })}
    </ol>
  );
}

function Platforms({ split }: { split: PlatformSplit }) {
  const rows = [
    { label: "Active users", ios: split.active_ios, android: split.active_android },
    { label: "First opens", ios: split.first_open_ios, android: split.first_open_android },
  ];
  return (
    <div className="space-y-5">
      {rows.map((row) => {
        const total = row.ios + row.android;
        const iosShare = percent(row.ios, total);
        return (
          <div key={row.label}>
            <div className="flex items-baseline justify-between gap-2 text-sm">
              <span>{row.label}</span>
              <span className="text-text-muted">{total} in this range</span>
            </div>
            <div
              className="mt-1.5 flex h-2.5 overflow-hidden rounded-full bg-surface-muted"
              role="img"
              aria-label={`${row.label}: iPhone ${row.ios}, Android ${row.android}`}
            >
              {total > 0 && (
                <>
                  <div className="bg-primary" style={{ width: `${iosShare}%` }} />
                  <div className="bg-accent" style={{ width: `${100 - (iosShare ?? 0)}%` }} />
                </>
              )}
            </div>
            <div className="mt-1.5 flex justify-between text-sm tabular-nums">
              <span className="inline-flex items-center gap-1.5">
                <span className="h-2.5 w-2.5 rounded-sm bg-primary" aria-hidden="true" />
                iPhone <span className="font-semibold">{row.ios}</span>
                {iosShare !== null && <span className="text-text-muted">({iosShare}%)</span>}
              </span>
              <span className="inline-flex items-center gap-1.5">
                <span className="h-2.5 w-2.5 rounded-sm bg-accent" aria-hidden="true" />
                Android <span className="font-semibold">{row.android}</span>
                {iosShare !== null && <span className="text-text-muted">({100 - iosShare}%)</span>}
              </span>
            </div>
          </div>
        );
      })}
    </div>
  );
}

function Retention({ cohorts }: { cohorts: RetentionCohort[] }) {
  if (cohorts.length === 0) {
    return <p className="text-sm text-text-muted">No one had a first app entry in this range yet.</p>;
  }
  const cell = (n: number, of: number) => {
    const p = percent(n, of);
    if (p === null) return <span className="text-text-muted">—</span>;
    return (
      <>
        <span className="font-semibold">{p}%</span>
        <span className="block text-xs text-text-muted">
          {n} of {of}
        </span>
      </>
    );
  };
  return (
    <div className="-mx-5 overflow-x-auto px-5">
      <table className="w-full min-w-[420px] text-sm">
        <thead>
          <tr className="border-b border-border text-start text-text-muted">
            <th className="py-2 text-start font-medium">Week of</th>
            <th className="py-2 text-center font-medium">Users</th>
            <th className="py-2 text-center font-medium">D1</th>
            <th className="py-2 text-center font-medium">D7</th>
            <th className="py-2 text-center font-medium">D30</th>
          </tr>
        </thead>
        <tbody>
          {cohorts.map((c) => (
            <tr key={c.week} className="border-b border-border last:border-0">
              <td className="py-2">{formatDate(c.week)}</td>
              <td className="py-2 text-center tabular-nums">{c.users}</td>
              <td className="py-2 text-center tabular-nums">{cell(c.d1, c.d1_eligible)}</td>
              <td className="py-2 text-center tabular-nums">{cell(c.d7, c.d7_eligible)}</td>
              <td className="py-2 text-center tabular-nums">{cell(c.d30, c.d30_eligible)}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

/**
 * docs/spec.md "Analytics" → Subscriptions: who pays now, trial → paid in the range,
 * cancellations and refunds per month. Counts only; revenue lives in RevenueCat.
 */
function Subscriptions({ report }: { report: SubscriptionReport }) {
  const n = report.now;
  const cards: [string, number][] = [
    ["Paying monthly", n.paying_monthly],
    ["Paying yearly", n.paying_yearly],
    ["In trial", n.in_trial],
    ["Billing problem", n.billing_issue],
    ["Admin: manual payment", n.admin_paid],
    ["Admin: gift", n.admin_vip],
    ["Admin: family", n.admin_family],
    ["Signed up, no access", n.without_access],
  ];
  const rate = percent(report.trials.converted, report.trials.ended);
  return (
    <div className="space-y-5">
      <div className="grid grid-cols-2 gap-3 md:grid-cols-4">
        {cards.map(([label, value]) => (
          <div key={label} className="rounded-xl border border-border p-3">
            <p className="text-xs text-text-muted">{label}</p>
            <p className="mt-1 text-2xl font-bold">{value.toLocaleString("en")}</p>
          </div>
        ))}
      </div>
      <p className="text-xs text-text-muted">Right now, not only this range.</p>
      <div>
        <p className="text-sm font-medium">Trial → paid</p>
        <p className="text-sm">
          {report.trials.ended === 0
            ? "No trial ended in this range."
            : `${rate}% (${report.trials.converted} of ${report.trials.ended} trials that ended in this range)`}
        </p>
      </div>
      <div>
        <p className="text-sm font-medium">Cancellations and refunds</p>
        {report.months.length === 0 ? (
          <p className="text-sm text-text-muted">None in this range.</p>
        ) : (
          <table className="mt-1 text-sm">
            <thead>
              <tr className="text-xs text-text-muted">
                <th className="pr-6 text-left font-medium">Month</th>
                <th className="pr-6 text-right font-medium">Cancelled</th>
                <th className="text-right font-medium">Refunded</th>
              </tr>
            </thead>
            <tbody>
              {report.months.map((m) => (
                <tr key={m.month}>
                  <td className="pr-6">{m.month}</td>
                  <td className="pr-6 text-right">{m.cancelled}</td>
                  <td className="text-right">{m.refunded}</td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>
      <p className="text-xs text-text-muted">Revenue is in the RevenueCat and store dashboards.</p>
    </div>
  );
}
