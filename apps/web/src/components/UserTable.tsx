"use client";

import type { AccessMonths, AccessPlan, Profile } from "@kaspilo/shared";
import { useState } from "react";

import {
  approveUser,
  extendUser,
  rejectUser,
  setUserPlan,
} from "@/lib/admin-api";
import { formatDate, monthsLabel, planLabel } from "@/lib/format";

import { NotifyDialog } from "./NotifyDialog";
import { Button, PlanBadge, StatusBadge } from "./ui";

const plans: AccessPlan[] = ["paid", "vip", "family"];

function PlanSelect({
  value,
  onChange,
  label,
}: {
  value: AccessPlan;
  onChange: (plan: AccessPlan) => void;
  label: string;
}) {
  return (
    <select
      aria-label={label}
      value={value}
      onChange={(e) => onChange(e.target.value as AccessPlan)}
      className="h-11 rounded-lg border border-border bg-surface px-2 text-sm md:h-9"
    >
      {plans.map((plan) => (
        <option key={plan} value={plan}>
          {planLabel[plan]}
        </option>
      ))}
    </select>
  );
}

const durations: AccessMonths[] = [12, 2];

function DurationSelect({
  value,
  onChange,
  label,
}: {
  value: AccessMonths;
  onChange: (months: AccessMonths) => void;
  label: string;
}) {
  return (
    <select
      aria-label={label}
      value={value}
      onChange={(e) => onChange(Number(e.target.value) as AccessMonths)}
      className="h-11 rounded-lg border border-border bg-surface px-2 text-sm md:h-9"
    >
      {durations.map((months) => (
        <option key={months} value={months}>
          {monthsLabel[months]}
        </option>
      ))}
    </select>
  );
}

/**
 * Expiry the database will set, shown before the admin clicks. Mirrors
 * access_duration(): 12 = 365 days, 2 = two calendar months.
 */
function previewExpiry(user: Profile, months: AccessMonths): string {
  const now = new Date();
  const current = user.expires_at ? new Date(user.expires_at) : now;
  const from = user.status === "active" && current > now ? current : now;
  const next = new Date(from);
  if (months === 12) next.setDate(next.getDate() + 365);
  else next.setMonth(next.getMonth() + months);
  return formatDate(next.toISOString());
}

/** Plan + duration pickers and approve / extend / reject buttons for one user. Shared by table row and card. */
function UserActions({
  user,
  onChanged,
  align,
}: {
  user: Profile;
  onChanged: () => void;
  align: "end" | "start";
}) {
  const [plan, setPlan] = useState<AccessPlan>(user.plan ?? "paid");
  const [months, setMonths] = useState<AccessMonths>(12);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [notifying, setNotifying] = useState(false);

  const act = async (action: () => Promise<void>) => {
    setBusy(true);
    setError(null);
    try {
      await action();
      onChanged();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Action failed");
    } finally {
      setBusy(false);
    }
  };

  const name = user.full_name || "(no name)";

  return (
    <>
      <div
        className={`flex flex-wrap items-center gap-2 ${align === "end" ? "justify-end" : ""}`}
      >
        {user.status === "active" ? (
          <>
            <PlanSelect value={plan} onChange={setPlan} label={`Plan for ${name}`} />
            <Button
              variant="ghost"
              disabled={busy || plan === user.plan}
              onClick={() => act(() => setUserPlan(user.id, plan))}
            >
              Set plan
            </Button>
            {user.plan !== "family" && (
              <>
                <DurationSelect
                  value={months}
                  onChange={setMonths}
                  label={`Extend ${name} by`}
                />
                <Button
                  disabled={busy}
                  onClick={() => act(() => extendUser(user.id, months))}
                >
                  Extend {monthsLabel[months]}
                </Button>
              </>
            )}
            <Button variant="ghost" onClick={() => setNotifying(true)}>
              Notify
            </Button>
          </>
        ) : (
          <>
            <PlanSelect value={plan} onChange={setPlan} label={`Plan for ${name}`} />
            {plan !== "family" && (
              <DurationSelect
                value={months}
                onChange={setMonths}
                label={`Access length for ${name}`}
              />
            )}
            <Button
              disabled={busy}
              onClick={() => act(() => approveUser(user.id, plan, months))}
            >
              {user.status === "expired" ? "Renew" : "Approve"}
            </Button>
            {user.status === "pending_approval" && (
              <Button
                variant="danger"
                disabled={busy}
                onClick={() => {
                  if (window.confirm(`Reject ${name}?`)) {
                    void act(() => rejectUser(user.id));
                  }
                }}
              >
                Reject
              </Button>
            )}
          </>
        )}
      </div>
      {(user.status === "active" ? user.plan !== "family" : plan !== "family") && (
        <p
          className={`mt-1 text-xs text-text-muted ${align === "end" ? "text-right" : ""}`}
        >
          {user.status === "active" ? "New expiry" : "Access until"}{" "}
          {previewExpiry(user, months)}
        </p>
      )}
      {error && (
        <p
          role="alert"
          className={`mt-1 text-xs text-danger ${align === "end" ? "text-right" : ""}`}
        >
          {error}
        </p>
      )}
       {notifying && (
        <NotifyDialog
          target={{ id: user.id, name: user.full_name || user.email }}
          onClose={() => setNotifying(false)}
        />
      )}
    </>
  );
}

