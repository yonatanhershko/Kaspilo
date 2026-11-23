# Kaspilo spec — approved decisions

- App name (owner 2026-11-20): **Kaspilo** in both languages (was Finny). Contact email MyKaspilo@gmail.com. Bundle id / package `com.kaspilo.app` (dev `com.kaspilo.app.dev`), deep link schemes `kaspilo://` / `kaspilo-dev://`. Internal names were renamed too, before any real user existed (2026-11-20): packages `@kaspilo/*`, phone storage keys `kaspilo.*` (dev phones lose their saved theme, language and offline cache once), CSS variables, cron jobs `kaspilo-*`. Still `finny`, because they cannot or need not change: the Google Cloud project ID `finny-f9dba`, dev test users `@finny.test`, the local Android emulator `finny_pixel`, and migrations written before the rename.

Decided by the owner on 2026-11-13. Lines marked **(assumed)** were proposed by Claude and not yet confirmed; confirm or change them before the phase that uses them.

## Product

- Mobile app (Expo, iOS + Android) for tracking income, expenses, budgets, goals. Admin web dashboard (Next.js on Vercel free tier). One Supabase database per environment.
- Dev environment first. Prod gets a clean, separate Supabase project later.
- Languages: Hebrew and English. Phone language decides at first launch: Hebrew phone → Hebrew, any other language → English (changed by the owner 2026-11-14). User can switch in More.
- Layout direction: the screen layout is the same on iPhone, Android and web and never mirrors (tab bar, header, button pairs keep their left-to-right places). Language only changes (1) where text starts: Hebrew text sits at the right, English at the left, centered text stays centered, and text that is only a number (amount, date, time, phone) is always at the left and reads left to right, also in Hebrew; the currency sign is left of the number. Number inputs (amount, budget, deposit, month start day, counts) start at the right in Hebrew and at the left in English, digits still left to right, sign still left of the number **(owner 2026-11-18)**. Typed text moves the cursor with it: email, password and code fields start by the app language (Hebrew right, English left; their content still reads left to right) (owner 2026-11-21, was "always at the left"); other text fields start by the first letter typed (Hebrew right, English left), empty fields by the app language (owner 2026-11-19). The password eye sits across from where typing starts: Hebrew at the left, English at the right.; and (2) the order inside rows of icon + text (Hebrew: icon at the right). No app reload when the language changes. **(owner request 2026-11-15)**
- Themes: light and dark, tokens in `.claude/rules/design.md`.

## Build order

Init → Phase 1 infra → Phase 5 tokens / theme / i18n / leaf art → Phase 2 auth, gate, admin → Phase 3 money features → Phase 4 tabs and settings. One local commit per phase.

## Subscription and access

- Yearly subscription paid by Bit, outside the app. No payment proof upload. Admin matches the payer by name.
- Store rules (owner 2026-11-21): the app never names the payment method and never asks the user to pay. Locked and renew screens speak of the Kaspilo team's approval only (the app never says "advisor": the owner is not a financial advisor); the terms of use say payment is made directly to the operator, outside the app. No price or Bit in the store listing either. Google Play's outside-payment programs do not cover Israel.
- Phone number is not required at sign-up.
- Locked screen button "Contact the Kaspilo team" opens WhatsApp to 052-320-3902. A bot may replace this later.
- `profiles.status`: `pending_approval` | `active` | `expired` | `rejected`.
- `profiles.role`: `client` | `admin`.
- `profiles.plan`: `paid` (1 year), `vip` (1 year, granted by admin without payment), `family` (never expires, granted by admin). Confirmed by the owner 2026-11-14.
- Access length: the admin picks it on approve, renew and extend: **1 year** (365 days, default) or **2 months** (calendar months). `family` ignores it. (owner 2026-11-15)
- Approve: status → `active`, `approved_at` = now, `expires_at` = now + chosen length (`family`: no expiry).
- Renew / extend: new expiry = old `expires_at` + chosen length if still active, otherwise now + chosen length.
- Rejected users can submit again (status back to `pending_approval`).
- Expired users keep all data; the app is locked until an admin approves again.
- Refund (owner 2026-11-15): cancel within 14 days of payment (Consumer Protection Law), refund minus the lower of 5% or ₪100, sent by Bit within 14 days. No refund after 14 days. If Kaspilo shuts down, the unused part is refunded pro rata. Done by hand by the admin, no app flow.
- No age limit. Under 18 needs a parent's consent to pay (stated in the terms).
- A blocked user can get their data export by emailing the owner; the in-app export needs access.
- Daily job: past expiry → status `expired`. Renewal reminders: see "Notifications".
- Locked users cannot read or write financial data through the API either (RLS), not only in the UI.

