/**
 * CI only: prepares a throwaway local Supabase (started by `supabase start` in GitHub
 * Actions) for `npm run test:db`. Never run against dev or prod.
 *
 * Creates the four test users the DB tests sign in as, sets their access state with
 * SQL, and writes the two gitignored files the tests read:
 *   apps/web/.env.development           local API URL + publishable key (public values)
 *   supabase/seed/dev-users.local.md    the users and their one-off passwords
 *
 * Reads from the environment (exported from `supabase status -o env`):
 *   API_URL, ANON_KEY (or PUBLISHABLE_KEY), SERVICE_ROLE_KEY (or SECRET_KEY), DB_URL
 */
import { execFileSync } from 'node:child_process';
import { randomBytes } from 'node:crypto';
import { mkdirSync, writeFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import { fileURLToPath } from 'node:url';

const root = fileURLToPath(new URL('../..', import.meta.url)).replace(/\/$/, '');
const require = createRequire(root + '/apps/web/package.json');
const { createClient } = require('@supabase/supabase-js');

const apiUrl = process.env.API_URL;
const publishable = process.env.PUBLISHABLE_KEY || process.env.ANON_KEY;
const service = process.env.SECRET_KEY || process.env.SERVICE_ROLE_KEY;
const dbUrl = process.env.DB_URL;
if (!apiUrl || !publishable || !service || !dbUrl) {
  throw new Error('Missing API_URL / ANON_KEY / SERVICE_ROLE_KEY / DB_URL from `supabase status -o env`.');
}
if (!/^https?:\/\/(127\.0\.0\.1|localhost)(:\d+)?/.test(apiUrl)) {
  throw new Error(`Refusing to seed a non-local Supabase: ${apiUrl}`);
}

const users = [
  { key: 'admin', name: 'Dana Admin' },
  { key: 'active', name: 'Noa Levi' },
  { key: 'pending', name: 'Omer Cohen' },
  { key: 'expired', name: 'Tal Mizrahi' },
];

const adminClient = createClient(apiUrl, service, { auth: { persistSession: false, autoRefreshToken: false } });
const rows = [];
for (const u of users) {
  const email = `dev-${u.key}@finny.test`;
  const password = randomBytes(18).toString('base64url');
  const { error } = await adminClient.auth.admin.createUser({
    email,
    password,
    email_confirm: true,
    user_metadata: { full_name: u.name },
  });
  if (error) throw new Error(`create ${email}: ${error.message}`);
  rows.push(`| ${u.key} | ${u.name} | ${email} | ${password} |`);
}

// Access state straight in SQL, as the postgres role (column grants do not apply).
const sql = `
update public.profiles set role = 'admin', status = 'active', plan = 'vip',
  approved_at = now(), expires_at = now() + interval '365 days' where email = 'dev-admin@finny.test';
update public.profiles set status = 'active', plan = 'paid',
  approved_at = now(), expires_at = now() + interval '365 days' where email = 'dev-active@finny.test';
update public.profiles set status = 'expired', plan = 'paid',
  approved_at = now() - interval '400 days', expires_at = now() - interval '35 days' where email = 'dev-expired@finny.test';
select email, role, status from public.profiles order by email;
`;
console.log(execFileSync('psql', [dbUrl, '-v', 'ON_ERROR_STOP=1', '-c', sql], { encoding: 'utf8' }));

writeFileSync(
  root + '/apps/web/.env.development',
  `NEXT_PUBLIC_APP_ENV=development\nNEXT_PUBLIC_SUPABASE_URL=${apiUrl}\nNEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY=${publishable}\n`,
);
mkdirSync(root + '/supabase/seed', { recursive: true });
writeFileSync(
  root + '/supabase/seed/dev-users.local.md',
  `# CI test users (throwaway local Supabase)\n\n| role | name | email | password |\n| --- | --- | --- | --- |\n${rows.join('\n')}\n`,
);
console.log(`Seeded ${users.length} test users on ${apiUrl}.`);
