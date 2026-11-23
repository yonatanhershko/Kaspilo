/**
 * Money-table tests against the DEV Supabase API with the dev test users.
 *   npm run test:db
 * Creates rows for the "active" dev user and deletes them again at the end.
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

const active = await as('active');
const admin = await as('admin');
const pending = await as('pending');
const expired = await as('expired');
const TAG = 'zz-test-' + Date.now();
const made = { tx: [], rules: [], goals: [] };

// --- defaults ---
const cats = (await active.c.from('categories').select('*')).data ?? [];
check('new account has 8 expense + 2 income default categories', cats.filter((c) => c.type === 'expense').length >= 8 && cats.filter((c) => c.type === 'income').length >= 2, `rows=${cats.length}`);
const settings = (await active.c.from('user_settings').select('*').single()).data;
check('settings row exists with defaults', settings?.currency === 'ILS' || settings?.currency === 'USD', JSON.stringify(settings?.month_start_day));
const car = cats.find((c) => c.default_key === 'car');
const adminCats = (await admin.c.from('categories').select('id,user_id')).data ?? [];
check('each user sees only own categories', cats.every((c) => c.user_id === active.id) && adminCats.every((c) => c.user_id === admin.id));

// --- locked users ---
for (const [name, u] of [['pending', pending], ['expired', expired]]) {
  const sel = await u.c.from('categories').select('id');
  const tx = await u.c.from('transactions').select('id');
  const st = await u.c.from('user_settings').select('user_id');
  check(`${name} user reads no financial rows`, (sel.data ?? []).length === 0 && (tx.data ?? []).length === 0 && (st.data ?? []).length === 0);
  const ins = await u.c.from('categories').insert({ type: 'expense', name: TAG });
  check(`${name} user cannot insert a category`, !!ins.error, ins.error?.code);
  const g = await u.c.from('goals').insert({ name: TAG, target_amount: 1000 });
  check(`${name} user cannot insert a goal`, !!g.error, g.error?.code);
  const r = await u.c.rpc('category_totals', { p_from: '2000-01-01', p_to: '2100-01-01' });
  check(`${name} user gets no totals`, (r.data ?? []).length === 0);
}

// --- transactions ---
{
  const ins = await active.c.from('transactions').insert({ type: 'expense', amount: 25000, description: TAG, date: '2031-03-10', category_id: car.id }).select().single();
  check('active user adds a transaction', !ins.error && ins.data?.amount === 25000, ins.error?.message);
  if (ins.data) made.tx.push(ins.data.id);
  const seen = await admin.c.from('transactions').select('id').eq('id', ins.data?.id);
  check("another user (even admin) cannot read it", (seen.data ?? []).length === 0);
  const upd = await admin.c.from('transactions').update({ amount: 1 }).eq('id', ins.data?.id).select();
  const del = await admin.c.from('transactions').delete().eq('id', ins.data?.id).select();
  check('another user cannot update or delete it', (upd.data ?? []).length === 0 && (del.data ?? []).length === 0);
  for (const bad of [0, -100]) {
    const r = await active.c.from('transactions').insert({ type: 'expense', amount: bad, date: '2031-03-10', category_id: car.id });
    check(`amount ${bad} is rejected`, !!r.error, r.error?.code);
  }
  const foreign = await active.c.from('transactions').insert({ type: 'expense', amount: 100, date: '2031-03-10', category_id: adminCats[0].id });
  check("cannot use another user's category", !!foreign.error, foreign.error?.code);
  const spoof = await active.c.from('transactions').insert({ type: 'expense', amount: 100, date: '2031-03-10', category_id: car.id, user_id: admin.id });
  check('cannot insert a row for another user', !!spoof.error, spoof.error?.code);
}

// --- installments ---
{
  const r = await active.c.rpc('create_installments', { p_type: 'expense', p_category_id: car.id, p_description: TAG, p_total: 10000, p_count: 3, p_first_date: '2031-01-31' });
  check('create installments', !r.error, r.error?.message);
  if (r.data) made.rules.push(r.data);
  const rows = (await active.c.from('transactions').select('amount,date').eq('recurring_rule_id', r.data).order('date')).data ?? [];
  check('3 payments: 3334 + 3333 + 3333 = 10000', rows.map((x) => x.amount).join(',') === '3334,3333,3333', rows.map((x) => x.amount).join(','));
  check('monthly dates from the 31st stay on month ends', rows.map((x) => x.date).join(',') === '2031-01-31,2031-02-28,2031-03-31', rows.map((x) => x.date).join(','));
  const small = await active.c.rpc('create_installments', { p_type: 'expense', p_category_id: car.id, p_description: TAG, p_total: 2, p_count: 5, p_first_date: '2031-01-01' });
  check('total smaller than the payment count is rejected', !!small.error, small.error?.code);
}

// --- recurring ---
{
  const today = new Date();
  const start = new Date(today.getFullYear(), today.getMonth() - 2, Math.min(today.getDate(), 28));
  const iso = (d) => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
  const r = await active.c.rpc('create_recurring', { p_type: 'expense', p_category_id: car.id, p_description: TAG, p_amount: 5000, p_frequency: 'monthly', p_start_date: iso(start) });
  check('create recurring', !r.error, r.error?.message);
  if (r.data) made.rules.push(r.data);
  const rows = (await active.c.from('transactions').select('date').eq('recurring_rule_id', r.data)).data ?? [];
  check('recurring started 2 months ago has 3 occurrences up to today', rows.length === 3, `rows=${rows.length}`);
  const again = await active.c.rpc('materialize_recurring');
  check('running it again adds nothing', again.data === 0, `added=${again.data}`);
}

// --- totals ---
{
  const t = await active.c.rpc('category_totals', { p_from: '2031-01-01', p_to: '2031-03-31' });
  const row = (t.data ?? []).find((x) => x.category_id === car.id);
  check('category_totals sums the range: 25000 + 10000', row?.total === 35000, `total=${row?.total}`);
}

// --- settings ---
{
  const ok = await active.c.from('user_settings').update({ month_start_day: 31 }).eq('user_id', active.id).select().single();
  check('start day 31 is accepted', ok.data?.month_start_day === 31, ok.error?.message);
  const bad = await active.c.from('user_settings').update({ month_start_day: 32 }).eq('user_id', active.id);
  check('start day 32 is rejected', !!bad.error, bad.error?.code);
  const cur = await active.c.from('user_settings').update({ currency: 'EUR' }).eq('user_id', active.id);
  check('unknown currency is rejected', !!cur.error, cur.error?.code);
  const other = await active.c.from('user_settings').update({ currency: 'USD' }).eq('user_id', admin.id).select();
  check("cannot change another user's settings", (other.data ?? []).length === 0);
  await active.c.from('user_settings').update({ month_start_day: settings.month_start_day }).eq('user_id', active.id);
}

// --- goals ---
{
  const g = await active.c.from('goals').insert({ name: TAG, target_amount: 2000000 }).select().single();
  check('create a goal', !g.error, g.error?.message);
  if (g.data) made.goals.push(g.data.id);
  await active.c.from('goal_deposits').insert([{ goal_id: g.data.id, amount: 50000 }, { goal_id: g.data.id, amount: 70000 }]);
  const totals = (await active.c.rpc('goal_totals')).data ?? [];
  check('goal saved = sum of deposits', totals.find((x) => x.goal_id === g.data.id)?.saved === 120000);
  const expenseTotals = (await active.c.rpc('category_totals', { p_from: '2000-01-01', p_to: '2100-01-01' })).data ?? [];
  const sumBefore = expenseTotals.reduce((a, x) => a + x.total, 0);
  await active.c.from('goal_deposits').insert({ goal_id: g.data.id, amount: 999 });
  const sumAfter = ((await active.c.rpc('category_totals', { p_from: '2000-01-01', p_to: '2100-01-01' })).data ?? []).reduce((a, x) => a + x.total, 0);
  check('a goal deposit does not change expense totals', sumBefore === sumAfter);
  const plain = await active.c.from('goal_deposits').select('source').eq('goal_id', g.data.id);
  check("a deposit is 'new' by default", (plain.data ?? []).every((d) => d.source === 'new'));
  const old = await active.c.from('goal_deposits').insert({ goal_id: g.data.id, amount: 30000, source: 'existing' });
  check('money already saved can be added', !old.error, old.error?.message);
  const withOld = (await active.c.rpc('goal_totals')).data ?? [];
  check('money already saved counts toward the goal', withOld.find((x) => x.goal_id === g.data.id)?.saved === 120000 + 999 + 30000);
  const bad = await active.c.from('goal_deposits').insert({ goal_id: g.data.id, amount: 1, source: 'gift' });
  check('an unknown deposit source is refused', !!bad.error, bad.error?.code);
  const foreign = await admin.c.from('goal_deposits').insert({ goal_id: g.data.id, amount: 100 });
  check("cannot deposit into another user's goal", !!foreign.error, foreign.error?.code);
}

// --- cleanup ---
for (const id of made.rules) await active.c.from('transactions').delete().eq('recurring_rule_id', id);
await active.c.from('transactions').delete().in('id', made.tx);
await active.c.from('recurring_rules').delete().in('id', made.rules);
await active.c.from('goals').delete().in('id', made.goals);
const left = (await active.c.from('transactions').select('id').eq('description', TAG)).data ?? [];
check('test rows cleaned up', left.length === 0, `left=${left.length}`);

console.log(`\n${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
