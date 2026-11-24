"use client";

import { type AccessMonths, type AccessPlan, hasAccess, isAppleHiddenEmail } from "@kaspilo/shared";
import { useState } from "react";

import { type AdminUser, fetchHistory, grantAccess, type GrantLength, revokeAccess } from "@/lib/admin-api";
import { formatDate, monthsLabel, planLabel } from "@/lib/format";
import { useAsync } from "@/lib/use-async";

import { NotifyDialog } from "./NotifyDialog";
import { AppleHiddenTag, Button } from "./ui";

const plans: AccessPlan[] = ["paid", "vip", "family"];
const lengths: (AccessMonths | "date")[] = [1, 2, 3, 12, "date"];

const storeName = { app_store: "iPhone", play_store: "Android", test_store: "Test store", promotional: "Promo", other: "Other" };

/** What gives this user access now, as the admin reads it (docs/spec.md "Admin web"). */
function accessOf(user: AdminUser) {
  const now = new Date();
  const s = user.store_subscriptions;
  const storeLive = !!s && new Date(s.expires_at) > now && !s.refunded_at;
  const has = hasAccess(user, now);
  // Admin access still running: family has no end; the others until grant_expires_at.
  const grantLive =
    !!user.plan && (user.plan === "family" || (!!user.grant_expires_at && new Date(user.grant_expires_at) > now));

  let label: string;
  let tone: "ok" | "trial" | "off";
  if (storeLive && s) {
    label = s.period_type === "trial" ? "In trial" : s.plan === "monthly" ? "Monthly" : s.plan === "yearly" ? "Yearly" : "Store";
    tone = s.period_type === "trial" ? "trial" : "ok";
  } else if (has) {
    label = user.plan ? planLabel[user.plan] : "Active";
    tone = "ok";
  } else {
    label = user.approved_at ? "Ended" : "No access yet";
    tone = "off";
  }
  return {
    label,
    tone,
    has,
    grantLive,
    store: s ? storeName[s.store] : "—",
    end: has && user.plan === "family" && !user.expires_at ? "Never" : formatDate(user.expires_at),
    renews: storeLive && s ? (s.will_renew ? "Yes" : "No") : "—",
    billing: storeLive && !!s?.billing_issue_at,
  };
}

const toneDot = { ok: "bg-success", trial: "bg-accent", off: "bg-text-muted" } as const;

function AccessBadge({ user }: { user: AdminUser }) {
  const a = accessOf(user);
  return (
    <span className="inline-flex flex-wrap items-center gap-2 text-sm">
      <span className={`h-2 w-2 rounded-full ${toneDot[a.tone]}`} />
      {a.label}
      {a.billing && (
        <span className="rounded-md border border-danger px-1.5 py-0.5 text-[11px] font-medium text-danger">
          Billing problem
        </span>
      )}
    </span>
  );
}

/**
 * End date the database will set, shown before the admin clicks. Mirrors admin_grant_access:
 * months add to the admin date if it is still ahead (else from now); 12 = 365 days.
 */
function previewEnd(user: AdminUser, length: AccessMonths | "date", until: string): string | null {
  if (length === "date") return until ? formatDate(`${until}T12:00:00`) : null;
  const now = new Date();
  const grant = user.grant_expires_at ? new Date(user.grant_expires_at) : now;
  const next = new Date(grant > now ? grant : now);
  if (length === 12) next.setDate(next.getDate() + 365);
  else next.setMonth(next.getMonth() + length);
  return formatDate(next.toISOString());
}

const selectClass = "h-11 rounded-lg border border-border bg-surface px-2 text-sm md:h-9";

