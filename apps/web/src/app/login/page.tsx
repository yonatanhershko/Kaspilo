"use client";

import { useRouter } from "next/navigation";
import { type FormEvent, type ReactNode, useEffect, useState } from "react";

import { useAdminAuth } from "@/auth/AdminAuth";
import { Button } from "@/components/ui";

// Same as the app (apps/mobile/src/auth/validation.ts).
const MIN_PASSWORD_LENGTH = 8;

/** sign-in, then "Forgot password?": email → code + new password (docs/spec.md). */
type Step = "signIn" | "resetEmail" | "resetCode";

const inputClass =
  "h-11 w-full rounded-lg border border-border bg-surface px-3 outline-none focus:border-primary";

export default function LoginPage() {
  const router = useRouter();
  const { state, signIn, signOut, requestPasswordReset, resetPassword } = useAdminAuth();
  const [step, setStep] = useState<Step>("signIn");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [code, setCode] = useState("");
  const [newPassword, setNewPassword] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    if (state.status === "ready") router.replace("/");
  }, [state.status, router]);

  const goTo = (next: Step) => {
    setStep(next);
    setError(null);
    setNotice(null);
  };

  const run = async (action: () => Promise<string | null>): Promise<boolean> => {
    setBusy(true);
    setError(null);
    setNotice(null);
    const message = await action();
    setError(message);
    setBusy(false);
    return message === null;
  };

  const submitSignIn = async (event: FormEvent) => {
    event.preventDefault();
    await run(() => signIn(email, password));
  };

  const sendCode = async (event?: FormEvent) => {
    event?.preventDefault();
    if (await run(() => requestPasswordReset(email))) {
      setCode("");
      setStep("resetCode");
      setNotice(`If ${email.trim()} has an account, a 6-digit code is on its way.`);
    }
  };

  const submitReset = async (event: FormEvent) => {
    event.preventDefault();
    if (newPassword.length < MIN_PASSWORD_LENGTH) {
      setError(`Password needs at least ${MIN_PASSWORD_LENGTH} characters.`);
      return;
    }
    if (await run(() => resetPassword(email, code, newPassword))) {
      // Signed in now: the effect above moves an admin on; anyone else sees "not an admin".
      setPassword("");
      setNewPassword("");
      setCode("");
      setStep("signIn");
    }
  };

  const emailField = (
    <label className="block space-y-1 text-sm">
      <span className="text-text-muted">Email</span>
      <input
        type="email"
        required
        autoComplete="email"
        value={email}
        onChange={(e) => setEmail(e.target.value)}
        className={inputClass}
      />
    </label>
  );

  const messages = (
    <>
      {notice && (
        <p role="status" className="text-sm text-text-muted">
          {notice}
        </p>
      )}
      {error && (
        <p role="alert" className="text-sm text-danger">
          {error}
        </p>
      )}
    </>
  );

  const backToSignIn = (
    <button
      type="button"
      className="min-h-11 w-full text-sm text-primary underline-offset-2 hover:underline"
      onClick={() => goTo("signIn")}
    >
      Back to sign in
    </button>
  );

  if (step === "resetEmail") {
    return (
      <Shell title="Reset your password" subtitle="Enter your email and we send you a 6-digit code." onSubmit={sendCode}>
        {emailField}
        {messages}
        <Button type="submit" disabled={busy} className="h-11 w-full">
          {busy ? "Sending…" : "Send code"}
        </Button>
        {backToSignIn}
      </Shell>
    );
  }

  if (step === "resetCode") {
    return (
      <Shell
        title="Reset your password"
        subtitle={`Enter the code from the email to ${email.trim()} and a new password.`}
        onSubmit={submitReset}
      >
        <label className="block space-y-1 text-sm">
          <span className="text-text-muted">Code from the email</span>
          <input
            type="text"
            required
            inputMode="numeric"
            autoComplete="one-time-code"
            pattern="\d{6,10}"
            maxLength={10}
            value={code}
            onChange={(e) => setCode(e.target.value.replace(/\D/g, ""))}
            className={`${inputClass} tracking-widest`}
          />
        </label>
        <label className="block space-y-1 text-sm">
          <span className="text-text-muted">New password (at least {MIN_PASSWORD_LENGTH} characters)</span>
          <input
            type="password"
            required
            autoComplete="new-password"
            value={newPassword}
            onChange={(e) => setNewPassword(e.target.value)}
            className={inputClass}
          />
        </label>
        {messages}
        <Button type="submit" disabled={busy} className="h-11 w-full">
          {busy ? "Saving…" : "Save new password"}
        </Button>
        <button
          type="button"
          disabled={busy}
          className="min-h-11 w-full text-sm text-primary underline-offset-2 hover:underline disabled:opacity-50"
          onClick={() => void sendCode()}
        >
          Send a new code
        </button>
        {backToSignIn}
      </Shell>
    );
  }

  return (
    <Shell title="Kaspilo Admin" subtitle="Sign in with an admin account." onSubmit={submitSignIn}>
      {emailField}
      <label className="block space-y-1 text-sm">
        <span className="text-text-muted">Password</span>
        <input
          type="password"
          required
          autoComplete="current-password"
          value={password}
          onChange={(e) => setPassword(e.target.value)}
          className={inputClass}
        />
      </label>
      {messages}
      {state.status === "notAdmin" && (
        <div role="alert" className="space-y-2 text-sm text-danger">
          <p>This account is not an admin.</p>
          <button type="button" className="underline" onClick={() => void signOut()}>
            Sign out
          </button>
        </div>
      )}
      <Button type="submit" disabled={busy} className="h-11 w-full">
        {busy ? "Signing in…" : "Sign in"}
      </Button>
      <button
        type="button"
        className="min-h-11 w-full text-sm text-primary underline-offset-2 hover:underline"
        onClick={() => goTo("resetEmail")}
      >
        Forgot password?
      </button>
    </Shell>
  );
}

function Shell({
  title,
  subtitle,
  onSubmit,
  children,
}: {
  title: string;
  subtitle: string;
  onSubmit: (event: FormEvent) => void;
  children: ReactNode;
}) {
  return (
    <main className="flex min-h-screen items-center justify-center bg-background p-6">
      <form
        onSubmit={onSubmit}
        className="w-full max-w-sm space-y-4 rounded-2xl border border-border bg-surface p-8"
      >
        <div>
          <h1 className="text-2xl font-bold text-primary">{title}</h1>
          <p className="text-sm text-text-muted">{subtitle}</p>
        </div>
        {children}
      </form>
    </main>
  );
}
