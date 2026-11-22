"use client";

import type { NotificationKind } from "@kaspilo/shared";
import { useEffect, useId, useRef, useState } from "react";

import {
  fetchNotificationCatalog,
  fetchPushAudience,
  type NotificationChoice,
  sendNotification,
} from "@/lib/admin-api";
import { useAsync } from "@/lib/use-async";

import { Button } from "./ui";

const kindLabel: Record<NotificationKind, string> = {
  expiry_30: "Renewal: ends in a month",
  expiry_7: "Renewal: ends in a week",
  expiry_1: "Renewal: ends tomorrow",
  expiry_0: "Renewal: ends today",
  inactive_1: "Inactivity: first reminder (day 4)",
  inactive_2: "Inactivity: second reminder (day 14)",
  inactive_3: "Inactivity: third reminder (day 24)",
};

const TITLE_MAX = 60;
const BODY_MAX = 200;

const plural = (n: number, one: string, many: string) =>
  `${n.toLocaleString("en")} ${n === 1 ? one : many}`;

export type NotifyTarget = { id: string; name: string } | "all";

/**
 * Send a notification by hand, to one active user or to all of them.
 * Resets nothing: the automatic reminders still arrive on their own days.
 */
export function NotifyDialog({
  target,
  onClose,
}: {
  target: NotifyTarget;
  onClose: () => void;
}) {
  const userId = target === "all" ? null : target.id;
  const titleId = useId();
  const dialogRef = useRef<HTMLDialogElement>(null);

  const catalog = useAsync(fetchNotificationCatalog, "catalog");
  const [kind, setKind] = useState<NotificationKind | "custom">("expiry_30");
  const audience = useAsync(() => fetchPushAudience(userId, kind), `${userId ?? "all"}:${kind}`);

  const [title, setTitle] = useState("");
  const [body, setBody] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [sent, setSent] = useState<number | null>(null);

  useEffect(() => {
    const dialog = dialogRef.current;
    if (dialog && !dialog.open) dialog.showModal();
  }, []);

  const preview = catalog.data?.find((item) => item.kind === kind);
  const devices = audience.data?.devices ?? 0;
  const customReady = title.trim().length > 0 && body.trim().length > 0;
  const canSend =
    !busy && !!audience.data && devices > 0 && (kind === "custom" ? customReady : !!preview);

  const send = async () => {
    const choice: NotificationChoice =
      kind === "custom" ? { kind, title: title.trim(), body: body.trim() } : { kind };
    if (
      target === "all" &&
      !window.confirm(`Send this to ${plural(devices, "device", "devices")} of all active users?`)
    )
      return;
    setBusy(true);
    setError(null);
    setSent(null);
    try {
      setSent(await sendNotification(userId, choice));
    } catch (e) {
      setError(e instanceof Error ? e.message : "Sending failed");
    } finally {
      setBusy(false);
    }
  };

  const field =
    "w-full rounded-lg border border-border bg-surface px-3 text-sm outline-none focus:border-primary";

  return (
    <dialog
      ref={dialogRef}
      aria-labelledby={titleId}
      onClose={onClose}
      onClick={(e) => {
        // a click on the backdrop (the dialog element itself) closes it
        if (e.target === dialogRef.current) onClose();
      }}
      className="m-auto w-[min(92vw,480px)] rounded-2xl border border-border bg-surface p-0 text-text backdrop:bg-black/40"
    >
      <div className="space-y-4 p-5">
        <header>
          <h2 id={titleId} className="text-lg font-semibold">
            Send notification
          </h2>
          <p className="text-sm text-text-muted">
            To: {target === "all" ? "all active users" : target.name}
          </p>
        </header>

        <div className="rounded-lg bg-surface-muted px-3 py-2 text-sm" aria-live="polite">
          {audience.loading && !audience.data ? (
            "Checking registered devices…"
          ) : audience.error ? (
            <span className="text-danger">Couldn&apos;t check devices: {audience.error}</span>
          ) : audience.data && devices === 0 && audience.data.off_devices > 0 ? (
            `Switched off on ${target === "all" ? "every registered device" : "all of this user's devices"}. Nothing will be sent.`
          ) : audience.data && devices === 0 ? (
            target === "all" ? (
              "No active user has a registered device yet. Nothing can be sent."
            ) : (
              "This user has no registered device (app not installed, notifications not allowed, or push not set up yet). Nothing can be sent."
            )
          ) : audience.data ? (
            <>
              Will reach {plural(devices, "device", "devices")}
              {target === "all" &&
                ` of ${plural(audience.data.users_with_device, "user", "users")} (${plural(audience.data.users, "active user", "active users")} in total)`}
              .
              {audience.data.off_devices > 0 && (
                <>
                  {" "}
                  Not sent to {plural(audience.data.off_devices, "device", "devices")} where the
                  user switched this notification off.
                </>
              )}
            </>
          ) : null}
        </div>

        <label className="block space-y-1 text-sm">
          <span className="font-medium">Notification</span>
          <select
            value={kind}
            onChange={(e) => {
              setKind(e.target.value as NotificationKind | "custom");
              setSent(null);
              setError(null);
            }}
            className={`h-11 md:h-9 ${field}`}
          >
            {(Object.keys(kindLabel) as NotificationKind[]).map((k) => (
              <option key={k} value={k}>
                {kindLabel[k]}
              </option>
            ))}
            <option value="custom">Custom message (one time)</option>
          </select>
        </label>

        {kind === "custom" ? (
          <div className="space-y-3">
            <label className="block space-y-1 text-sm">
              <span className="flex justify-between font-medium">
                Title
                <span className="font-normal text-text-muted">
                  {title.length}/{TITLE_MAX}
                </span>
              </span>
              <input
                value={title}
                maxLength={TITLE_MAX}
                dir="auto"
                onChange={(e) => setTitle(e.target.value)}
                className={`h-11 md:h-9 ${field}`}
              />
            </label>
            <label className="block space-y-1 text-sm">
              <span className="flex justify-between font-medium">
                Message
                <span className="font-normal text-text-muted">
                  {body.length}/{BODY_MAX}
                </span>
              </span>
              <textarea
                value={body}
                maxLength={BODY_MAX}
                rows={3}
                dir="auto"
                onChange={(e) => setBody(e.target.value)}
                className={`py-2 ${field}`}
              />
            </label>
            <p className="text-xs text-text-muted">
              Sent exactly as written to every device, whatever its language. Not saved.
            </p>
          </div>
        ) : catalog.error ? (
          <p className="text-sm text-danger" role="alert">
            Couldn&apos;t load the texts: {catalog.error}
          </p>
        ) : preview ? (
          <div className="space-y-2 text-sm">
            <p className="text-xs text-text-muted">
              Each device gets it in its own language.
            </p>
            {(["he", "en"] as const).map((language) => (
              <div
                key={language}
                dir={language === "he" ? "rtl" : "ltr"}
                className="rounded-lg border border-border px-3 py-2"
              >
                <p className="font-medium">{preview[language].title}</p>
                <p className="text-text-muted">{preview[language].body}</p>
              </div>
            ))}
          </div>
        ) : (
          <p className="text-sm text-text-muted">Loading texts…</p>
        )}

        <p className="text-xs text-text-muted">
          A manual send resets nothing: automatic reminders still arrive on their own days.
        </p>

        {sent !== null && (
          <p role="status" className="text-sm font-medium text-success">
            Sent to {plural(sent, "device", "devices")}.
          </p>
        )}
        {error && (
          <p role="alert" className="text-sm text-danger">
            {error}
          </p>
        )}

        <div className="flex justify-end gap-2">
          <Button variant="ghost" onClick={onClose}>
            Close
          </Button>
          <Button disabled={!canSend} onClick={() => void send()}>
            {busy ? "Sending…" : target === "all" ? "Send to all" : "Send"}
          </Button>
        </div>
      </div>
    </dialog>
  );
}