/** Give / extend admin access, revoke it, history, notify. Shared by table row and card. */
function UserActions({ user, onChanged, align }: { user: AdminUser; onChanged: () => void; align: "end" | "start" }) {
  const a = accessOf(user);
  const [plan, setPlan] = useState<AccessPlan>(user.plan ?? "vip");
  const [length, setLength] = useState<AccessMonths | "date">(1);
  const [until, setUntil] = useState("");
  const [note, setNote] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [notifying, setNotifying] = useState(false);
  const [showHistory, setShowHistory] = useState(false);

  const act = async (action: () => Promise<void>) => {
    setBusy(true);
    setError(null);
    try {
      await action();
      setNote("");
      onChanged();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Action failed");
    } finally {
      setBusy(false);
    }
  };

  const name = user.full_name || "(no name)";
  const grantLength: GrantLength = plan === "family" ? null : length === "date" ? { until } : { months: length };
  const preview = plan === "family" ? "Never" : previewEnd(user, length, until);
  const today = new Date().toISOString().slice(0, 10);
  const justify = align === "end" ? "justify-end" : "";
  const textAlign = align === "end" ? "text-right" : "";

  return (
    <>
      <div className={`flex flex-wrap items-center gap-2 ${justify}`}>
        <select aria-label={`Access type for ${name}`} value={plan} onChange={(e) => setPlan(e.target.value as AccessPlan)} className={selectClass}>
          {plans.map((p) => (
            <option key={p} value={p}>
              {planLabel[p]}
            </option>
          ))}
        </select>
        {plan !== "family" && (
          <select
            aria-label={`Length for ${name}`}
            value={String(length)}
            onChange={(e) => setLength(e.target.value === "date" ? "date" : (Number(e.target.value) as AccessMonths))}
            className={selectClass}
          >
            {lengths.map((l) => (
              <option key={l} value={String(l)}>
                {l === "date" ? "Until a date…" : monthsLabel[l]}
              </option>
            ))}
          </select>
        )}
        {plan !== "family" && length === "date" && (
          <input
            type="date"
            aria-label={`Access until, for ${name}`}
            min={today}
            value={until}
            onChange={(e) => setUntil(e.target.value)}
            className={selectClass}
          />
        )}
        <input
          type="text"
          aria-label={`Note for ${name}`}
          placeholder="Note (e.g. bank transfer)"
          maxLength={200}
          value={note}
          onChange={(e) => setNote(e.target.value)}
          className={`${selectClass} w-48`}
        />
        <Button
          disabled={busy || (plan !== "family" && length === "date" && !until)}
          onClick={() => act(() => grantAccess(user.id, plan, grantLength, note))}
        >
          {a.grantLive ? "Extend" : "Give access"}
        </Button>
      </div>
      <div className={`mt-2 flex flex-wrap items-center gap-2 ${justify}`}>
        {preview && <span className="text-xs text-text-muted">Admin access until {preview}</span>}
        {a.grantLive && (
          <Button
            variant="danger"
            disabled={busy}
            onClick={() => {
              if (window.confirm(`End the admin access of ${name}? A store subscription is not affected.`)) {
                void act(() => revokeAccess(user.id, note));
              }
            }}
          >
            Revoke admin access
          </Button>
        )}
        <Button variant="ghost" onClick={() => setShowHistory((v) => !v)} aria-expanded={showHistory}>
          History
        </Button>
        <Button variant="ghost" onClick={() => setNotifying(true)}>
          Notify
        </Button>
      </div>
      {error && (
        <p role="alert" className={`mt-1 text-xs text-danger ${textAlign}`}>
          {error}
        </p>
      )}
      {showHistory && <History userId={user.id} />}
      {notifying && (
        <NotifyDialog target={{ id: user.id, name: user.full_name || user.email }} onClose={() => setNotifying(false)} />
      )}
    </>
  );
}

const actionText: Record<string, string> = {
  grant: "Admin gave access",
  revoke: "Admin revoked access",
  approve: "Approved",
  extend: "Extended",
  set_plan: "Plan changed",
  reject: "Rejected",
  resubmit: "Asked again",
  expire: "Expired",
  store: "Store",
};

