# Prod readiness eval

Run this on dev before anything goes to prod. Each line is pass / fail / not applicable, with proof (command output, screenshot, or query result). No proof = fail.

**Gate:** every line in sections 1–4 passes. Sections 5–8: no blockers open.

Fill in a copy per run: `evals/runs/YYYY-MM-DD.md`.

## 1. Data isolation and access (blocker)

- [ ] RLS enabled on every table in `public` (query `pg_tables` / advisors shows none without RLS).
- [ ] User A cannot select, insert, update or delete user B's rows in any table. Tested through the API with A's token.
- [ ] A client cannot change own `role`, `status`, `plan`, `approved_at`, `expires_at`.
- [ ] A non-admin cannot call any admin RPC.
- [ ] Pending, rejected and expired users cannot read or write financial tables through the API.
- [ ] Supabase security advisors: zero errors; every warning fixed or justified in writing.

## 2. Secrets and environments (blocker)

- [ ] `git log -p` contains no secret key, JWT, or private key.
- [ ] Mobile bundle and web client bundle contain no secret key (grep the build output).
- [ ] Prod uses its own Supabase project, keys, bundle id, and `kaspilo://` scheme. Nothing points at dev.
- [ ] Dev secret key that was shared in chat has been rotated.
- [ ] Auth redirect URLs in prod list only prod schemes and domains.
- [ ] Dev test users do not exist in prod.
- [ ] Prod Auth: "Confirm email" is off, minimum password length 8, "IP address forwarding" on (Rate Limits).
- [ ] Prod Edge Function `auth-password` deployed with its own `AUTH_PASSWORD_PEPPER` (a copy in the owner's password manager). On a prod build: sign-up with `password123` is refused as leaked; 5 wrong passwords lock for 15 minutes; "Forgot password" unlocks.
- [ ] Prod Auth: custom SMTP is on (same Brevo/Resend account as dev is fine, sender name "Kaspilo") and the Reset Password template contains `{{ .Token }}`.

## 3. Money correctness (blocker)

- [ ] Unit tests for amount parsing, formatting, period boundaries, budget remaining, percentages, installment split all pass.
- [ ] No floating-point type stores or computes an amount (grep for `parseFloat`, `real`, `double precision`, `numeric` on amount columns).
- [ ] Home total, category sums, and stats total agree for the same period on a test account.
- [ ] Installment parts sum exactly to the original amount.
- [ ] Goal deposits do not appear in expense totals.
- [ ] Changing currency or month start day does not change stored data.

## 4. Subscription lifecycle (blocker)

- [ ] Sign up → locked screen → admin approves → app unlocks without reinstall.
- [ ] Approve sets `expires_at` = approval + 365 days; `family` plan has no expiry.
- [ ] Extend adds 365 days from the old expiry when still active.
- [ ] Daily job flips a past-expiry user to `expired` and the app locks.
- [ ] Reject → user can submit again.
- [ ] Reminders fire at 30 and 7 days (tested with a user whose expiry is set to those offsets).
- [ ] Forgot password on a prod build: code mail arrives (not in spam), code + new password signs in, wrong and expired code show a clear error.
- [ ] Sign-up on a prod build: typo email is refused on the email step; terms tab must be opened and confirmed before Continue works.

## 5. App quality

- [ ] `npm run typecheck`, `npm run lint`, `npm test` pass on a clean install.
- [ ] Every screen has loading, empty, error and success states.
- [ ] Hebrew (RTL) and English (LTR) checked on every screen; no hard-coded strings.
- [ ] Light and dark checked on every screen; contrast ≥ 4.5:1 for text.
- [ ] Screen reader labels on all controls; touch targets ≥ 44 pt.
- [ ] Reduce-motion stops the leaf and wallet loops.
- [ ] Tested on a real iOS device and a real Android device from a production-profile build (not Expo Go): Hebrew phone flips the whole layout to RTL, any other language starts in English, arrows point the right way in both.
- [ ] Loading screen shows the moving wallet; top-corner leaves and the password eye look right in light and dark.
- [ ] Add-transaction flow takes no more than four taps from home.
- [ ] Excel export opens in Excel and Google Sheets with correct Hebrew and amounts.

## 6. Store requirements

- [ ] In-app account deletion works and removes all data (Apple and Google require it).
- [ ] If any social login is offered on iOS, the Apple sign-in requirement is resolved.
- [ ] Payment outside the app (Bit) is reviewed against current App Store and Play rules for digital subscriptions; decision recorded.
- [ ] Privacy policy URL and data-safety forms are filled.
- [ ] Terms of use: final wording from the owner replaces the draft in `i18n/he.json` and `en.json`; `TERMS_VERSION` in `src/auth/terms.ts` bumped.
- [ ] Store listing gives a way to test: a reviewer account (active, with sample data) and its login in the review notes.
- [ ] App icons, splash, and screenshots for both stores.

## 7. Operations

- [ ] Prod migrations applied from `supabase/migrations/` in order, from scratch, without errors.
- [ ] Database backups on in prod; restore tried once.
- [ ] Cron job scheduled in prod and its last run visible in logs.
- [ ] At least one admin user exists in prod, created by hand.
- [ ] Error reporting or log access is set up for the app and edge functions.

## 8. Performance

- [ ] Supabase performance advisors: no unindexed foreign keys, no slow policies.
- [ ] Home and stats load in under 2 seconds on a mid-range phone with 2,000 transactions.
- [ ] Admin tables paginate.

## Score

| Section | Pass | Fail | Notes |
| --- | --- | --- | --- |
| 1 Isolation | | | |
| 2 Secrets | | | |
| 3 Money | | | |
| 4 Subscription | | | |
| 5 Quality | | | |
| 6 Store | | | |
| 7 Operations | | | |
| 8 Performance | | | |

Decision: go / no-go, date, who decided.
