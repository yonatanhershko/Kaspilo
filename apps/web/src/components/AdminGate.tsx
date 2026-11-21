"use client";

import { useRouter } from "next/navigation";
import { type ReactNode, useEffect } from "react";

import { useAdminAuth } from "@/auth/AdminAuth";
import { AdminShell } from "@/components/AdminShell";
import { fetchStats } from "@/lib/admin-api";
import { useAsync } from "@/lib/use-async";

/** Admin area. Only an admin gets past here; the database enforces it as well. */
export function AdminGate({ children }: { children: ReactNode }) {
  const router = useRouter();
  const { state } = useAdminAuth();

  useEffect(() => {
    if (state.status === "signedOut" || state.status === "notAdmin") {
      router.replace("/login");
    }
  }, [state.status, router]);

  if (state.status !== "ready") {
    return (
      <div className="flex min-h-screen items-center justify-center bg-background text-sm text-text-muted">
        Loading…
      </div>
    );
  }
  return <ReadyShell>{children}</ReadyShell>;
}

function ReadyShell({ children }: { children: ReactNode }) {
  const stats = useAsync(fetchStats, "stats");
  return (
    <AdminShell pendingCount={stats.data?.pending_approvals ?? null}>
      {children}
    </AdminShell>
  );
}
