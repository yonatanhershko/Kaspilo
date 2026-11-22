/**
 * apple-revoke: before an Apple user deletes their account, revoke the app's access
 * at Apple (App Store guideline 5.1.1(v); docs/spec.md "Auth", Apple sign-in).
 *
 *   POST { code }   code = a fresh `authorizationCode` from Apple's sheet on the phone
 *   -> { revoked: true }
 *
 * Steps: check the caller's session -> trade the code at Apple for a refresh token ->
 * make sure Apple's answer is for this same user -> revoke that token.
 * Nothing is stored. The account itself is then deleted by public.delete_account().
 *
 * Signed-in endpoint (verify_jwt on). Secrets: APPLE_TEAM_ID, APPLE_KEY_ID,
 * APPLE_PRIVATE_KEY (the .p8 file's text), APPLE_CLIENT_ID (the app's bundle ID).
 * Never logs codes, tokens or emails.
 */

const SUPABASE_URL = Deno.env.get('SUPABASE_URL') ?? '';
const TEAM_ID = Deno.env.get('APPLE_TEAM_ID') ?? '';
const KEY_ID = Deno.env.get('APPLE_KEY_ID') ?? '';
const PRIVATE_KEY = Deno.env.get('APPLE_PRIVATE_KEY') ?? '';
const CLIENT_ID = Deno.env.get('APPLE_CLIENT_ID') ?? '';
const APPLE = 'https://appleid.apple.com';

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
const reply = (status: number, body: unknown) =>
  new Response(JSON.stringify(body), { status, headers: { ...cors, 'Content-Type': 'application/json' } });
const fail = (status: number, code: string) => reply(status, { code });

const enc = new TextEncoder();
const b64url = (bytes: Uint8Array) =>
  btoa(String.fromCharCode(...bytes)).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');

/** Apple's client secret: a short-lived ES256 JWT signed with the .p8 key. */
async function clientSecret(): Promise<string> {
  const pem = PRIVATE_KEY.replace(/\\n/g, '\n').replace(/-----[^-]+-----/g, '').replace(/\s+/g, '');
  const der = Uint8Array.from(atob(pem), (c) => c.charCodeAt(0));
  const key = await crypto.subtle.importKey('pkcs8', der, { name: 'ECDSA', namedCurve: 'P-256' }, false, ['sign']);
  const now = Math.floor(Date.now() / 1000);
  const head = b64url(enc.encode(JSON.stringify({ alg: 'ES256', kid: KEY_ID })));
  const body = b64url(
    enc.encode(JSON.stringify({ iss: TEAM_ID, iat: now, exp: now + 300, aud: APPLE, sub: CLIENT_ID })),
  );
  // WebCrypto gives ECDSA as raw r||s, which is what a JWT wants.
  const sig = await crypto.subtle.sign({ name: 'ECDSA', hash: 'SHA-256' }, key, enc.encode(`${head}.${body}`));
  return `${head}.${body}.${b64url(new Uint8Array(sig))}`;
}

/** The Apple user id (`sub`) of the signed-in caller, or null. */
async function callerAppleId(authorization: string): Promise<string | null> {
  const res = await fetch(`${SUPABASE_URL}/auth/v1/user`, {
    headers: { apikey: SECRET, Authorization: authorization },
  });
  if (!res.ok) return null;
  const user = (await res.json()) as { identities?: { provider?: string; identity_data?: { sub?: string } }[] };
  const apple = user.identities?.find((i) => i.provider === 'apple');
  return apple?.identity_data?.sub ?? null;
}

function tokenSub(idToken: string): string | null {
  try {
    const part = idToken.split('.')[1].replace(/-/g, '+').replace(/_/g, '/');
    return (JSON.parse(atob(part)) as { sub?: string }).sub ?? null;
  } catch {
    return null;
  }
}

/**
 * Why Apple refused, safe to log: Apple's error name (invalid_client, invalid_grant…),
 * the bundle ID in use, and only the length of the Team and Key IDs (both are 10).
 */
async function appleError(res: Response): Promise<string> {
  let name = 'unknown';
  try {
    const body = (await res.json()) as { error?: unknown };
    if (typeof body.error === 'string') name = body.error.replace(/[^a-z_]/gi, '').slice(0, 40);
  } catch {
    // not JSON: keep "unknown"
  }
  return `${res.status} ${name} (client_id=${CLIENT_ID}, team_id_len=${TEAM_ID.length}, key_id_len=${KEY_ID.length})`;
}

const form = (values: Record<string, string>) => ({
  method: 'POST',
  headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
  body: new URLSearchParams(values),
});

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: cors });
  if (req.method !== 'POST') return fail(405, 'method');
  if (!TEAM_ID || !KEY_ID || !PRIVATE_KEY || !CLIENT_ID || !SECRET) {
    console.error('[apple-revoke] not configured: APPLE_TEAM_ID, APPLE_KEY_ID, APPLE_PRIVATE_KEY, APPLE_CLIENT_ID');
    return fail(500, 'not_configured');
  }

  try {
    const authorization = req.headers.get('Authorization') ?? '';
    const code = ((await req.json().catch(() => ({}))) as { code?: unknown }).code;
    if (typeof code !== 'string' || code.length < 10 || code.length > 512) return fail(400, 'bad_request');

    const appleId = await callerAppleId(authorization);
    if (!appleId) return fail(403, 'not_apple_user');

    const secret = await clientSecret();
    const token = await fetch(
      `${APPLE}/auth/token`,
      form({ grant_type: 'authorization_code', code, client_id: CLIENT_ID, client_secret: secret }),
    );
    if (!token.ok) {
      console.warn('[apple-revoke] code refused by Apple', await appleError(token));
      return fail(400, 'code_refused');
    }
    const tokens = (await token.json()) as { refresh_token?: string; access_token?: string; id_token?: string };
    // The code must belong to this same user, not to some other Apple account.
    if (!tokens.id_token || tokenSub(tokens.id_token) !== appleId) return fail(403, 'other_user');

    const [value, hint] = tokens.refresh_token
      ? [tokens.refresh_token, 'refresh_token']
      : [tokens.access_token ?? '', 'access_token'];
    const revoke = await fetch(
      `${APPLE}/auth/revoke`,
      form({ token: value, token_type_hint: hint, client_id: CLIENT_ID, client_secret: secret }),
    );
    if (!revoke.ok) {
      console.warn('[apple-revoke] revoke refused by Apple', await appleError(revoke));
      return fail(502, 'revoke_failed');
    }
    return reply(200, { revoked: true });
  } catch (e) {
    console.error('[apple-revoke] failed', e instanceof Error ? e.message : 'unknown');
    return fail(500, 'failed');
  }
});
