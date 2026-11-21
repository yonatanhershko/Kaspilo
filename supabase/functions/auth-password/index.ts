/**
 * auth-password: every password action goes through here (docs/spec.md "Sign-in",
 * password protection, owner 2026-11-21).
 *
 *   sign-in   email + password            -> session
 *   sign-up   name + email + password     -> session (or none if email must be confirmed)
 *   reset     email + 6-digit code + new password -> session
 *
 * The password is mixed with a server secret (AUTH_PASSWORD_PEPPER) and Supabase Auth
 * only ever sees the result. A password sent straight to Supabase never works, so the
 * lock below cannot be skipped:
 *   - 5 wrong passwords in a row for one email -> that email is locked for 15 minutes
 *     (counted in public.auth_password_attempts, by sha-256 of the email).
 *   - New passwords are checked against HaveIBeenPwned (k-anonymity: only 5 hex chars
 *     of the SHA-1 leave the server). No answer in 3 s = accepted.
 *   - Users from before this function: the first correct sign-in moves them over.
 *
 * Public endpoint (verify_jwt = false): the caller is not signed in yet.
 * Never logs emails, passwords, codes or tokens.
 */

const MIN_PASSWORD = 8;
const MAX_PASSWORD = 128;
const HIBP_TIMEOUT_MS = 3000;

const SUPABASE_URL = Deno.env.get('SUPABASE_URL') ?? '';
const PEPPER = Deno.env.get('AUTH_PASSWORD_PEPPER') ?? '';

function secretKey(): string {
  const keys = Deno.env.get('SUPABASE_SECRET_KEYS');
  if (keys) {
    try {
      const value = (JSON.parse(keys) as Record<string, string>).default;
      if (value) return value;
    } catch {
      // fall through to the single-key variables (local CLI)
    }
  }
  return Deno.env.get('SUPABASE_SECRET_KEY') ?? Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? '';
}
const SECRET = secretKey();

const cors = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
};

function reply(status: number, body: unknown): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...cors, 'Content-Type': 'application/json' },
  });
}
const fail = (status: number, code: string, extra: Record<string, unknown> = {}) =>
  reply(status, { code, ...extra });

// ---- crypto ------------------------------------------------------------------

const enc = new TextEncoder();
const hex = (buf: ArrayBuffer) => [...new Uint8Array(buf)].map((b) => b.toString(16).padStart(2, '0')).join('');
const b64url = (buf: ArrayBuffer) =>
  btoa(String.fromCharCode(...new Uint8Array(buf))).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');

let pepperKey: Promise<CryptoKey> | null = null;
/**
 * What Supabase Auth stores for a password. The fixed "Kp1!" start keeps it valid
 * under any password-character rule set in the Auth settings; 47 characters, under
 * bcrypt's 72-byte limit.
 */
async function peppered(password: string): Promise<string> {
  pepperKey ??= crypto.subtle.importKey('raw', enc.encode(PEPPER), { name: 'HMAC', hash: 'SHA-256' }, false, ['sign']);
  return 'Kp1!' + b64url(await crypto.subtle.sign('HMAC', await pepperKey, enc.encode(password)));
}

const emailHash = async (email: string) => hex(await crypto.subtle.digest('SHA-256', enc.encode(email)));

/** True when the password is in HaveIBeenPwned. False when it is not, or the service did not answer. */
async function leaked(password: string): Promise<boolean> {
  try {
    const sha1 = hex(await crypto.subtle.digest('SHA-1', enc.encode(password))).toUpperCase();
    const res = await fetch(`https://api.pwnedpasswords.com/range/${sha1.slice(0, 5)}`, {
      headers: { 'Add-Padding': 'true', 'User-Agent': 'kaspilo-auth' },
      signal: AbortSignal.timeout(HIBP_TIMEOUT_MS),
    });
    if (!res.ok) return false;
    const suffix = sha1.slice(5);
    return (await res.text()).split('\n').some((line) => {
      const [s, count] = line.trim().split(':');
      return s === suffix && Number(count) > 0;
    });
  } catch {
    console.warn('[auth-password] leak check unavailable');
    return false;
  }
}

