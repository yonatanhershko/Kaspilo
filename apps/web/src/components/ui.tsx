import type { ButtonHTMLAttributes, ReactNode } from "react";

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

/** The user signed in with Apple and hid their email: the address only forwards mail. */
export function AppleHiddenTag() {
  return (
    <span
      title="Apple Hide My Email address. Mail sent to it reaches the user's real inbox, but it may not match the name on a manual payment. Match by name instead."
      className="ml-1 inline-block rounded-md bg-surface-muted px-1.5 py-0.5 align-middle text-[11px] font-medium text-text"
    >
      Apple · hidden email
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
