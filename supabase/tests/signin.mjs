/**
 * Sign-in for the DB tests, the way the app does it: through the `auth-password`
 * Edge Function (docs/spec.md "Sign-in", password protection). Returns a supabase-js
 * client with the session, and the user id.
 *
 * Outside CI, when the function is not deployed yet (404) or has no server secret
 * (503 not_configured), falls back to signing in straight with Supabase Auth, so the
 * tests still run against a project that is mid-setup. In CI it never falls back.
 */
export async function signInThroughFunction(createClient, url, publishableKey, cred) {
  const c = createClient(url, publishableKey, { auth: { persistSession: false, autoRefreshToken: false } });
  const res = await fetch(`${url}/functions/v1/auth-password`, {
    method: 'POST',
    headers: { apikey: publishableKey, 'Content-Type': 'application/json' },
    body: JSON.stringify({ action: 'sign-in', email: cred.email, password: cred.password }),
  });
  const body = await res.json().catch(() => ({}));
  if (res.ok && body.session) {
    const { data, error } = await c.auth.setSession(body.session);
    if (error) throw new Error(`setSession failed: ${error.message}`);
    return { c, id: data.user.id };
  }
  const notReady = res.status === 404 || body.code === 'not_configured';
  if (notReady && !process.env.CI) {
    console.log(`(auth-password not ready on this project: ${res.status} ${body.code ?? ''}; signing in directly)`);
    const { data, error } = await c.auth.signInWithPassword(cred);
    if (error) throw new Error(`sign-in failed: ${error.message}`);
    return { c, id: data.user.id };
  }
  throw new Error(`sign-in through auth-password failed: ${res.status} ${body.code ?? ''}`);
}

/** Calls the function and returns { status, body }. */
export async function passwordAuth(url, publishableKey, payload) {
  const res = await fetch(`${url}/functions/v1/auth-password`, {
    method: 'POST',
    headers: { apikey: publishableKey, 'Content-Type': 'application/json' },
    body: JSON.stringify(payload),
  });
  return { status: res.status, body: await res.json().catch(() => ({})) };
}