// ---- Supabase calls --------------------------------------------------------------

type Upstream = { ok: boolean; status: number; json: Record<string, unknown> };

function baseHeaders(clientIp: string | null, bearer?: string): Record<string, string> {
  const h: Record<string, string> = { apikey: SECRET, 'Content-Type': 'application/json' };
  // Legacy keys are JWTs and go on Authorization too; new sb_secret_ keys never do.
  if (bearer) h.Authorization = `Bearer ${bearer}`;
  else if (SECRET.startsWith('eyJ')) h.Authorization = `Bearer ${SECRET}`;
  // Supabase Auth limits per IP: pass on the user's address, not this function's.
  // Honoured only with a secret key and "IP address forwarding" on (docs/ci-cd.md).
  if (clientIp && SECRET.startsWith('sb_secret_')) h['sb-forwarded-for'] = clientIp;
  return h;
}

async function call(path: string, body: unknown, clientIp: string | null, opts: { method?: string; bearer?: string } = {}): Promise<Upstream> {
  try {
    const res = await fetch(`${SUPABASE_URL}${path}`, {
      method: opts.method ?? 'POST',
      headers: baseHeaders(clientIp, opts.bearer),
      body: JSON.stringify(body),
    });
    const json = (await res.json().catch(() => ({}))) as Record<string, unknown>;
    return { ok: res.ok, status: res.status, json };
  } catch {
    return { ok: false, status: 503, json: { error_code: 'unavailable' } };
  }
}

/** Error code and message from a Supabase Auth error body, in the shape supabase-js uses. */
function authError(u: Upstream): { code: string; message: string } {
  const j = u.json;
  const code = String(j.error_code ?? j.code ?? j.error ?? 'unknown');
  const message = String(j.msg ?? j.message ?? j.error_description ?? '');
  return { code: /^\d+$/.test(code) ? 'unknown' : code, message };
}
const passThrough = (u: Upstream) => reply(u.status >= 400 ? u.status : 502, authError(u));

async function rpc(name: string, args: Record<string, unknown>): Promise<number> {
  const u = await call(`/rest/v1/rpc/${name}`, args, null);
  if (!u.ok) throw new Error(`rpc ${name} ${u.status}`);
  return Number(u.json as unknown);
}

/** Only what the app needs to start the session. */
function session(j: Record<string, unknown>) {
  if (typeof j.access_token !== 'string' || typeof j.refresh_token !== 'string') return null;
  return {
    access_token: j.access_token,
    refresh_token: j.refresh_token,
    expires_in: j.expires_in,
    expires_at: j.expires_at,
    token_type: j.token_type,
  };
}

// ---- actions -----------------------------------------------------------------

type RequestBody = {
  action?: unknown;
  email?: unknown;
  password?: unknown;
  fullName?: unknown;
  termsVersion?: unknown;
  code?: unknown;
};

const str = (v: unknown, max: number) => (typeof v === 'string' && v.length > 0 && v.length <= max ? v : null);

async function signIn(email: string, password: string, ip: string | null): Promise<Response> {
  const hash = await emailHash(email);
  const wait = await rpc('auth_attempt_begin', { p_email_hash: hash });
  if (wait > 0) return fail(429, 'locked', { retry_after: wait });

  const tokenPath = '/auth/v1/token?grant_type=password';
  const first = await call(tokenPath, { email, password: await peppered(password) }, ip);
  if (first.ok) {
    await rpc('auth_attempt_finish', { p_email_hash: hash, p_outcome: 'ok' });
    return reply(200, { session: session(first.json) });
  }
  if (authError(first).code !== 'invalid_credentials') {
    // Not a wrong password (Supabase busy, IP limit, unconfirmed email): does not count.
    await rpc('auth_attempt_finish', { p_email_hash: hash, p_outcome: 'error' });
    return passThrough(first);
  }

  // A user from before this function still has the plain password stored: move them over.
  const legacy = await call(tokenPath, { email, password }, ip);
  if (legacy.ok) {
    const s = session(legacy.json);
    if (s) {
      const moved = await call('/auth/v1/user', { password: await peppered(password) }, ip, { method: 'PUT', bearer: s.access_token });
      if (!moved.ok) console.warn('[auth-password] could not move a legacy password', moved.status);
    }
    await rpc('auth_attempt_finish', { p_email_hash: hash, p_outcome: 'ok' });
    return reply(200, { session: s });
  }

  const locked = await rpc('auth_attempt_finish', { p_email_hash: hash, p_outcome: 'wrong' });
  if (locked > 0) return fail(429, 'locked', { retry_after: locked });
  return passThrough(first);
}