function History({ userId }: { userId: string }) {
  const history = useAsync(() => fetchHistory(userId), `history-${userId}`);
  if (history.loading) return <p className="mt-2 text-xs text-text-muted">Loading history…</p>;
  if (history.error) return <p className="mt-2 text-xs text-danger">Couldn&apos;t load history: {history.error}</p>;
  if (!history.data?.length) return <p className="mt-2 text-xs text-text-muted">No history yet.</p>;
  return (
    <ol className="mt-2 space-y-1 rounded-lg bg-surface-muted p-3 text-left text-xs">
      {history.data.map((e) => (
        <li key={e.id}>
          <span className="text-text-muted">{formatDate(e.created_at)}</span>{" "}
          {actionText[e.action] ?? e.action}
          {e.store_event ? ` · ${e.store_event.toLowerCase().replace(/_/g, " ")}` : ""}
          {e.plan ? ` · ${planLabel[e.plan]}` : ""}
          {e.new_expires_at ? ` · until ${formatDate(e.new_expires_at)}` : ""}
          {e.note ? ` · “${e.note}”` : ""}
        </li>
      ))}
    </ol>
  );
}

function Row({ user, onChanged }: { user: AdminUser; onChanged: () => void }) {
  const a = accessOf(user);
  return (
    <tr className="border-t border-border align-top">
      <td className="py-3 pr-4">
        <p className="font-medium">{user.full_name || "(no name)"}</p>
        <p className="text-xs text-text-muted">
          {user.email}
          {isAppleHiddenEmail(user.email) && <AppleHiddenTag />}
        </p>
        <p className="text-xs text-text-muted">Signed up {formatDate(user.created_at)}</p>
      </td>
      <td className="py-3 pr-4">
        <AccessBadge user={user} />
      </td>
      <td className="py-3 pr-4 text-sm">{a.store}</td>
      <td className="py-3 pr-4 text-sm">{a.end}</td>
      <td className="py-3 pr-4 text-sm">{a.renews}</td>
      <td className="py-3">
        <UserActions user={user} onChanged={onChanged} align="end" />
      </td>
    </tr>
  );
}

/** Phone layout: one card per user instead of a wide table. */
function UserCard({ user, onChanged }: { user: AdminUser; onChanged: () => void }) {
  const a = accessOf(user);
  return (
    <li className="space-y-3 rounded-xl border border-border bg-surface p-4">
      <div>
        <p className="font-medium">{user.full_name || "(no name)"}</p>
        <p className="break-all text-xs text-text-muted">
          {user.email}
          {isAppleHiddenEmail(user.email) && <AppleHiddenTag />}
        </p>
      </div>
      <AccessBadge user={user} />
      <dl className="grid grid-cols-3 gap-2 text-sm">
        <div>
          <dt className="text-xs text-text-muted">Store</dt>
          <dd>{a.store}</dd>
        </div>
        <div>
          <dt className="text-xs text-text-muted">Access until</dt>
          <dd>{a.end}</dd>
        </div>
        <div>
          <dt className="text-xs text-text-muted">Renews</dt>
          <dd>{a.renews}</dd>
        </div>
      </dl>
      <UserActions user={user} onChanged={onChanged} align="start" />
    </li>
  );
}

export function UserTable({ users, onChanged }: { users: AdminUser[]; onChanged: () => void }) {
  return (
    <>
      <ul className="space-y-3 md:hidden">
        {users.map((user) => (
          <UserCard key={`${user.id}-${user.updated_at}`} user={user} onChanged={onChanged} />
        ))}
      </ul>
      <div className="hidden overflow-x-auto md:block">
        <table className="w-full min-w-[980px] text-left">
          <thead>
            <tr className="text-xs font-medium text-text-muted">
              <th className="pb-2 pr-4">User</th>
              <th className="pb-2 pr-4">Access</th>
              <th className="pb-2 pr-4">Store</th>
              <th className="pb-2 pr-4">Access until</th>
              <th className="pb-2 pr-4">Renews</th>
              <th className="pb-2 text-right">Actions</th>
            </tr>
          </thead>
          <tbody>
            {users.map((user) => (
              <Row key={`${user.id}-${user.updated_at}`} user={user} onChanged={onChanged} />
            ))}
          </tbody>
        </table>
      </div>
    </>
  );
}