const expiryText = (user: Profile) =>
  user.plan === "family" && user.status === "active" ? "Never" : formatDate(user.expires_at);

function Row({ user, onChanged }: { user: Profile; onChanged: () => void }) {
  return (
    <tr className="border-t border-border align-middle">
      <td className="py-3 pr-4">
        <p className="font-medium">{user.full_name || "(no name)"}</p>
        <p className="text-xs text-text-muted">{user.email}</p>
      </td>
      <td className="py-3 pr-4">
        <StatusBadge status={user.status} />
      </td>
      <td className="py-3 pr-4">
        <PlanBadge plan={user.plan} />
      </td>
      <td className="py-3 pr-4 text-sm">{formatDate(user.created_at)}</td>
      <td className="py-3 pr-4 text-sm">{expiryText(user)}</td>
      <td className="py-3">
        <UserActions user={user} onChanged={onChanged} align="end" />
      </td>
    </tr>
  );
}

/** Phone layout: one card per user instead of a wide table. */
function UserCard({ user, onChanged }: { user: Profile; onChanged: () => void }) {
  return (
    <li className="space-y-3 rounded-xl border border-border bg-surface p-4">
      <div>
        <p className="font-medium">{user.full_name || "(no name)"}</p>
        <p className="break-all text-xs text-text-muted">{user.email}</p>
      </div>
      <div className="flex flex-wrap items-center gap-2">
        <StatusBadge status={user.status} />
        <PlanBadge plan={user.plan} />
      </div>
      <dl className="grid grid-cols-2 gap-2 text-sm">
        <div>
          <dt className="text-xs text-text-muted">Registered</dt>
          <dd>{formatDate(user.created_at)}</dd>
        </div>
        <div>
          <dt className="text-xs text-text-muted">Expires</dt>
          <dd>{expiryText(user)}</dd>
        </div>
      </dl>
      <UserActions user={user} onChanged={onChanged} align="start" />
    </li>
  );
}

export function UserTable({
  users,
  onChanged,
}: {
  users: Profile[];
  onChanged: () => void;
}) {
  return (
    <>
      <ul className="space-y-3 md:hidden">
        {users.map((user) => (
          <UserCard key={`${user.id}-${user.updated_at}`} user={user} onChanged={onChanged} />
        ))}
      </ul>
      <div className="hidden overflow-x-auto md:block">
        <table className="w-full min-w-[820px] text-left">
          <thead>
            <tr className="text-xs font-medium text-text-muted">
              <th className="pb-2 pr-4">User</th>
              <th className="pb-2 pr-4">Status</th>
              <th className="pb-2 pr-4">Plan</th>
              <th className="pb-2 pr-4">Registered</th>
              <th className="pb-2 pr-4">Expires</th>
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