## Sign-in

- Email + password first. No email confirmation (no email-sending cost).
- No welcome screen (owner 2026-11-16): a signed-out user lands straight on sign-in. Sign-up is reached from the link under it; its back button returns to sign-in.
- Sign-up has three steps: name, email, password. Earlier steps show as rows with a pencil, so the user can jump back and change the name or email. Under the email field is a "Terms of use" tab: tap it, press "I agree" (pinned at the bottom, no need to scroll to the end), and the tab turns green. Continue stays locked until then. No checkbox. The accepted version and time are saved on the auth user (`terms_version`, `terms_accepted_at`). (owner 2026-11-14, no-scroll 2026-11-15)
- Sign-up step bar (owner 2026-11-20): three short bars; done steps are green. In Hebrew the first bar is at the right and they fill leftward; in English they fill from the left.
- Loading screen (owner 2026-11-20): background follows the user's saved light/dark choice, or the phone's setting when it is "system" or not read yet. The native splash before it can only follow the phone's setting (light and dark versions).
- Terms of use: Hebrew + English text in the app i18n files, version `2026-11-20` (name Kaspilo and contact email changed 2026-11-20; usage-data line added 2026-11-18; earlier text approved by the owner 2026-11-15). Bump `TERMS_VERSION` when the text changes. Operator shown as the owner's private name until a business is registered. Contact: email only. Subscription length is not fixed in the terms: price and length are given to the user before payment (WhatsApp / phone / email, not shown in the app); the operator may grant free or non-expiring access (vip / family).
- Forgot password: from sign-in. Email → 6-digit code sent by email → code + new password. No OTP at sign-up (the admin approval is the gate; clients are personal, a few per month). Needs custom SMTP and a code template, see `docs/prod-setup.md`. (owner 2026-11-14) The admin web sign-in has the same "Forgot password?" flow (email → code → code + new password, through `auth-password`), English only; after the reset the admin is signed in, and a non-admin account still sees "not an admin". (owner 2026-11-21)
- Google sign-in (owner 2026-11-16): one "Continue with Google" button on the sign-in screen, under the password form; it signs in an existing user or creates a new one. On the phone it uses Google's native sign-in sheet (shows "Kaspilo", not the Supabase address) and Supabase checks the ID token; web and Expo Go fall back to Supabase hosted Google OAuth in the browser, back to `<scheme>://auth-callback`. One Google OAuth web client serves dev and prod (owner 2026-11-17). Name comes from Google. A new Google user never saw the sign-up terms tab, so the first sign-in opens the terms screen: "I agree" saves `terms_version` / `terms_accepted_at`, the other choice signs out. Then the usual locked screen until an admin approves. (terms gate and button placement chosen by Claude) Setup steps: `docs/google-sign-in.md`.
- Facebook sign-in: later, when the owner has the developer account.
- Password protection (owner 2026-11-21). On the free Supabase plan, since the built-in hook for this needs the Team plan:
  - Every password action (sign-in in the app and on the admin web, sign-up, reset with the code) goes through the Edge Function `auth-password`. It mixes the password with a server secret (`AUTH_PASSWORD_PEPPER`, only in Supabase function secrets) and gives Supabase only the result. So a password sent straight to Supabase never works, even a correct one, and the limits below cannot be skipped.
  - **5 wrong passwords in a row for the same email lock password sign-in for that email for 15 minutes.** The 5th wrong try already shows the lock with the minutes left. During the lock the password is not even checked. Wrong tries older than 24 hours do not count. A correct sign-in or a password reset clears the count and the lock. "Forgot password" works during a lock, so nobody can lock a user out for good. The same answer for an email with no account, so the lock tells nothing about who is registered.
  - Per network address, Supabase's own limit stays (sign-ins and sign-ups per IP per 5 minutes). The function passes on the user's real address, so all users are not counted as one.
  - Leaked passwords: on sign-up and on a new password after reset, the function checks the password against HaveIBeenPwned (only the first 5 characters of its SHA-1 hash leave the server). A leaked password is refused: "This password appeared in a data leak. Choose another." If that service does not answer within 3 seconds, the password is accepted (sign-up never breaks because of it). Not checked at sign-in.
  - Minimum length 8 is checked in the function too, not only in the app.
  - Users from before this change: their first correct sign-in moves their password to the new form, by itself.
  - If the server secret is lost, every password stops working; users get back in with "Forgot password". The owner keeps a copy of it outside Supabase.
  - Accepted: a signed-in user who changes their own password straight through Supabase (not through the app) weakens only their own account.
