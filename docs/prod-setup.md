# Where the prod keys go

Dev and prod never share a key. The prod Supabase project is "Kaspilo Prod". Get its values from the Supabase dashboard → Project Settings → API keys.

You need two values for the apps:

- **Project URL** — `https://<prod-ref>.supabase.co`
- **Publishable key** — starts with `sb_publishable_`

The **secret key** (`sb_secret_…`) is not used by either app. Keep it out of both.

## 1. Mobile app

For store builds, EAS does not read local env files. Put the values in the EAS **production** environment:

```bash
cd apps/mobile
```

```bash
npx eas-cli@latest env:create --environment production --name EXPO_PUBLIC_SUPABASE_URL --value https://<prod-ref>.supabase.co --visibility plaintext
```

```bash
npx eas-cli@latest env:create --environment production --name EXPO_PUBLIC_SUPABASE_PUBLISHABLE_KEY --value sb_publishable_xxx --visibility plaintext
```

```bash
npx eas-cli@latest env:create --environment production --name EXPO_PUBLIC_APP_ENV --value production --visibility plaintext
```

To run the prod setup locally, also create `apps/mobile/.env.production` (gitignored) from `apps/mobile/.env.example` with the same three values.

## 2. Admin web (Vercel)

Vercel → the project → Settings → Environment Variables. Add, for the **Production** environment only:

| Name | Value |
| --- | --- |
| `NEXT_PUBLIC_SUPABASE_URL` | `https://<prod-ref>.supabase.co` |
| `NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY` | `sb_publishable_xxx` |
| `NEXT_PUBLIC_APP_ENV` | `production` |

Add the same three names for **Preview** with the dev project's values. Project root directory in Vercel: `apps/web`.

## 3. Database

Apply every file in `supabase/migrations/`, in name order, to the prod project. Then create the first admin by hand: sign up in the app, then in the Supabase SQL editor:

```sql
update public.profiles
set role = 'admin', status = 'active', plan = 'family', approved_at = now(), expires_at = null
where email = 'your-email@example.com';
```

In Supabase Auth settings for prod: turn "Confirm email" off (the app does not send confirmation emails), and add `kaspilo://` to the allowed redirect URLs.

### Password protection (Edge Function `auth-password`)

Every password sign-in, sign-up and reset goes through this function (docs/spec.md "Sign-in"). Do these **before** the first user signs up, on dev and again on prod:

1. Make the server secret, on your computer: `openssl rand -base64 48`. Save it in your password manager first ("Kaspilo AUTH_PASSWORD_PEPPER — prod"). Losing it means every user has to use "Forgot password".
2. Supabase → the project → Edge Functions → Secrets → Add new secret: name `AUTH_PASSWORD_PEPPER`, value = that secret. Dev and prod get **different** secrets.
3. Supabase → the project → Authentication → Rate Limits → turn on **IP address forwarding**, so Supabase counts each user's own address and not the function's.
4. The function itself: the deploy workflow deploys it with the migrations (`docs/ci-cd.md`). By hand: `supabase functions deploy auth-password --no-verify-jwt --project-ref <ref>`.
5. Leave Supabase's own "Prevent use of leaked passwords" off (it is a paid feature and would check the mixed password, not the real one); the function checks HaveIBeenPwned itself.

## 4. Push notifications

See `docs/notifications-setup.md`.

## 5. Before going live

Run through `evals/prod-readiness.md`. Rotate the dev secret key that was pasted in chat.

## Forgot password (email code)

The app asks for the email, then a 6-digit code plus a new password. Supabase must send the code, not a link:

1. Supabase → Authentication → Emails → Templates → **Reset Password**. Put `{{ .Token }}` in the body, for example: `Your Kaspilo code: {{ .Token }}`. The default template has only a link.
2. Supabase → Authentication → SMTP Settings → turn on **custom SMTP**. The built-in sender only mails project team members and allows a few mails per hour, so real clients never get the code.
   - Free option: Resend (3,000 mails/month; needs a domain you own) or Brevo (300/day).
3. Do this for the dev project to test, and again for prod.
