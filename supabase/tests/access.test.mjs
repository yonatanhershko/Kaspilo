/**
 * Access-rule tests against the DEV Supabase API, using only the publishable key
 * and the dev test users (supabase/seed/dev-users.local.md).
 *
 *   npm run test:db
 *
 * Side effect: the lifecycle section approves the "pending" dev user. Put it back with:
 *   update public.profiles set status='pending_approval', plan=null, approved_at=null,
 *     expires_at=null, grant_expires_at=null, access_via=null where email='dev-pending@finny.test';
 */
import { readFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import { fileURLToPath } from 'node:url';

import { signInThroughFunction } from './signin.mjs';
const root = fileURLToPath(new URL('../..', import.meta.url)).replace(/\/$/, '');
const require = createRequire(root + '/apps/web/package.json');
const { createClient } = require('@supabase/supabase-js');

const envText = readFileSync(root + '/apps/web/.env.development', 'utf8');
const env = Object.fromEntries(envText.split('\n').filter((l) => l.includes('=') && !l.startsWith('#')).map((l) => [l.slice(0, l.indexOf('=')), l.slice(l.indexOf('=') + 1)]));
const creds = Object.fromEntries(
  readFileSync(root + '/supabase/seed/dev-users.local.md', 'utf8').split('\n').filter((l) => l.includes('@finny.test')).map((l) => l.split('|').map((c) => c.trim())).map((c) => [c[3].split('@')[0].replace('dev-', ''), { email: c[3], password: c[4] }]),
);

let pass = 0, fail = 0;
const check = (name, ok, extra = '') => { ok ? pass++ : fail++; console.log(`${ok ? 'PASS' : 'FAIL'}  ${name}${extra ? '  -> ' + extra : ''}`); };

// The way the app signs in: through the auth-password Edge Function.
const as = (who) => signInThroughFunction(createClient, env.NEXT_PUBLIC_SUPABASE_URL, env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY, creds[who]);

const anon = createClient(env.NEXT_PUBLIC_SUPABASE_URL, env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY, { auth: { persistSession: false } });
{
  const { data, error } = await anon.from('profiles').select('id');
  check('anon cannot read profiles', !!error || (data ?? []).length === 0, error?.code);
  const r = await anon.rpc('admin_dashboard_stats');
  check('anon cannot call admin_dashboard_stats', !!r.error, r.error?.code);
}

const admin = await as('admin');
const active = await as('active');
const pending = await as('pending');
const expired = await as('expired');
check('all four dev users can sign in', true);

{
  const { data } = await active.c.from('profiles').select('id,email');
  check('client sees only own profile', data?.length === 1 && data[0].id === active.id, `rows=${data?.length}`);
}
{
  const { data } = await admin.c.from('profiles').select('id');
  check('admin sees all profiles', (data?.length ?? 0) >= 4, `rows=${data?.length}`);
}
for (const col of [{ role: 'admin' }, { status: 'active' }, { plan: 'family' }, { expires_at: '2099-01-01' }, { approved_at: '2020-01-01' }]) {
  const { error } = await pending.c.from('profiles').update(col).eq('id', pending.id);
  check(`client cannot update own ${Object.keys(col)[0]}`, !!error, error?.code);
}
{
  const { error } = await active.c.from('profiles').update({ full_name: 'Hacked' }).eq('id', pending.id).select();
  const { data } = await admin.c.from('profiles').select('full_name').eq('id', pending.id).single();
  check("client cannot update another user's name", data?.full_name === 'Omer Cohen', error?.code ?? `name=${data?.full_name}`);
}
{
  const { error } = await active.c.from('profiles').update({ full_name: 'Noa Levi' }).eq('id', active.id);
  check('client can update own full_name', !error, error?.message);
}
{
  const { error } = await active.c.from('profiles').insert({ id: '00000000-0000-0000-0000-000000000001', email: 'x@x.x' });
  check('client cannot insert a profile', !!error, error?.code);
  const d = await active.c.from('profiles').delete().eq('id', active.id).select();
  check('client cannot delete a profile', !!d.error || (d.data ?? []).length === 0, d.error?.code);
}
for (const [fn, args] of [['admin_approve_user', { p_user_id: pending.id }], ['admin_reject_user', { p_user_id: pending.id }], ['admin_extend_user', { p_user_id: active.id }], ['admin_set_plan', { p_user_id: active.id, p_plan: 'family' }], ['admin_dashboard_stats', {}]]) {
  const { error } = await pending.c.rpc(fn, args);
  check(`non-admin cannot call ${fn}`, error?.code === '42501', error?.code);
}
{
  const r = await pending.c.rpc('expire_subscriptions');
  check('client cannot call expire_subscriptions', !!r.error, r.error?.code);
  const e = await active.c.from('subscription_events').select('id');
  check('client cannot read subscription_events', (e.data ?? []).length === 0, `rows=${e.data?.length}`);
}
{
  const a = await active.c.rpc('has_access'); const p = await pending.c.rpc('has_access'); const x = await expired.c.rpc('has_access'); const ad = await admin.c.rpc('has_access');
  check('has_access: active=true pending=false expired=false admin=true', a.data === true && p.data === false && x.data === false && ad.data === true, `${a.data},${p.data},${x.data},${ad.data}`);
}
{
  const { data, error } = await admin.c.rpc('admin_dashboard_stats');
  check('admin gets dashboard stats', !error && typeof data?.total_users === 'number', JSON.stringify(data));
}
// In-app purchase (2026-11-24): store state is server-only, admin grants are admin-only,
// and a locked user can still export their own rows.
for (const [fn, args] of [['admin_grant_access', { p_user_id: pending.id, p_plan: 'family' }], ['admin_revoke_access', { p_user_id: active.id }]]) {
  const { error } = await pending.c.rpc(fn, args);
  check(`non-admin cannot call ${fn}`, error?.code === '42501', error?.code);
}
{
  const r = await active.c.rpc('store_apply', { p_user_id: active.id, p_state: { store: 'app_store', product_id: 'x', period_type: 'normal', expires_at: '2099-01-01' } });
  check('client cannot call store_apply', !!r.error, r.error?.code);
  const ins = await active.c.from('store_subscriptions').insert({ user_id: active.id, store: 'app_store', product_id: 'x', period_type: 'normal', expires_at: '2099-01-01' });
  check('client cannot write store_subscriptions', !!ins.error, ins.error?.code);
  const all = await admin.c.from('store_subscriptions').select('user_id');
  const own = await active.c.from('store_subscriptions').select('user_id');
  check('client reads only own store row', (own.data ?? []).every((r) => r.user_id === active.id), `rows=${own.data?.length} of ${all.data?.length}`);
  const g = await pending.c.from('profiles').update({ grant_expires_at: '2099-01-01' }).eq('id', pending.id);
  check('client cannot update own grant_expires_at', !!g.error, g.error?.code);
}
{
  const ex = await expired.c.rpc('export_my_rows', { p_limit: 10 });
  check('locked (expired) user can export own rows', !ex.error && Array.isArray(ex.data), ex.error?.message);
  const tx = await expired.c.from('transactions').select('id').limit(1);
  check('locked user still cannot read transactions directly', (tx.data ?? []).length === 0, `rows=${tx.data?.length}`);
  const an = await anon.rpc('export_my_rows', {});
  check('anon cannot export', !!an.error, an.error?.code);
  const bad = await expired.c.rpc('export_my_rows', { p_limit: 5000 });
  check('export page size is capped', bad.error?.code === '22023', bad.error?.code);
}
// lifecycle on the pending user, then put it back
{
  const rej = await admin.c.rpc('admin_reject_user', { p_user_id: pending.id });
  check('admin rejects pending user', rej.data?.status === 'rejected', rej.error?.message);
  const again = await pending.c.rpc('request_approval');
  check('rejected user can ask again', again.data?.status === 'pending_approval', again.error?.message);
  const twice = await pending.c.rpc('request_approval');
  check('pending user cannot "ask again"', !!twice.error, twice.error?.code);
  const ap = await admin.c.rpc('admin_approve_user', { p_user_id: pending.id, p_plan: 'paid' });
  const days = (new Date(ap.data?.expires_at) - new Date(ap.data?.approved_at)) / 86400000;
  check('approve -> active, expires 365 days after approval', ap.data?.status === 'active' && Math.abs(days - 365) < 0.01, `days=${days}`);
  const ext = await admin.c.rpc('admin_extend_user', { p_user_id: pending.id });
  const extDays = (new Date(ext.data?.expires_at) - new Date(ap.data?.expires_at)) / 86400000;
  check('extend adds 365 days to the existing expiry', Math.abs(extDays - 365) < 0.01, `days=${extDays}`);
  const fam = await admin.c.rpc('admin_set_plan', { p_user_id: pending.id, p_plan: 'family' });
  check('family plan has no expiry', fam.data?.plan === 'family' && fam.data?.expires_at === null);
  const acc = await pending.c.rpc('has_access');
  check('approved user now has access', acc.data === true);
  const rv = await admin.c.rpc('admin_revoke_access', { p_user_id: pending.id, p_note: 'test' });
  const after = await pending.c.rpc('has_access');
  check('revoke admin access -> expired, no access', rv.data?.status === 'expired' && rv.data?.plan === null && after.data === false, rv.error?.message ?? rv.data?.status);
  const gr = await admin.c.rpc('admin_grant_access', { p_user_id: pending.id, p_plan: 'vip', p_months: 1, p_note: 'test gift' });
  const grDays = (new Date(gr.data?.expires_at) - Date.now()) / 86400000;
  check('grant 1 month -> active via grant, about 28-31 days', gr.data?.status === 'active' && gr.data?.access_via === 'grant' && grDays > 27 && grDays < 32, gr.error?.message ?? `days=${grDays}`);
  const both = await admin.c.rpc('admin_grant_access', { p_user_id: pending.id, p_plan: 'paid', p_months: 1, p_until: '2099-01-01' });
  check('grant with months and a date is refused', both.error?.code === '22023', both.error?.code);
}
console.log(`\n${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
