/**
 * Client side of the `auth-password` Edge Function (docs/spec.md "Sign-in", password
 * protection). Every password action goes through it; the app and the admin web
 * never send a password to Supabase Auth directly.
 */

export type PasswordAuthRequest =
  | { action: 'sign-in'; email: string; password: string }
  | { action: 'sign-up'; email: string; password: string; fullName: string; termsVersion: string }
  | { action: 'reset'; email: string; password: string; code: string };

export type PasswordAuthTokens = { access_token: string; refresh_token: string };

export type PasswordAuthResult =
  | { ok: true; session: PasswordAuthTokens | null }
  /**
   * status 0 = no connection. `code` is the Supabase Auth error code when Auth refused
   * (invalid_credentials, user_already_exists, otp_expired, ...), or one of the
   * function's own: locked (with retry_after seconds), password_leaked, weak_password,
   * not_configured, unavailable.
   */
  | { ok: false; status: number; code: string; retryAfter?: number };

export async function callPasswordAuth(
  supabaseUrl: string,
  publishableKey: string,
  request: PasswordAuthRequest,
): Promise<PasswordAuthResult> {
  let res: Response;
  try {
    res = await fetch(`${supabaseUrl}/functions/v1/auth-password`, {
      method: 'POST',
      headers: { apikey: publishableKey, 'Content-Type': 'application/json' },
      body: JSON.stringify(request),
    });
  } catch {
    return { ok: false, status: 0, code: 'network' };
  }
  const body = (await res.json().catch(() => ({}))) as {
    session?: PasswordAuthTokens | null;
    code?: string;
    retry_after?: number;
  };
  if (res.ok) return { ok: true, session: body.session ?? null };
  return {
    ok: false,
    status: res.status,
    code: body.code ?? 'unknown',
    retryAfter: typeof body.retry_after === 'number' ? body.retry_after : undefined,
  };
}

/** Whole minutes left of a lock, at least 1. */
export const lockMinutes = (retryAfterSeconds = 900) => Math.max(1, Math.ceil(retryAfterSeconds / 60));
