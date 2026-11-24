# In-app purchase setup (Apple + Google through RevenueCat)

Rules live in `docs/spec.md` "Subscription and access". This page is the setup.

## How it fits together

```
phone (react-native-purchases) ──buy──▶ App Store / Google Play
        │                                        │
        │ after buy / restore                    ▼
        └──▶ Edge Function revenuecat-sync   RevenueCat ──webhook──▶ Edge Function revenuecat-webhook
                       │                         ▲                          │
                       └──── read customer ──────┘──── read customer ───────┘
                                       ▼
                         public.store_apply()  → store_subscriptions
                                       ▼
                         public.recompute_access() → profiles.expires_at / status
                                       ▼
                         has_access() → RLS on every financial table
```

- RevenueCat customer id = the Supabase user id.
- Access end = the later of the store end (grace included) and the admin grant end.
- The phone never writes access. Both functions re-read the customer from RevenueCat.

## Names (must match in the stores and RevenueCat)

| What | Value |
|---|---|
| RevenueCat entitlement | `access` |
| RevenueCat offering | `default`, packages `$rc_monthly` and `$rc_annual` |
| Apple subscription group | `Kaspilo`, products `kaspilo_monthly`, `kaspilo_yearly` |
| Google subscription | `kaspilo_access`, base plans `monthly`, `yearly` |
| Free trial | 2 weeks (Apple introductory offer / Google free-trial offer on each plan) |
| Billing grace period | Apple 16 days, Google 14 days |
| Prices | Israel ₪12.90 / ₪112.90; US $3.49 / $30.49 (other countries: store auto price) |

## Secrets (owner sets them; never in chat, never in git)

Supabase → Project → Edge Functions → Secrets, for dev and for prod:

- `REVENUECAT_SECRET_KEY` — RevenueCat → Project settings → API keys → secret key (`sk_…`).
- `REVENUECAT_WEBHOOK_SECRET` — any long random string; the same value goes in RevenueCat's webhook "Authorization header value".

Or by CLI (values typed by you, not pasted into a file):

```bash
supabase secrets set REVENUECAT_SECRET_KEY=... REVENUECAT_WEBHOOK_SECRET=... --project-ref <ref>
```

The public SDK keys (`appl_…`, `goog_…`) are not secret: they go in the app config (phase B).

## RevenueCat webhook

- URL: `https://<project-ref>.supabase.co/functions/v1/revenuecat-webhook`
- Authorization header value: the `REVENUECAT_WEBHOOK_SECRET` value.
- Send all events, both environments (sandbox purchases are how Apple reviews the app).
- "Send test event" must return 200 with `{"ok":true,"test":true}`.

## Deploy

- Prod: the deploy workflow deploys both functions (`revenuecat-webhook` without JWT check, `revenuecat-sync` with it).
- Dev (done 2026-11-24): both deployed to `fcezhasnvrdeplaklqmv`. Until the secrets are set they answer `not_configured`.

## Testing

- `deno test --allow-env supabase/functions` — RevenueCat logic, no network (runs in CI).
- `npm run test:db` — access rules on dev, including store and grant functions.
- Real purchases need a development or store build (never Expo Go), an Apple sandbox tester, and Google license testers.