async function signUp(body: RequestBody, email: string, password: string, ip: string | null): Promise<Response> {
  const fullName = str(typeof body.fullName === 'string' ? body.fullName.trim() : null, 100);
  const termsVersion = str(body.termsVersion, 20);
  if (!fullName || !termsVersion) return fail(400, 'bad_request');
  if (password.length < MIN_PASSWORD) return fail(422, 'weak_password');
  if (await leaked(password)) return fail(422, 'password_leaked');

  const u = await call(
    '/auth/v1/signup',
    {
      email,
      password: await peppered(password),
      data: { full_name: fullName, terms_version: termsVersion, terms_accepted_at: new Date().toISOString() },
    },
    ip,
  );
  if (!u.ok) return passThrough(u);
  return reply(200, { session: session(u.json) });
}

async function reset(body: RequestBody, email: string, password: string, ip: string | null): Promise<Response> {
  const code = typeof body.code === 'string' ? body.code.trim() : '';
  if (!/^\d{6,10}$/.test(code)) return fail(400, 'otp_expired');
  // Checked before the code is used, so a refused password does not waste the code.
  if (password.length < MIN_PASSWORD) return fail(422, 'weak_password');
  if (await leaked(password)) return fail(422, 'password_leaked');

  const verified = await call('/auth/v1/verify', { type: 'recovery', email, token: code }, ip);
  if (!verified.ok) return passThrough(verified);
  const s = session(verified.json);
  if (!s) return fail(502, 'unknown');
  const updated = await call('/auth/v1/user', { password: await peppered(password) }, ip, { method: 'PUT', bearer: s.access_token });
  if (!updated.ok) return passThrough(updated);
  // A reset clears the count and any lock.
  await rpc('auth_attempt_finish', { p_email_hash: await emailHash(email), p_outcome: 'ok' });
  return reply(200, { session: s });
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: cors });
  if (req.method !== 'POST') return fail(405, 'method_not_allowed');
  if (!SUPABASE_URL || !SECRET || PEPPER.length < 32) {
    console.error('[auth-password] not configured: AUTH_PASSWORD_PEPPER (32+ chars) and the secret key are needed');
    return fail(503, 'not_configured');
  }

  const raw = await req.text();
  if (raw.length > 4096) return fail(413, 'bad_request');
  let body: RequestBody;
  try {
    body = JSON.parse(raw) as RequestBody;
  } catch {
    return fail(400, 'bad_request');
  }

  const email = typeof body.email === 'string' ? body.email.trim().toLowerCase() : '';
  if (email.length < 3 || email.length > 254 || !email.includes('@')) return fail(400, 'email_address_invalid');
  const password = str(body.password, MAX_PASSWORD);
  if (!password) return fail(400, body.action === 'sign-in' ? 'invalid_credentials' : 'weak_password');

  const forwarded = req.headers.get('x-forwarded-for')?.split(',')[0]?.trim() ?? '';
  const ip = /^[0-9a-fA-F:.]{3,45}$/.test(forwarded) ? forwarded : null;

  try {
    switch (body.action) {
      case 'sign-in':
        return await signIn(email, password, ip);
      case 'sign-up':
        return await signUp(body, email, password, ip);
      case 'reset':
        return await reset(body, email, password, ip);
      default:
        return fail(400, 'bad_request');
    }
  } catch (e) {
    console.error('[auth-password] failed', e instanceof Error ? e.message : 'unknown');
    return fail(503, 'unavailable');
  }
});