- Apple sign-in (owner 2026-11-21, replaces "not wanted"): "Continue with Apple" on the sign-in screen, right under "Continue with Google", same size and style (App Store guideline 4.8). iPhone only: Android shows no Apple button (the Android web flow needs a secret that Apple makes expire every 6 months; add later only if asked). (iPhone-only chosen by Claude) Apple's native sheet, then Supabase checks the ID token with a nonce. Signs in an existing user or creates a new one, same terms gate and locked screen as Google. Apple sends the name only on the very first sign-in, so the app saves it then; with "Hide my email" the profile email is Apple's relay address. Deleting the account of an Apple user (guideline 5.1.1(v)): after the typed confirmation Apple's sheet shows once more (the delete dialog says so first for Apple users, owner 2026-11-22), then the Edge Function `apple-revoke` revokes the app's access at Apple, then the account is deleted as usual. Closing Apple's sheet stops the deletion. If Apple or the server refuses, the account is still deleted (deletion is never blocked). (both chosen by Claude) Setup steps: `docs/apple-sign-in.md`.

## Request limits (owner 2026-11-21)

Each signed-in user, enforced in the database (not in the app), so a changed client cannot flood the server:

| What | Limit |
| --- | --- |
| Saving transactions (a single one, a recurring one, installments, the catch-up of recurring ones) | 60 saves a minute and 2,000 a day. One save counts once, however many rows it makes (installments up to 120) |
| Transaction rows | 5,000 a day (stops one huge save) |
| New wallets, categories, goals, goal deposits, recurring rules | 30 a minute and 500 a day, each kind on its own |
| Registering a new phone for notifications | 10 new device tokens an hour (the app updates its own token on every open; that is not counted) |
| Reading (lists, history, export) | No extra limit: RLS already shows a user only their own rows, and lists load in pages |

- Minutes and days are fixed windows (a minute on the clock, a UTC day). Changes and deletions are not limited. Server jobs (daily cron, sign-up defaults) are not counted.
- Over the limit the server answers 429 and nothing is saved. The app shows "Too many actions. Wait a minute and try again." A transaction added offline stays on the phone and is sent again later, so nothing is lost.
- Analytics events keep their own limits ("Analytics").

## Money

- Amounts stored as integers in minor units. Always positive; `type` is `income` or `expense`.
- Currency: user preference in settings, `ILS` or `USD`. Display only: the sign changes, nothing is converted. Confirmed 2026-11-14.
- Budget month: calendar month, or a user-chosen start day 1–31 (no 28 limit, owner 2026-11-14). In a month shorter than the start day, the budget month starts on that month's last day (start day 31 → 28/29 Feb, 30 Apr). Calendar math uses the date-fns library, never hand-written date code.
- Yearly stats = calendar year, 1 January to 31 December. **(assumed)**
- Categories: separate lists for income and expense. Defaults are created for each new user; the user can add, rename, delete and reorder both lists. No subcategories.
  - Expense defaults: car, food and drink, leisure, housing, health, shopping, bills, other.
  - Income defaults: salary, other.
- Budgets: optional monthly budget per expense category, plus an optional overall monthly budget. Same amount every month, no rollover.
- Home shows, small and quiet, how much is left: overall and per category. Over budget → bold red amount and red bar.
- Transaction fields: amount, description, date (defaults to today), category, and optional repeat.
- Repeat options, chosen in the add sheet. **(details assumed by Claude, confirm or change)**
  - Recurring: weekly, monthly or yearly from the chosen date. Each occurrence becomes a real transaction on its date, created when the app is opened on or after that date (missed ones are caught up). A rule that starts on the 31st stays on month ends.
  - Installments: a total split into 2–120 monthly payments from the chosen date. Every payment is the total divided by the count, rounded down; the remainder goes on the first payment, so the payments sum to the total exactly. All payments are created at once, future-dated, and count in the month they fall in.
  - Each generated transaction can be edited or deleted on its own. Editing a rule is not in v1.
