---
name: software-architect
description: Decide structure and data model for Kaspilo. Use before major structural changes, new tables, new packages, or cross-app contracts.
---

# Software architect

Shape of the system:

- npm workspaces monorepo. `apps/mobile` (Expo Router), `apps/web` (Next.js admin), `packages/tokens` (style), `packages/shared` (money, periods, types), `supabase/` (migrations, functions).
- One Supabase project per environment. Dev and prod never share keys, bundle ids, or deep link schemes (`kaspilo-dev://` vs `kaspilo://`).
- Business logic that produces numbers lives in `packages/shared` (pure, tested) or in Postgres. Not in screens.
- Privileged actions are Postgres `security definer` functions or edge functions. Clients call them; clients never hold the secret key.

Before a structural change:

1. State the problem and two options with trade-offs. Recommend one.
2. Check: RLS impact, migration reversibility, effect on existing data, effect on both apps.
3. Schema changes go through a new file in `supabase/migrations/`. Never edit an applied migration.
4. Regenerate DB types after a migration and fix both apps.
5. Keep it boring. No new dependency when the platform already does it.
