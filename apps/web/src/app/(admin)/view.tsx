"use client";

import Link from "next/link";

import { UserTable } from "@/components/UserTable";
import { Card, DataState } from "@/components/ui";
import { fetchStats, fetchUsers } from "@/lib/admin-api";
import { useAsync } from "@/lib/use-async";

/** docs/spec.md "Admin web": KPIs. */
const kpis = [
  { key: "total_users", label: "Total users" },
  { key: "paying", label: "Paying (store)" },
  { key: "in_trial", label: "In trial" },
  { key: "admin_access", label: "Admin access" },
  { key: "without_access", label: "Without access" },
  { key: "expiring_soon", label: "Ending in 7 days" },
] as const;

export function DashboardPage() {
  const stats = useAsync(fetchStats, "stats");
  const without = useAsync(() => fetchUsers({ filter: "without_access", pageSize: 5 }), "without");
  const ending = useAsync(() => fetchUsers({ filter: "ending", pageSize: 5 }), "ending");

  const reloadAll = () => {
    stats.reload();
    without.reload();
    ending.reload();
  };

  return (
    <div className="space-y-6">
      <header>
        <h1 className="text-2xl font-bold md:text-3xl">Admin dashboard</h1>
        <p className="text-text-muted">Users, subscriptions and admin access</p>
      </header>

      <div className="grid grid-cols-2 gap-4 md:grid-cols-3 xl:grid-cols-6">
        {kpis.map((kpi) => (
          <div key={kpi.key} className="rounded-2xl border border-border bg-surface p-5">
            <p className="text-sm text-text-muted">{kpi.label}</p>
            <p className="mt-1 text-3xl font-bold">{stats.data ? stats.data[kpi.key].toLocaleString("en") : "—"}</p>
          </div>
        ))}
      </div>
      {!!stats.data?.billing_issue && (
        <p className="text-sm">
          <span className="font-medium text-danger">{stats.data.billing_issue}</span> paying{" "}
          {stats.data.billing_issue === 1 ? "user has" : "users have"} a billing problem (the store is retrying).
        </p>
      )}
      {stats.error && (
        <p role="alert" className="text-sm text-danger">
          Couldn&apos;t load the numbers: {stats.error}
        </p>
      )}

      <Card
        title="Without access"
        action={
          <Link href="/without-access" className="text-sm font-medium text-primary">
            View all
          </Link>
        }
      >
        <DataState
          loading={without.loading}
          error={without.error}
          empty={without.data?.rows.length === 0}
          emptyText="Everyone has access."
          onRetry={without.reload}
        />
        {!!without.data?.rows.length && <UserTable users={without.data.rows} onChanged={reloadAll} />}
      </Card>

      <Card
        title="Ending in 7 days"
        action={
          <Link href="/users" className="text-sm font-medium text-primary">
            View all users
          </Link>
        }
      >
        <DataState
          loading={ending.loading}
          error={ending.error}
          empty={ending.data?.rows.length === 0}
          emptyText="No access ends in the next 7 days."
          onRetry={ending.reload}
        />
        {!!ending.data?.rows.length && <UserTable users={ending.data.rows} onChanged={reloadAll} />}
      </Card>
    </div>
  );
}
