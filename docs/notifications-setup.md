# Notifications: what to remember, and what the owner has to do

Rules are in `docs/spec.md` → "Notifications". This file is the owner's reminder.

## The problem we solved (decision 2, 2026-11-15)

There are two ways to send a notification:

| | Local | Push from the server |
| --- | --- | --- |
| Who decides when | The phone, from what it knew at the last app open | The server, from the real `expires_at` on that day |
| Admin extended a subscription | The phone does not know until the app is opened | Correct right away |
| Needs | Nothing | Push credentials (below) and a real build, not Expo Go |

**The problem with local:** a user pays, the admin approves, the user does not open the app.
The phone still thinks the subscription ends in a week and says "renew" to someone who already paid.

**So:**

- **Renewal reminders = push from the server.** A daily database job (`send_subscription_reminders`, 08:00 UTC) reads `expires_at` and sends through the Expo push service. Always correct.
- **Inactivity reminders = local.** The phone knows by itself when it was last opened. No server.

Keep this split. Do not move renewal reminders to local to "save setup": it brings the wrong-reminder problem back.

## Works today without any setup

- Inactivity reminders (day 4, 14, 24 at 19:00), on iPhone and Android.
- The Notifications screen and its switches.
- The server job runs daily on the dev project. It has nobody to send to until a phone registers a push token.

## Android push — do this first

1. Link the app to an EAS project (once):

   ```bash
   cd apps/mobile && npx eas-cli@latest init
   ```

   It prints a project ID. Put it in `apps/mobile/.env.development` (and `.env.production`) as `EAS_PROJECT_ID=...`, and add the same variable to the EAS environments (`eas env:create`). It is not a secret.
2. Firebase console → create a project (free) → add an Android app for **each** package: `com.kaspilo.app.dev` and `com.kaspilo.app`.
3. Download `google-services.json` (after adding both apps, so it holds both), save it as `apps/mobile/google-services.json`, and add `GOOGLE_SERVICES_JSON=./google-services.json` to `apps/mobile/.env.development` and `.env.production`. `app.config.ts` already reads it. The file holds no secret.
4. Firebase → Project settings → Service accounts → "Generate new private key". Upload that JSON to EAS:

   ```bash
   cd apps/mobile && npx eas-cli@latest credentials
   ```

   Android → Google Service Account → "Manage your Google Service Account Key for Push Notifications (FCM V1)". **Never commit this file.** It is a secret.
5. Make a new development build (`eas build --profile development --platform android`). Push does not work in Expo Go.
6. Test: sign in on a real Android phone, allow notifications, then send a test from https://expo.dev/notifications with the token from the `push_tokens` table.

## iPhone push — when the Apple Developer account is open

Needs the paid Apple Developer Program (99 USD / year). Until then: local reminders work on iPhone, renewal push does not.

1. Join the Apple Developer Program with your Apple ID.
2. Set the team ID for builds: `APPLE_TEAM_ID` (already read by `app.config.ts`).
3. Let EAS make the push key:

   ```bash
   cd apps/mobile && npx eas-cli@latest credentials
   ```

   iOS → "Push Notifications: Manage your Apple Push Notifications Key" → let EAS create it. EAS keeps the key; nothing goes in git.
4. Make a new iOS build on a real iPhone (push does not work on the simulator):
   `eas build --profile testflight --platform ios`.
5. Test the same way as Android step 6.
6. No code change is needed. The app already registers the iPhone token.

## Sending by hand (admin dashboard)

Users page → "Notify" in an active user's row, or "Notify all active users" at the top. Pick a ready-made notification or write a one-time custom message. It reaches only phones that registered a push token, so it needs the push setup above. It resets nothing.

## Before prod

- Apply `supabase/migrations/20261115140000_notifications.sql` and `20261116090000_admin_send_notification.sql` to the prod project with the other migrations.
- Decide if 08:00 UTC is the right hour (10:00 Israel in winter, 11:00 in summer).
- Optional hardening: turn on "Enhanced Security for Push Notifications" in the Expo dashboard. Then the database job needs an Expo access token; tell Claude before turning it on, or the job stops sending.
- Known limit: tokens of uninstalled apps are not cleaned up yet. Harmless, the push service drops them.

## Still to build

Purchase detection (Apple Pay / Google Pay → "Add this expense?"). Android: notification listener. iPhone: Shortcuts automation guide. The switch shows "Soon" until then.
