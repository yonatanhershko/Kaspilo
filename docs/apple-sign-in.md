# Apple sign-in setup

Rule: `docs/spec.md` (Auth, "Apple sign-in"). Code: `apps/mobile/src/auth/apple.ts`, button on the sign-in screen, `usesAppleSignIn` + plugin in `apps/mobile/app.config.ts`.

How it works: iPhone only. Apple's native sheet (Face ID) gives an ID token; the app calls `supabase.auth.signInWithIdToken({ provider: 'apple' })` with a nonce. No web flow, so no Apple secret key and nothing that expires.

## 1. Apple Developer account (once)

- Needs the paid Apple Developer Program. A free personal team cannot use the "Sign In with Apple" capability.
- App IDs `com.kaspilo.app` and `com.kaspilo.app.dev`: the capability "Sign In with Apple" must be on. An EAS build turns it on by itself (it reads `usesAppleSignIn`). For a local Xcode build with automatic signing, Xcode does the same. To check by hand: https://developer.apple.com/account/resources/identifiers/list → the App ID → Sign In with Apple ✓.

## 2. Supabase (dev and prod)

Authentication → Sign In / Providers → Apple:

- **Enabled.**
- **Client IDs** (the token's audience):
  - dev: `com.kaspilo.app.dev,host.exp.Exponent` (the second one is Expo Go on iPhone, for testing only)
  - prod: `com.kaspilo.app`
- **Secret Key (for OAuth):** leave empty. It is only for the web flow, which the app does not use.

## 3. Build

New native package and capability, so a new iPhone build is needed (an `eas update` is not enough). Expo Go on iPhone works for dev testing right away.

## 4. Test

On an iPhone: sign-in screen → "Continue with Apple" → Face ID → terms screen (first time only) → locked screen. In the admin web the user waits in Approvals with the name from Apple. Try once with "Hide my email": the email is an `@privaterelay.appleid.com` address.

## 5. Revoke on account deletion (guideline 5.1.1(v))

Code: `supabase/functions/apple-revoke`, called from More → Delete account (`revokeApple()` in `apps/mobile/src/auth/apple.ts`). It needs an Apple key, once:

1. https://developer.apple.com/account/resources/authkeys/list → **+** → name `Kaspilo Sign in with Apple` → tick **Sign in with Apple** → Configure → Primary App ID `com.kaspilo.app` → Save → Continue → Register.
2. **Download** the `.p8` file (Apple lets you download it only once; keep it in a password manager, never in the repo). Note the **Key ID** (10 characters).
3. Supabase → Edge Functions → Secrets, in each project:

   | Secret | dev | prod |
   | --- | --- | --- |
   | `APPLE_TEAM_ID` | `T6VC5C33KJ` | `T6VC5C33KJ` |
   | `APPLE_KEY_ID` | the Key ID | the Key ID |
   | `APPLE_PRIVATE_KEY` | the whole `.p8` text, `-----BEGIN…` to `…END PRIVATE KEY-----` | same |
   | `APPLE_CLIENT_ID` | `com.kaspilo.app.dev` | `com.kaspilo.app` |

4. Deploy: prod with the deploy workflow (`migrations`), dev with `supabase functions deploy apple-revoke --project-ref fcezhasnvrdeplaklqmv`.

In Expo Go the app's ID is Expo's, so the revoke fails there and the account is deleted anyway; test it on a real build (TestFlight).

## Still open

- Apple users have no password, so they never get the reset email. If we ever email users, the sender must be registered in Apple's "Private Email Relay" or mail to hidden addresses is dropped.
