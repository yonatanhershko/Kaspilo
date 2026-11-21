/**
 * Password lock and request-limit tests (docs/spec.md "Sign-in" password protection,
 * "Request limits").
 *   npm run test:db
 *
 * Needs the `auth-password` Edge Function with its server secret. Outside CI, when the
 * function is not ready, the file is skipped. Parts that need the secret key (expire a
 * lock, make a reset code, set a counter) run only where SERVICE_ROLE_KEY / SECRET_KEY
 * is in the environment, i.e. CI's throwaway Supabase.
 * In CI it also creates a throwaway user auth-test-*@finny.test and deletes it at the end.
 * Elsewhere it creates no account and locks only a made-up email.
 */
import { createHash, randomBytes } from 'node:crypto';
import { readFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import { fileURLToPath } from 'node:url';

import { passwordAuth, signInThroughFunction } from './signin.mjs';

const root = fileURLToPath(new URL('../..', import.meta.url)).replace(/\/$/, '');
const require = createRequire(root + '/apps/web/package.json');
const { createClient } = require('@supabase/supabase-js');

const envText = readFileSync(root + '/apps/web/.env.development', 'utf8');
const env = Object.fromEntries(envText.split('\n').filter((l) => l.includes('=') && !l.startsWith('#')).map((l) => [l.slice(0, l.indexOf('=')), l.slice(l.indexOf('=') + 1)]));
const creds = Object.fromEntries(
  readFileSync(root + '/supabase/seed/dev-users.local.md', 'utf8').split('\n').filter((l) => l.includes('@finny.test')).map((l) => l.split('|').map((c) => c.trim())).map((c) => [c[3].split('@')[0].replace('dev-', ''), { email: c[3], password: c[4] }]),
);
const URL_ = env.NEXT_PUBLIC_SUPABASE_URL;
const KEY = env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY;
const SERVICE = process.env.SECRET_KEY || process.env.SERVICE_ROLE_KEY || '';

let pass = 0, fail = 0;
const check = (name, ok, extra = '') => { ok ? pass++ : fail++; console.log(`${ok ? 'PASS' : 'FAIL'}  ${name}${extra ? '  -> ' + extra : ''}`); };
const call = (payload) => passwordAuth(URL_, KEY, payload);
const hashOf = (email) => createHash('sha256').update(email.toLowerCase()).digest('hex');

// Ready?
{
  const probe = await call({ action: 'sign-in', email: 'probe-' + Date.now() + '@finny.test', password: 'x' });
  if (probe.status === 404 || probe.body.code === 'not_configured') {
    if (process.env.CI) {
      console.log(`FAIL  auth-password is not running: ${probe.status} ${probe.body.code ?? ''}`);
      process.exit(1);
    }
    console.log(`SKIP  auth-password not ready on this project (${probe.status} ${probe.body.code ?? ''})`);
    process.exit(0);
  }
  // the probe counted one wrong try for a throwaway email; harmless
}

const stamp = Date.now();
const email = `auth-test-${stamp}@finny.test`;
const password = 'Kt-' + randomBytes(12).toString('base64url');

// --- refused before any account is made (safe anywhere) ---------------------------------
{
  const short = await call({ action: 'sign-up', email: `auth-short-${stamp}@finny.test`, password: 'abc', fullName: 'Short Test', termsVersion: '2026-11-20' });
  check('sign-up refuses a password under 8 characters', short.status === 422 && short.body.code === 'weak_password', `${short.status} ${short.body.code}`);
  const leak = await call({ action: 'sign-up', email: `auth-leak-${stamp}@finny.test`, password: 'password123', fullName: 'Leak Test', termsVersion: '2026-11-20' });
  check('sign-up refuses a leaked password (HaveIBeenPwned)', leak.status === 422 && leak.body.code === 'password_leaked', `${leak.status} ${leak.body.code}`);
}

// --- the stored password is not the real one (test user, moved over by its first sign-in) ---
{
  await signInThroughFunction(createClient, URL_, KEY, creds.pending);
  const direct = createClient(URL_, KEY, { auth: { persistSession: false } });
  const { error } = await direct.auth.signInWithPassword(creds.pending);
  check('the real password sent straight to Supabase Auth does not work', error?.code === 'invalid_credentials', error?.code ?? 'signed in!');
}

// --- an email with no account: 5 wrong -> locked (no account is touched) ---------------------
const ghost = `nobody-${stamp}@finny.test`;
{
  const codes = [];
  for (let i = 0; i < 5; i++) {
    const r = await call({ action: 'sign-in', email: ghost, password: 'guess-' + i });
    codes.push(`${r.status}:${r.body.code}${r.body.retry_after ? '/' + r.body.retry_after : ''}`);
  }
  check('wrong passwords 1-4 answer "wrong email or password"', codes.slice(0, 4).every((c) => c.startsWith('400:invalid_credentials')), codes.join(' '));
  check('the 5th wrong password locks for 15 minutes', /^429:locked\/(89\d|900)$/.test(codes[4]), codes[4]);
  const sixth = await call({ action: 'sign-in', email: ghost, password: 'guess-5' });
  check('while locked, further tries are refused without checking', sixth.status === 429 && sixth.body.code === 'locked', `${sixth.status} ${sixth.body.code}`);
}

// --- parts that need the secret key (CI) -------------------------------------------
if (!SERVICE) {
  console.log('SKIP  lock expiry, reset, request limits (no secret key here; they run in CI)');
} else {
  const admin = createClient(URL_, SERVICE, { auth: { persistSession: false, autoRefreshToken: false } });

  // A real new account through the function.
  const ok = await call({ action: 'sign-up', email, password, fullName: 'Auth Test', termsVersion: '2026-11-20' });
  check('sign-up through the function returns a session', ok.status === 200 && !!ok.body.session?.access_token, `${ok.status} ${ok.body.code ?? ''}`);
  if (ok.body.session) {
    const c = createClient(URL_, KEY, { auth: { persistSession: false } });
    const { data } = await c.auth.setSession(ok.body.session);
    check('sign-up saved the name and the terms version', data.user?.user_metadata?.full_name === 'Auth Test' && data.user?.user_metadata?.terms_version === '2026-11-20');
  }
  const viaFn = await call({ action: 'sign-in', email, password });
  check('its password works through the function', viaFn.status === 200 && !!viaFn.body.session?.access_token, `${viaFn.status} ${viaFn.body.code ?? ''}`);
  const directNew = await createClient(URL_, KEY, { auth: { persistSession: false } }).auth.signInWithPassword({ email, password });
  check('and not straight to Supabase Auth', directNew.error?.code === 'invalid_credentials', directNew.error?.code ?? 'signed in!');
  let lastWrong;
  for (let i = 0; i < 5; i++) lastWrong = await call({ action: 'sign-in', email, password: 'wrong-' + i });
  check('a real account locks after 5 wrong passwords', lastWrong.status === 429 && lastWrong.body.code === 'locked', `${lastWrong.status} ${lastWrong.body.code}`);
  const right = await call({ action: 'sign-in', email, password });
  check('during the lock even the right password is refused', right.status === 429 && right.body.code === 'locked', `${right.status} ${right.body.code}`);

  // Lock ends after its time.
  await admin.from('auth_password_attempts').update({ locked_until: new Date(Date.now() - 1000).toISOString() }).eq('email_hash', hashOf(ghost));
  const after = await call({ action: 'sign-in', email: ghost, password: 'guess-again' });
  check('after the lock time, tries are allowed again', after.status === 400 && after.body.code === 'invalid_credentials', `${after.status} ${after.body.code}`);

  // Reset with the emailed code works during a lock and clears it.
  const link = await admin.auth.admin.generateLink({ type: 'recovery', email });
  const code = link.data?.properties?.email_otp;
  const newPassword = 'Kn-' + randomBytes(12).toString('base64url');
  const leakReset = await call({ action: 'reset', email, code, password: 'password123' });
  check('reset refuses a leaked new password (and keeps the code)', leakReset.status === 422 && leakReset.body.code === 'password_leaked', `${leakReset.status} ${leakReset.body.code}`);
  const reset = await call({ action: 'reset', email, code, password: newPassword });
  check('reset with the code works during a lock', reset.status === 200 && !!reset.body.session?.access_token, `${reset.status} ${reset.body.code ?? ''}`);
  const signedIn = await call({ action: 'sign-in', email, password: newPassword });
  check('after the reset the lock is gone and the new password works', signedIn.status === 200, `${signedIn.status} ${signedIn.body.code ?? ''}`);
  const badCode = await call({ action: 'reset', email, code: '000000', password: newPassword + 'x' });
  check('a wrong reset code is refused', badCode.status >= 400 && badCode.status < 500, `${badCode.status} ${badCode.body.code}`);

  // Request limits, as the active test user.
  const active = await signInThroughFunction(createClient, URL_, KEY, creds.active);
  const clearCounters = () => admin.from('rate_counters').delete().eq('user_id', active.id);
  const counter = async (action, windowSeconds) =>
    (await admin.from('rate_counters').select('hits').eq('user_id', active.id).eq('action', action).eq('window_seconds', windowSeconds).maybeSingle()).data?.hits ?? 0;
  const windowStart = (s) => new Date(Math.floor(Date.now() / 1000 / s) * s * 1000).toISOString();
  const wallet = (await active.c.from('wallets').select('id').order('sort_order').limit(1).single()).data.id;
  const category = (await active.c.from('categories').select('id').eq('wallet_id', wallet).eq('type', 'expense').limit(1).single()).data.id;
  const row = () => ({ type: 'expense', amount: 100, description: 'zz-rate-' + stamp, date: '2026-11-01', category_id: category, wallet_id: wallet });

  await clearCounters();
  const one = await active.c.from('transactions').insert(row()).select('id');
  check('a save counts once per minute and per day', !one.error && (await counter('transactions', 60)) === 1 && (await counter('transactions', 86400)) === 1, one.error?.message);

  const plan = await active.c.rpc('create_installments', { p_type: 'expense', p_category_id: category, p_description: 'zz-rate-' + stamp, p_total: 1200, p_count: 12, p_first_date: '2026-11-01' });
  check('an installments plan of 12 is one save and 12 rows', !plan.error && (await counter('transactions', 60)) === 2 && (await counter('transaction_rows', 86400)) === 13, plan.error?.message);

  // Day limit reached: the next save is refused with 429 and nothing is saved.
  await admin.from('rate_counters').update({ hits: 2000, window_start: windowStart(86400) }).eq('user_id', active.id).eq('action', 'transactions').eq('window_seconds', 86400);
  const before = (await active.c.from('transactions').select('id', { count: 'exact', head: true }).eq('description', 'zz-rate-' + stamp)).count;
  const over = await active.c.from('transactions').insert(row()).select('id');
  const afterCount = (await active.c.from('transactions').select('id', { count: 'exact', head: true }).eq('description', 'zz-rate-' + stamp)).count;
  check('over the daily limit the server answers 429 and saves nothing', over.status === 429 && afterCount === before, `${over.status} ${over.error?.code} ${before}->${afterCount}`);

  // Minute limit.
  await clearCounters();
  await admin.from('rate_counters').insert({ user_id: active.id, action: 'goals', window_seconds: 60, window_start: windowStart(60), hits: 30 });
  const goal = await active.c.from('goals').insert({ name: 'zz-rate-' + stamp, target_amount: 1000, wallet_id: wallet }).select('id');
  check('31st new goal in a minute is refused (429)', goal.status === 429, `${goal.status} ${goal.error?.code}`);

  // Push tokens: the same token again is free; a new one over 10 an hour is refused.
  await clearCounters();
  const tokenA = `ExponentPushToken[zzrate${stamp}a]`;
  const regA = await active.c.rpc('register_push_token', { p_token: tokenA, p_platform: 'ios', p_language: 'he', p_subscription_reminders: true });
  await admin.from('rate_counters').update({ hits: 10, window_start: windowStart(3600) }).eq('user_id', active.id).eq('action', 'push_token').eq('window_seconds', 3600);
  const regAgain = await active.c.rpc('register_push_token', { p_token: tokenA, p_platform: 'ios', p_language: 'en', p_subscription_reminders: true });
  const regB = await active.c.rpc('register_push_token', { p_token: `ExponentPushToken[zzrate${stamp}b]`, p_platform: 'ios', p_language: 'he', p_subscription_reminders: true });
  check('updating this phone\'s own token is not limited', !regA.error && !regAgain.error, regA.error?.message ?? regAgain.error?.message);
  check('an 11th new token in an hour is refused (429)', regB.status === 429, `${regB.status} ${regB.error?.code}`);

  // Clean up.
  await active.c.rpc('unregister_push_token', { p_token: tokenA });
  const rules = (await active.c.from('recurring_rules').select('id').eq('description', 'zz-rate-' + stamp)).data ?? [];
  await active.c.from('transactions').delete().eq('description', 'zz-rate-' + stamp);
  for (const r of rules) await active.c.from('recurring_rules').delete().eq('id', r.id);
  await clearCounters();
  await admin.from('auth_password_attempts').delete().in('email_hash', [hashOf(email), hashOf(ghost)]);
  for (const e of [email, ghost]) {
    const u = (await admin.auth.admin.listUsers({ perPage: 1000 })).data?.users?.find((x) => x.email === e);
    if (u) await admin.auth.admin.deleteUser(u.id);
  }
}

console.log(`\n${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
