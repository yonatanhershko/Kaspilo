---
name: backend-supabase
description: Supabase work for Kaspilo - PostgreSQL schema, migrations, Row Level Security, auth, storage, edge functions and cron. Use for anything under supabase/ or any query design.
---

# Backend Supabase

- Schema changes are migration files in `supabase/migrations/` named `YYYYMMDDHHMMSS_what.sql`. Never edit an applied one. Destructive changes need the owner's OK.
- Every new table: `enable row level security` in the same migration, plus policies for select / insert / update / delete. A table without policies is a bug.
- Ownership column is `user_id uuid not null default auth.uid() references auth.users on delete cascade`. Policies compare to `(select auth.uid())`.
- Financial tables also require `public.has_access((select auth.uid()))` so locked users cannot read or write through the API.
- Protected profile fields (`role`, `status`, `plan`, `approved_at`, `expires_at`) change only inside `security definer` functions with `set search_path = ''` that check `public.is_admin()`.
- Amounts are `bigint` minor units with `check (amount > 0)`. Dates of transactions are `date`.
- Index every foreign key and every column used in a policy or a period filter.
- Aggregations for stats run in SQL (views with `security_invoker = true` or RPCs), not by downloading rows.
- Edge functions verify the caller's JWT, use the secret key only from function secrets, and return no internals in errors.
- After a migration: run security + performance advisors, regenerate TypeScript types, test RLS as two different users and as a locked user.
