"use client";

import Link from "next/link";

import { UserTable } from "@/components/UserTable";
import { Card, DataState } from "@/components/ui";
import { fetchProfiles, fetchStats } from "@/lib/admin-api";
import { useAsync } from "@/lib/use-async";

const kpis = [
  { key: "total_users", label: "Total users" },
  { key: "active_subscribers", label: "Active subscribers" },
  { key: "pending_approvals", label: "Pending approvals" },
  { key: "expiring_soon", label: "Expiring in 30 days" },
] as const;

export function DashboardPage() {
  const stats = useAsync(fetchStats, "stats");
  const pending = useAsync(
    () => fetchProfiles({ statuses: ["pending_approval"], pageSize: 5 }),
    "pending",
  );
  const expiring = useAsync(
    () =>
      fetchProfiles({
        statuses: ["active"],
        pageSize: 5,
        orderBy: "expires_at",
        ascending: true,
      }),
    "expiring",
  );

  const reloadAll = () => {
    stats.reload();
    pending.reload();
    expiring.reload();
  };

  return (
    <div className="space-y-6">
      <header>
        <h1 className="text-2xl font-bold md:text-3xl">Admin dashboard</h1>
        <p className="text-text-muted">Manage users, approvals and subscriptions</p>
      </header>

      <div className="grid grid-cols-2 gap-4 xl:grid-cols-4">
        {kpis.map((kpi) => (
          <div key={kpi.key} className="rounded-2xl border border-border bg-surface p-5">
            <p className="text-sm text-text-muted">{kpi.label}</p>
            <p className="mt-1 text-3xl font-bold">
              {stats.data ? stats.data[kpi.key].toLocaleString("en") : "—"}
            </p>
          </div>
        ))}
      </div>
      {stats.error && (
        <p role="alert" className="text-sm text-danger">
          Couldn&apos;t load the numbers: {stats.error}
        </p>
      )}

      <Card
        title="Pending approvals"
        action={
          <Link href="/approvals" className="text-sm font-medium text-primary">
            View all
          </Link>
        }
      >
        <DataState
          loading={pending.loading}
          error={pending.error}
          empty={pending.data?.rows.length === 0}
          emptyText="No one is waiting for approval."
          onRetry={pending.reload}
        />
        {!!pending.data?.rows.length && (
          <UserTable users={pending.data.rows} onChanged={reloadAll} />
        )}
      </Card>

      <Card
        title="Next to expire"
        action={
          <Link href="/users" className="text-sm font-medium text-primary">
            View all users
          </Link>
        }
      >
        <DataState
          loading={expiring.loading}
          error={expiring.error}
          empty={expiring.data?.rows.length === 0}
          emptyText="No active subscribers yet."
          onRetry={expiring.reload}
        />
        {!!expiring.data?.rows.length && (
          <UserTable users={expiring.data.rows} onChanged={reloadAll} />
        )}
      </Card>
    </div>
  );
}
