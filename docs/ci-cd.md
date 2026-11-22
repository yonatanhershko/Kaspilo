# CI/CD

Decided by the owner 2026-11-21: every push is checked; production changes only by hand, with approval.

## On every push (`.github/workflows/ci.yml`)

Every push to `dev` and `main`, and pull requests into `dev`. All jobs must be green before merging into `main`.

Each commit is checked once (owner decision 2026-11-22, to save Actions minutes once the repository is private):

- A pull request from `dev` into `main` runs no CI of its own. Branch protection reads the results of the push to `dev` on the same commit.
- The push to `main` after the merge checks the merge commit, which is exactly what prod gets.
- A deploy does not run the full CI again. It requires a passing run on its commit, and re-runs only the three checks that can change with time.

About 9 billed minutes per push and about 27 per full release (push to dev, merge, deploy), down from about 38.

| Job | What it proves |
| --- | --- |
| Typecheck, lint, tests | `npm run typecheck`, `npm run lint`, `npm test`, Hebrew and English keys match (`scripts/ci/i18n-check.mjs`), `deno check` + `deno lint` of the Edge Functions |
| Secret scan | gitleaks over the whole history: no keys, tokens or passwords in git |
| Build mobile + web | `expo export` for iPhone and Android, and `next build` of the admin dashboard, with public placeholder values. Then the bundle size against `scripts/ci/bundle-budget.json`: fails when a part grows more than 10%. After an intended growth, raise the budget in the same change |
| Migrations on an empty database + DB tests | A fresh local Supabase applies every file in `supabase/migrations/` in file order (exactly what prod will get), `supabase db lint` checks the functions, the Edge Functions are served with a throwaway server secret, four test users are seeded (`supabase/tests/ci-setup.mjs`), then `npm run test:db` runs against it: money, access, the password lock (5 wrong → 15 minutes, reset, leaked passwords) and the request limits. Dev is never touched |
| Supabase advisors (dev) | Security and performance advisors of the dev project. Fails on ERROR; WARN and INFO are listed in the job summary |
| Dependency report | What could be updated and why, see "Dependencies" below |

Accepted advisor warnings (not errors): `security definer` functions callable by signed-in users — each one checks the caller first (`is_admin()`, `auth.uid()`); `track_event` callable without sign-in — analytics before sign-up, validated server-side; tables with RLS on and no policies — read only through `security definer` functions; leaked-password protection — the free plan has no such setting and it would check the mixed password anyway; the `auth-password` Edge Function checks HaveIBeenPwned itself (docs/spec.md "Sign-in").

## Production (`.github/workflows/deploy.yml`)

Never automatic. Actions tab → "Deploy to production" → Run workflow, on `main`, type `prod`. Before anything touches prod, two jobs run:

- **CI passed on this commit:** finds a passing CI run (from the push, or started by hand) on this exact commit. If CI is still running, it waits up to 20 minutes. If there is none, the deploy stops: fix CI on `main`, or run it by hand (Actions → CI → Run workflow → `main`), then deploy again.
- **Checks that can change with time:** the secret scan, the dependency report (strict, so a "must" item stops the deploy) and the dev advisors. Same code, but a new vulnerability or scanner rule may have appeared since the merge.

Then each job waits for the owner's approval in the `production` environment.

| Choice | What happens |
| --- | --- |
| migrations | `supabase db push` to the prod database: shows the pending files, then applies them in file order. Then deploys the Edge Functions (`auth-password`, `apple-revoke`) |
| store build | `eas build --profile production` for iPhone, Android or both. Runs in Expo's cloud; submit to the stores from expo.dev |
| migrations + store build | both, migrations first |
| update (JS only) | `eas update --channel production`: JS and asset fixes reach installed apps without a store review. Only builds with the same app version get it; any native change (new native package, permission, icon, config plugin) needs a store build |

Migration versions: dev was migrated through the Supabase MCP, which records each migration under the time it was applied, not the file name. So dev's history does not match the files, and the deploy workflow never pushes to dev. Prod starts empty and gets the files in order, under their own names.

## Keep-alive (`.github/workflows/keepalive.yml`)

Owner decision 2026-11-21: prod stays on the free Supabase plan, which pauses a project after 7 days without database activity. Once a day (06:17 UTC) the workflow runs one read query on prod with the publishable key (RLS returns nothing; the query still counts). It needs the repository **variables** `PROD_SUPABASE_URL` and `PROD_SUPABASE_PUBLISHABLE_KEY` (public values) and skips while they are unset. GitHub turns off scheduled workflows in a public repository after 60 days without commits; a commit or a manual run turns it back on. The free plan has no backups.

## Dependencies (CI job "Dependency report")

Owner decision 2026-11-21: nothing updates by itself, no automatic dependency PRs. Every CI run writes a report to its job summary (Actions → the run → Summary), from `scripts/ci/deps-report.mjs`:

- **חובה (must):** packages Expo needs at another version for the current SDK (`npx expo install --check`), and high / critical vulnerabilities in packages the apps run.
- **מומלץ (recommended):** patch / minor updates of runtime packages, moderate / low vulnerabilities in packages the apps run. Each with its kind (bug fixes / new features) and a link to what changed.
- **לא דחוף (not urgent):** major versions (need planning), dev tools, vulnerabilities only in dev tools, and Expo build-tool alerts where npm's "fix" would downgrade Expo (never do that).

On `dev` a "must" item is only a warning, so an upstream release never blocks work. On `main` (the push after a merge, and every deploy) it fails the check, so nothing reaches prod with a must-fix open. A merge into `main` is not blocked by it; the deploy is. The owner picks what to update; it is done on `dev` and goes through CI. Expo, React and React Native packages move only with `npx expo install --fix` or an SDK upgrade.

## One-time setup (owner)

GitHub repository → Settings:

1. **Secrets and variables → Actions → Secrets:**
   - `SUPABASE_ACCESS_TOKEN` — supabase.com → Account → Access Tokens → Generate. Name `kaspilo-github-ci`, access to the dev project only, read-only. Used only for the advisors (prod migrations use `PROD_DB_URL`). Renew it before it expires.
   - `EXPO_TOKEN` — expo.dev → Account settings → Access tokens → Create. Name `kaspilo-github-ci`, limited to the account `yonatan88` with role Developer (enough for builds and updates).
2. **Secrets and variables → Actions → Variables:** `DEV_PROJECT_REF` = the dev project ref (the part before `.supabase.co` in the dev URL).
3. **Environments → `production`:** required reviewer = the owner; deployment branches = `main` only. Add these only when the prod project exists:
   - secret `PROD_DB_URL` = the prod database connection string (Supabase → prod project → Connect → Session pooler URI, with the database password);
   - secret `PROD_SUPABASE_ACCESS_TOKEN` = a Supabase access token named `kaspilo-github-deploy`, with access to the prod project (deploys the Edge Functions);
   - variable `PROD_PROJECT_REF` = the prod project ref.
   And the function's own server secret, see `docs/prod-setup.md` "Password protection".
4. **Expo (expo.dev → project kaspilo → Environment variables → production):** the prod `EXPO_PUBLIC_*` values and `GOOGLE_SERVICES_JSON` (file). Without them a production build cannot reach prod.
5. **Branch protection for `main`:** require a pull request and the CI jobs above.
