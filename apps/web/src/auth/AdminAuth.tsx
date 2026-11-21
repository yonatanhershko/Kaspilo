"use client";

import { callPasswordAuth, lockMinutes, type PasswordAuthRequest, type Profile } from "@kaspilo/shared";
import {
  createContext,
  type ReactNode,
  use,
  useEffect,
  useState,
} from "react";

import { env } from "@/lib/env";
import { supabase } from "@/lib/supabase";

type AdminAuthState =
  | { status: "loading" }
  | { status: "signedOut" }
  | { status: "notAdmin" }
  | { status: "ready"; profile: Profile };

type AdminAuthValue = {
  state: AdminAuthState;
  /** Returns an error message to show, or null on success. */
  signIn: (email: string, password: string) => Promise<string | null>;
  /** Sends a 6-digit reset code. Same answer for an email with no account. */
  requestPasswordReset: (email: string) => Promise<string | null>;
  /** Checks the code, sets the new password and signs in. Error message or null. */
  resetPassword: (email: string, code: string, newPassword: string) => Promise<string | null>;
  signOut: () => Promise<void>;
};

/** The message for an auth error, in the same words as the app (English only). */
function errorText(code: string | undefined, status: number | undefined, retryAfter?: number): string {
  switch (code) {
    case "invalid_credentials":
      return "Wrong email or password.";
    case "locked":
      return `Too many wrong passwords. Try again in ${lockMinutes(retryAfter)} minutes, or reset your password.`;
    case "otp_expired":
    case "otp_disabled":
      return "That code is wrong or has expired. Send a new one.";
    case "over_email_send_rate_limit":
    case "over_request_rate_limit":
      return "Too many tries. Wait a few minutes and try again.";
    case "password_leaked":
      return "This password appeared in a data leak. Choose another.";
    case "weak_password":
      return "That password is too weak. Choose another.";
    case "validation_failed":
    case "email_address_invalid":
      return "That email address isn't valid.";
    default:
      return status === undefined || status === 0 ? "No connection. Try again." : "Something went wrong. Try again.";
  }
}

/** Runs a password action through `auth-password` and starts the session it returns. */
async function passwordAction(request: PasswordAuthRequest): Promise<string | null> {
  const result = await callPasswordAuth(env.supabaseUrl, env.supabasePublishableKey, request);
  if (!result.ok) return errorText(result.code, result.status, result.retryAfter);
  if (!result.session) return "Something went wrong. Try again.";
  const { error } = await supabase.auth.setSession(result.session);
  return error ? "Something went wrong. Try again." : null;
}

const AdminAuthContext = createContext<AdminAuthValue | null>(null);

export function AdminAuthProvider({ children }: { children: ReactNode }) {
  const [state, setState] = useState<AdminAuthState>({ status: "loading" });
  const [userId, setUserId] = useState<string | null | undefined>(undefined);

  useEffect(() => {
    void supabase.auth
      .getSession()
      .then(({ data }) => setUserId(data.session?.user.id ?? null));
    // Keep this callback synchronous: calling Supabase inside it can deadlock.
    const { data } = supabase.auth.onAuthStateChange((_event, session) =>
      setUserId(session?.user.id ?? null),
    );
    return () => data.subscription.unsubscribe();
  }, []);

  useEffect(() => {
    if (userId === undefined) return;
    let alive = true;
    if (userId === null) {
      queueMicrotask(() => alive && setState({ status: "signedOut" }));
      return () => {
        alive = false;
      };
    }
    supabase
      .from("profiles")
      .select("*")
      .eq("id", userId)
      .maybeSingle()
      .then(({ data }) => {
        if (!alive) return;
        // The UI check is a convenience. A non-admin who skipped it would
        // still get nothing: the database refuses every admin read and action.
        setState(
          data?.role === "admin"
            ? { status: "ready", profile: data }
            : { status: "notAdmin" },
        );
      });
    return () => {
      alive = false;
    };
  }, [userId]);

  const value: AdminAuthValue = {
    state,
    // Through the auth-password Edge Function, like the app: the password lock
    // applies here too (docs/spec.md "Sign-in").
    signIn: (email, password) => passwordAction({ action: "sign-in", email: email.trim(), password }),
    requestPasswordReset: async (email) => {
      const { error } = await supabase.auth.resetPasswordForEmail(email.trim());
      return error ? errorText(error.code, error.status) : null;
    },
    resetPassword: (email, code, newPassword) =>
      passwordAction({ action: "reset", email: email.trim(), password: newPassword, code: code.trim() }),
    signOut: async () => {
      await supabase.auth.signOut();
    },
  };

  return <AdminAuthContext value={value}>{children}</AdminAuthContext>;
}

export function useAdminAuth(): AdminAuthValue {
  const value = use(AdminAuthContext);
  if (!value) throw new Error("useAdminAuth must be used inside AdminAuthProvider");
  return value;
}