- Deleting a category: if it has transactions it is archived (hidden from pickers; history and totals keep it). If unused it is deleted. **(assumed)**
- Goal withdrawals are not in v1; deposits only. **(assumed)**
- Home lists an expense category when it has spending in the current budget month or has a budget.
- Balance = income − goal deposits − expenses, for the same budget period (negative allowed). Home shows it under the expense total in place of the income line. Stats has a third tab, Balance, monthly and yearly: the donut splits income into expenses, saved and left (when over, only expenses and saved). **(owner request 2026-11-15, donut split chosen by Claude)**
- Goals: separate from transactions. A deposit into a goal does not count as an expense and does not change totals or stats.
- Home shows a "Deposits this month" section under the categories: one card per goal that got a deposit in the current budget month, with the sum deposited that month. Tap opens the Goals tab. Hidden when there are no deposits. The expense total at the top never includes deposits. Below it, an "Income this month" section lists income categories with their sums, same card style; tap opens that category's transactions. **(owner idea 2026-11-15, layout chosen by Claude)**
- History lists goal deposits together with transactions, newest first. A deposit row shows the goal, the amount and the label "Savings"; each deposit has its own trash icon to delete just that deposit (the money returns to the balance). **(owner request 2026-11-15)**
- Excel (CSV) export contains the deposits too: type "Savings", category column = goal name, same positive amount. Balance = income − savings − expenses, so savings come off the total. **(owner request 2026-11-15)**
- Deleting a goal: the user chooses in the dialog. Default "Delete goal, keep history": the goal disappears from the Goals tab, but its deposits stay in history, stats, balance and export (the goal is archived). Second choice "Delete goal and its deposits": everything is erased and the money returns to the balance. The owner left the choice to Claude; keep-history is the default because the money really was set aside. **(Claude's choice, confirm or change)**
- Swipe sideways (from the screen edge) goes back on every screen opened from another screen, on iOS and Android. **(owner request 2026-11-15)**
- Swipe between the main tabs: swipe left opens the tab on your right, swipe right the tab on your left, like turning pages (Today, Stats, Goals, More, left to right). Nothing happens at the first and last tab. **(owner request 2026-11-15, direction flipped 2026-11-19)**
- Not in v1: accounts (cash / card), transfers, tags, receipt photos. Wallets (separate books) are in, see "Wallets".

## Wallets

Decided by the owner 2026-11-17. Layout and details chosen by Claude from the approved mockup.

- A user can have up to **4 wallets** (for example personal, business). Same limit on every plan. One subscription covers all of them.
- Each wallet is a separate book: its own transactions, categories, budgets, recurring rules, goals and deposits. Wallets never mix: no totals across wallets, no transfers between them.
- Per wallet: name, color, icon, order, budget month start day, overall monthly budget.
- For the whole account: currency, language, theme, notifications. (One currency keeps the numbers simple; a per-wallet currency can come later without breaking data.)
- Every account has at least one wallet. The first one is "Personal" (translated name until the user renames it). Existing data moves into it, so nothing changes for a user who never adds a second wallet.
- A new wallet starts with the default categories and no budgets, goals or transactions.
- The app opens on the wallet used last on this device. If that wallet is gone, it opens the first one.
- **Which wallet am I in:** a chip with the wallet's color dot and name at the top of Home, Stats and Goals; the add sheet says "In wallet: X".
- **Switch / create / edit:** tap the chip → a sheet slides up from the bottom: the wallets (current one checked, tap to switch), a pencil on each to edit name, color and icon, and "New wallet" with a count (3/4). At 4 wallets "New wallet" is replaced by "Up to 4 wallets".
- **Manage:** More → Wallets: order (move up / down), edit, export the wallet to CSV, delete.
- **Delete:** only from More → Wallets. Deletes the wallet and all its data for good. The dialog offers the CSV export first and asks the user to type the wallet's name. The last wallet cannot be deleted. When the current wallet is deleted, the app moves to the first remaining one.
- History and the CSV export cover the current wallet only.
- **History list (owner 2026-11-21):** newest first, 50 rows at a time; the next 50 load as the user scrolls to the end (no "load more" button). Only rows on screen are drawn, so thousands of rows stay smooth.
- **Upcoming in history (owner 2026-11-21):** rows dated after today (the remaining payments of installments) are not mixed into the list. They sit in one folded group "Upcoming payments (N)" at the top, soonest first; tap to open or close it. Folded by default.
- **CSV export is always complete (owner 2026-11-21):** the export (History and More → Wallets) reads every row of the wallet from the server in batches, never only what the list has loaded, upcoming payments included. Offline, the History export has only what is on the phone (see "Offline").
- Enforced in the database: the 4 limit, the last-wallet rule, and that every row's wallet belongs to the same user.

## Screens

- Tabs: Today (home), Stats, Goals, More.
- Home: no wallet logo in the header after login (owner 2026-11-14); wallet chip (see "Wallets"), bell, date, period expense total, overall left, Income and Expense buttons, category cards. Tap a card → that period's transactions with edit / delete.
- Add transaction: bottom sheet; category is an icon grid with a "+" tile at the end.
- Export is a CSV file (opens in Excel and Google Sheets, Hebrew included).
- Stats: monthly / yearly, expense / income, previous / next period, donut with total in the center, legend with percent and sum, change versus the previous period.
- Goals: cards with target, saved, progress bar, deposit button.
- More: account, language, theme, currency, wallets, budget month start and overall budget (of the current wallet), notifications, history + Excel export, delete account, sign out, About (last row).
- Home cards intro (owner 2026-11-18): the first time home shows after the app launches, its cards (expense categories, then savings, then income, top to bottom) appear one after another: each fades in and rises 12 px over 0.45 s, the next starts 0.1 s later, all done within 1 s (the gap shrinks when there are many). Not again on tab or wallet switch, refresh or a new transaction. With "reduce motion" they show at once. No effect on any amount.
- Bottom tabs (owner 2026-11-18): icons only, no labels; a soft pill slides to the chosen tab.
- Login and every register step: wallet illustration with moving 3D leaves. Many leaves across the app.
- Reminders: see "Notifications". The daily "log your spending" reminder is dropped (owner 2026-11-15).
- Delete account: hard delete of all data and the auth user, after confirmation.
- Works without internet in part: see "Offline".

## About and app review

Decided by the owner 2026-11-17. No effect on any amount, budget or stat.

- **About:** the last row in More opens an About screen: the logo wallet, "Kaspilo", two short lines on what the app is, Terms of use (read only, same text as at sign-up; the privacy policy is its section 9), Rate us, Contact, and the app version with build number at the bottom.
- **Contact:** a line with the owner's email (MyKaspilo@gmail.com); tapping it opens a new mail. No WhatsApp for now.
- **Rate us (About):** opens the store's write-a-review page (App Store / Google Play). Shown only once the store link is set in the app config; until the app is in the stores the row is hidden.
- **Automatic review prompt:** the native in-app review dialog of iOS / Android, never our own "do you like Kaspilo?" question first.
  - When: right after a transaction is saved (back on home), or right after a goal deposit that reaches the goal's target.
  - Only if: at least 7 days since this user first opened the app on this phone, and at least 10 transactions saved on this phone.
  - At most once every 120 days (our own limit; Apple and Google add their own limits and may still show nothing).
  - Never on first launch, mid-task or after an error. Counters are kept on the phone per user.

## Offline

Decided by the owner 2026-11-18.

- **Fast start:** the last data seen (wallets, categories, totals, transactions, goals, settings) is kept on the phone per user, at most 7 days old. For History, the phone keeps the current wallet's last 3 months (owner 2026-11-21); older rows need the internet. The app opens with it at once and refreshes in the background when online. Signing out or deleting the account clears it.
- **Access offline:** the last subscription status read from the server is kept on the phone. Offline, the app opens if that status still gives access (expiry date not passed). Display only: the server (RLS) decides every read and write.
- **Add offline:** only a plain income or expense (no repeat, no installments). It is saved on the phone in a queue, with the wallet that was open when it was added, and sent when the internet is back. Each one gets its id on the phone, so sending twice never makes two rows.
- **Counted at once:** a queued transaction counts in its own wallet's totals, budgets, stats and lists right away, with a small "not synced" tag. Once the server has it, the tag goes.
- **Rejected by the server** (for example the subscription expired meanwhile, or the wallet was deleted): it is marked "pending", no longer counted, and the user chooses Retry or Delete. Home shows a line while any are pending.
- **Queued can be deleted** on the phone before it is sent. It cannot be edited until it is sent.
- **Needs internet:** editing or deleting a synced transaction, repeats, installments, goals and deposits, categories, wallets, settings, a wallet's export from More → Wallets. Offline, adding, editing and deleting a transaction say "needs internet"; the other actions show their usual error under the offline bar. History export works offline with what is on the phone (refused ones left out).
- **Offline bar:** a thin bar at the top while there is no connection.
- **Sign out with a queue:** warns "N transactions were not sent and will be lost". Deleting the app loses the queue with no warning.

## Notifications

Decided by the owner 2026-11-15. No effect on any amount, budget or stat.

- Three kinds, each with its own switch (small animation) on a Notifications screen under More. The home bell opens the same screen. All default on.
- **Renewal** — sent by the server (push), so it always follows the real `expires_at`, also when the admin extended access and the app was not opened. Sent 30 days, 7 days and 1 day before expiry, and on the expiry day. `family` (no expiry) gets none. Tap opens a Renew screen: expiry date + "Contact the Kaspilo team" on WhatsApp. Sent once per kind per expiry date.
  - Sent by the daily job at 08:00 UTC (10:00 Israel in winter, 11:00 in summer). Days are counted in Israel time. **(assumed)**
  - Needs a development / store build and push credentials (Firebase for Android, Apple Developer account for iPhone). Does not work in Expo Go. iPhone starts working when the owner adds the Apple account; see `docs/notifications-setup.md`.
- **Inactivity** — scheduled by the phone itself (local, no server). "Use" = opening the app. Reminders at 19:00 on day 4, day 14 and day 24 after the last open, then silence until the next open. Light tone, three different texts.
- **Purchase detected** (owner 2026-11-22, replaces the earlier one-line plan). A reminder only: it never adds anything by itself, so no amount, budget or stat changes until the user saves.
  - **What the user sees:** after an Apple Pay / Google Pay purchase, a local notification (not push, made on the phone). The app does not open by itself. Tapping it opens the expense sheet: amount filled, the merchant name in the description, date today, the current wallet (changeable from the "In wallet: X" chip), **no category chosen**: the user always picks it, then saves. No merchant → category memory.
  - **Texts** (app language):
    - Amount and merchant: "Purchase detected" / "₪45 at Shufersal. Add it?"
    - Purchase in another currency than the user's: amount left empty (no conversion, see "Money"), merchant only: "Purchase at Amazon. Add it?"
    - Amount or merchant could not be read: a generic text, "Hey, we caught a purchase. Let's add it" (owner wording, final text in both languages at build time), and the sheet opens empty.
  - Every purchase gets its own notification; each one opens its own amount and merchant.
  - Not sent when the user's access has ended (the app is locked, they cannot add). Not sent when signed out or when the switch is off.
  - Not sent for a refund (a negative amount), and on Android not for a Wallet notification with no amount in it (card added, pass, offer): those are not purchases. (Claude's choice)
  - **iPhone:** Apple gives apps no access to payments. The app ships a native Shortcuts action ("Kaspilo purchase", an App Intent) that takes amount, currency and merchant and shows the notification without opening the app. Works only for Apple Pay with cards in Wallet. Setup, once, from the Notifications screen (and offered on the last onboarding screen), a short guided flow in the app's style (owner 2026-11-22, from reference screenshots):
    - Intro screen: "Set it up once, then it happens by itself", three short points (one-time, stays on your phone, guided with pictures), "Let's set it up" / "Later".
    - **iOS 17 to 26 (manual):** a step-by-step guide with a progress bar, a screenshot per step with the tap point marked (a soft, see-through green ring that pulses slowly), Back / Next and "Open Shortcuts". Six steps, screenshots from the owner's iOS 26 iPhone with the time cropped off and the owner's cards blurred (owner 2026-11-23): (1) Automation → "New Automation" (or +), (2) "Wallet", (3) keep the cards and categories selected, "Run Immediately" if shown, Next, (4) search "Kaspilo" → "Kaspilo purchase" (not "New Blank Shortcut"), (5) Amount → Shortcut Input → "Amount", (6) Merchant → Shortcut Input → "Merchant", then ✓. Finishing the guide marks setup done on this phone.
    - **First screen below iOS 27 (owner 2026-11-23, from the reference):** automatic setup is the better way, so the setup opens with "Automatic capture needs iOS 27 or later", Settings → General → Software Update, a phone showing "iOS 27" that sways in 3D like the login wallet, a button to Apple's update guide, and under it "Manual setup for iOS 26" (always 26, owner 2026-11-23) → the intro (with a note that this is the manual path) → the guide.
    - **iOS 27 and later (owner 2026-11-23, from the reference):** a shared shortcut (iCloud link, `IOS27_SHORTCUT_URL` in `apps/mobile/src/purchase/index.ts`) named "Kaspilo", with the trigger "When I get a notification from Wallet" and the action "Kaspilo purchase" (Amount = the notification's body, Merchant = its title). Overview "Automatic capture" (needs iOS 27, 3 short steps, "Let's start" / "Manual setup"), then: (1) "Add the shortcut" (drawing of Apple's sheet with "Add Shortcut" ringed; "Open the shortcut", "Already added, continue"), (2) "Turn on the automation" (tap the Kaspilo shortcut; in the "When…" card the ‹ arrow (A), then the switch (B); Wallet selected, runs immediately; "Open the shortcut" opens it by name), (3) "Did you tap ▶ and allow?" (running it by hand sends a test reminder; "Yes, I did it" / "Try again"). Until the link is set, iOS 27 gets the manual guide with a note that its screens may look a bit different. The link is JS only, so it can reach installed apps by an update, no store build.
    - **Reading a Wallet notification (iOS 27 path):** only an amount with a currency sign counts ("₪45.90 with Visa •••• 1234" → 45.90; card digits never count). A Wallet notification with no such amount (card added, pass, offer) is not a purchase: no reminder. Amount in the title instead of the body: the generic reminder. Run by hand with no input: the generic reminder (the setup's test). Same rules as Android. (Claude's choice)
    - Below iOS 17: no Wallet trigger. The row says it needs iOS 17 or later; manual adding still works.
    - Apple's sharing behaviour on iOS 27 is checked on a real iOS 27 iPhone at build time; if it differs, iOS 27 falls back to the manual guide.
  - **Android:** the app reads only Google Wallet's payment notifications (a notification listener; every other app's notifications are ignored). Setup, once: an explanation screen first, then the phone's "Notification access" settings to switch Kaspilo on. Google Play requires that explanation (prominent disclosure).
  - **Privacy:** amount and merchant stay on the phone; nothing is sent to the server or stored until the user saves the expense. The privacy page says so.
  - **Switch:** the "Purchase detected" row on the Notifications screen. Before setup it shows "Set up" instead of a switch; after setup it is a switch like the others, on by default, with a "Setup guide" link under it to open the guide again. Set up = the guide was finished on this phone or a purchase was already caught (iPhone), or Kaspilo is on under "Notification access" (Android, read again on every return to the screen). Below iOS 17 the row has no button and says it needs iOS 17. (layout chosen by Claude)
  - Offline: works (all on the phone); saving uses the offline queue like any expense.
  - Needs native code on both platforms, so it ships in a store build, never in an update. Until that build the row keeps showing "Soon".
- Permission: asked after the first arrival at home, with a short explanation before the system prompt. If refused, the Notifications screen shows "Open settings".
- Switches are saved per device (a new phone starts with all on). Both switches and the device language are also saved with the device's push token, so the server knows whether and in which language to send.
- Language: notifications use the app language. Changing the language changes them too, with nothing for the user to do.
- Signing out removes the device's push token and cancels its scheduled reminders.
- Push delivery: Firebase (free Spark plan) is used only as the delivery pipe to Android; no data is kept there. iPhone goes through Apple when the developer account exists. (owner 2026-11-16)
- **Manual send** from the admin dashboard (owner 2026-11-16), for sending by hand or testing:
  - To one active user (a "Notify" button in that user's row) or to all active users (a "Notify all" button above the list).
  - A dropdown lists every kind: renewal in a month / in a week / tomorrow / today, the three inactivity texts, and "Custom message". "Purchase detected (test)" (owner 2026-11-23, was "not in this list"): the phone's purchase reminder sent as a push, so the owner can see it on a device. The admin types an amount and a merchant (default 45.90, Shufersal); each device gets the app's purchase texts in its language and the user's currency, and tapping opens a new expense with the amount and the merchant, no category. Goes to devices with at least one switch on (the purchase switch lives only on the phone). Saves nothing. The real reminder still never goes through the server.
  - Custom message: a one-time title (up to 60 characters) and text (up to 200), sent as written to every device, in whatever language the admin wrote. Not saved.
  - Ready-made kinds arrive in each device's own language.
  - Resets nothing: not written to the sent log, does not move the inactivity countdown, and the automatic reminder still arrives on its day.
  - Respects the user's switches (owner 2026-11-22, was "sent anyway"): renewal kinds go only to devices with the renewal switch on, inactivity kinds only to devices with the inactivity switch on, a custom message to devices with at least one switch on (custom rule chosen by Claude). The dialog shows how many devices are skipped. Both switches are saved with the push token.
  - The dialog shows who will get it (users, registered devices) before sending and "sent to N devices" after. A user with no registered device gets nothing, and the dialog says so.
  - Admins only, enforced in the database. No audit log of manual sends.

## Analytics (owner 2026-11-18)

Product analytics: growth, use and engagement. Never the users' money: no amounts, categories or wallets.

- Stored in our own Supabase (table of events), no third-party analytics SDK.
- Events (all others are computed from these):
  - `first_open`: first launch on a device. Carries a random device id made on the phone (no user yet).
  - `signup_started`: "Continue" pressed on the name step of sign-up.
  - `signup_completed`: account created; method `email` | `google` | `apple`.
  - `first_app_entry`: first time the user reaches home with access (after admin approval).
  - `app_open`: the app comes to the front while signed in, at most once per 30 minutes.
  - "Approved" is read from `profiles.approved_at`, no event.
- Each event keeps: name, time, user id or device id, platform, app version. Nothing else: no IP, device model, location.
- Funnel: first open → sign-up started → sign-up completed → approved → first app entry.
- Active user on a day: has an `app_open` that day and has access. Locked users (pending, expired, rejected) are not active. DAU / WAU / MAU = distinct active users in the day / last 7 / last 30 days.
- New vs returning on a day: new = first app entry that day; returning = active that day with first entry on an earlier day.
- Platform (owner 2026-11-18): active users and first opens are split iPhone / Android. A user seen on both in the range counts once, by the device of their last app open. The CSV has `dau_ios` and `dau_android` per day.
- "Signed up but did not start": approved, and no transaction added in the 7 days after first app entry (only "any transaction exists", never amounts).
- Retention D1 / D7 / D30: cohort = day of first app entry; Dn = share of the cohort with an `app_open` exactly n days later. Always shown with the count ("3 of 8").
- Days are Israel time (Asia/Jerusalem).
- Admins and dev test users are not counted anywhere.
- Account deletion deletes the user's events. Daily totals (numbers only, no user ids) are kept forever, so past charts do not change.
- Raw events are kept 25 months, then deleted by the daily job.
- No opt-out switch and no tracking prompt (first-party, no cross-app tracking). The terms get one line: we count app use, not your money (bump `TERMS_VERSION`).
- Offline: events wait in a small queue on the phone and are sent when back online; an event older than 7 days is dropped.
- Sending: one database function `track_event`, accepts only the names above, rate-limited. Clients cannot read events; only admins, through functions.
- App downloads are not counted here (App Store Connect / Play Console). `first_open` stands in.
- Admin page "Analytics":
  - Range: last 7 / 30 / 90 days, a chosen month, or a chosen year.
  - Cards: DAU, WAU, MAU, DAU/MAU for today.
  - Line chart: DAU over the range. Stacked bars: new vs returning.
  - Funnel: horizontal bars with the drop between steps.
  - Platform: active users and first opens, iPhone vs Android.
  - Retention table by weekly cohorts.
  - Download: CSV of the daily numbers for the chosen range (counts only, no user ids).
  - Charts with Recharts.

## Admin web

- English, admins only, layout as in the owner's mockup. Works on phone and desktop (owner 2026-11-18): the menu folds into a top button, tables turn into cards on narrow screens, Analytics cards go 2×2 with full-width charts and a sideways-scrolling retention table.
- KPIs: total users, active subscribers, pending approvals, expiring soon.
- Pending approvals: approve (pick plan: paid / vip / family, and length: 1 year / 2 months) or reject.
- Users: extend access (1 year / 2 months), change plan, see status and expiry.

## Future (not built now, keep room)

- Purchase detection: see "Notifications".
- WhatsApp bot for approvals.

## Dev test users

Four users in the dev project: one admin, one active client (with sample data), one pending, one expired. Credentials are kept in the gitignored `supabase/seed/dev-users.local.md`.
