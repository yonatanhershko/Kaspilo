import type { AccessPlan, AccountStatus } from "@kaspilo/shared";
import type { ButtonHTMLAttributes, ReactNode } from "react";

import { planShort, statusLabel } from "@/lib/format";

const buttonStyles = {
  primary: "bg-primary text-on-primary hover:opacity-90",
  danger: "border border-danger text-danger hover:bg-danger-surface",
  ghost: "border border-border text-text hover:bg-surface-muted",
} as const;

export function Button({
  variant = "primary",
  className = "",
  ...props
}: ButtonHTMLAttributes<HTMLButtonElement> & {
  variant?: keyof typeof buttonStyles;
}) {
  return (
    <button
      type="button"
      className={`inline-flex h-11 items-center justify-center rounded-lg px-3.5 md:h-9 text-sm font-medium transition disabled:cursor-not-allowed disabled:opacity-50 ${buttonStyles[variant]} ${className}`}
      {...props}
    />
  );
}

const statusStyles: Record<AccountStatus, string> = {
  active: "bg-success",
  pending_approval: "bg-accent",
  expired: "bg-text-muted",
  rejected: "bg-danger",
};

export function StatusBadge({ status }: { status: AccountStatus }) {
  return (
    <span className="inline-flex items-center gap-2 text-sm">
      <span className={`h-2 w-2 rounded-full ${statusStyles[status]}`} />
      {statusLabel[status]}
    </span>
  );
}

export function PlanBadge({ plan }: { plan: AccessPlan | null }) {
  if (!plan) return <span className="text-sm text-text-muted">—</span>;
  return (
    <span className="rounded-md bg-surface-muted px-2 py-0.5 text-xs font-medium">
      {planShort[plan]}
    </span>
  );
}

export function Card({
  title,
  action,
  children,
}: {
  title?: string;
  action?: ReactNode;
  children: ReactNode;
}) {
  return (
    <section className="rounded-2xl border border-border bg-surface">
      {(title || action) && (
        <header className="flex items-center justify-between px-5 pt-4">
          <h2 className="text-lg font-semibold">{title}</h2>
          {action}
        </header>
      )}
      <div className="p-5 pt-3">{children}</div>
    </section>
  );
}

/** Loading, error and empty states for a table or list. */
export function DataState({
  loading,
  error,
  empty,
  emptyText,
  onRetry,
}: {
  loading: boolean;
  error: string | null;
  empty: boolean;
  emptyText: string;
  onRetry: () => void;
}) {
  if (loading)
    return <p className="py-8 text-center text-sm text-text-muted">Loading…</p>;
  if (error)
    return (
      <div className="flex flex-col items-center gap-3 py-8" role="alert">
        <p className="text-sm text-danger">Couldn&apos;t load: {error}</p>
        <Button variant="ghost" onClick={onRetry}>
          Try again
        </Button>
      </div>
    );
  if (empty)
    return (
      <p className="py-8 text-center text-sm text-text-muted">{emptyText}</p>
    );
  return null;
}
