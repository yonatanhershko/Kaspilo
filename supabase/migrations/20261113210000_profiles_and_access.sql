-- Profiles, roles, subscription status, and the admin approval flow.
-- Rules: docs/spec.md "Subscription and access", .claude/rules/security.md

create type public.user_role as enum ('client', 'admin');
create type public.account_status as enum ('pending_approval', 'active', 'expired', 'rejected');
-- paid: 1 year after payment. vip: 1 year, granted without payment. family: no expiry.
create type public.access_plan as enum ('paid', 'vip', 'family');

create table public.profiles (
  id uuid primary key references auth.users (id) on delete cascade,
  email text not null,
  full_name text not null default '',
  role public.user_role not null default 'client',
  status public.account_status not null default 'pending_approval',
  plan public.access_plan,
  approved_at timestamptz,
  expires_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  -- an active non-family account always has an expiry; family never has one
  constraint profiles_expiry_matches_plan check (
    status <> 'active'
    or (plan = 'family' and expires_at is null)
    or (plan in ('paid', 'vip') and expires_at is not null)
  )
);

create index profiles_status_idx on public.profiles (status);
create index profiles_expires_at_idx on public.profiles (expires_at) where status = 'active';

-- Who did what to whose subscription. Admin-readable audit trail.
create table public.subscription_events (
  id bigint generated always as identity primary key,
  user_id uuid not null references public.profiles (id) on delete cascade,
  actor_id uuid references public.profiles (id) on delete set null,
  action text not null check (action in ('approve', 'reject', 'extend', 'set_plan', 'resubmit', 'expire')),
  plan public.access_plan,
  old_expires_at timestamptz,
  new_expires_at timestamptz,
  created_at timestamptz not null default now()
);

create index subscription_events_user_id_idx on public.subscription_events (user_id);
create index subscription_events_actor_id_idx on public.subscription_events (actor_id);

-- ---------------------------------------------------------------------------
-- Helpers
-- ---------------------------------------------------------------------------

create function public.set_updated_at()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

create trigger profiles_set_updated_at
before update on public.profiles
for each row execute function public.set_updated_at();

-- A profile row for every new auth user. Always starts as a pending client:
-- nothing the client sends at sign-up can change role or status.
create function public.handle_new_user()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  insert into public.profiles (id, email, full_name)
  values (
    new.id,
    coalesce(new.email, ''),
    coalesce(
      nullif(trim(new.raw_user_meta_data ->> 'full_name'), ''),
      nullif(trim(new.raw_user_meta_data ->> 'name'), ''),
      ''
    )
  );
  return new;
end;
$$;

create trigger on_auth_user_created
after insert on auth.users
for each row execute function public.handle_new_user();

create function public.is_admin()
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
    select 1 from public.profiles
    where id = (select auth.uid()) and role = 'admin'
  );
$$;

-- True when the caller may use the app's financial features.
-- Used by RLS on every financial table, so the lock is enforced in the database.
create function public.has_access()
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
    select 1 from public.profiles
    where id = (select auth.uid())
      and (
        role = 'admin'
        or (status = 'active' and (expires_at is null or expires_at > now()))
      )
  );
$$;

-- ---------------------------------------------------------------------------
-- Row Level Security
-- ---------------------------------------------------------------------------

alter table public.profiles enable row level security;
alter table public.subscription_events enable row level security;

create policy "profiles: read own or admin reads all"
on public.profiles for select
to authenticated
using (id = (select auth.uid()) or (select public.is_admin()));

create policy "profiles: update own row"
on public.profiles for update
to authenticated
using (id = (select auth.uid()))
with check (id = (select auth.uid()));

create policy "subscription_events: admin reads"
on public.subscription_events for select
to authenticated
using ((select public.is_admin()));

-- Clients may change only their display name. Role, status, plan and dates
-- change only through the functions below.
revoke all on public.profiles from anon, authenticated;
grant select on public.profiles to authenticated;
grant update (full_name) on public.profiles to authenticated;

revoke all on public.subscription_events from anon, authenticated;
grant select on public.subscription_events to authenticated;

-- ---------------------------------------------------------------------------
-- Admin actions
-- ---------------------------------------------------------------------------

create function public.admin_approve_user(p_user_id uuid, p_plan public.access_plan default 'paid')
returns public.profiles
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_profile public.profiles;
  v_old_expires timestamptz;
  v_new_expires timestamptz;
begin
  if not public.is_admin() then
    raise exception 'not allowed' using errcode = '42501';
  end if;

  select * into v_profile from public.profiles where id = p_user_id for update;
  if not found then
    raise exception 'user not found' using errcode = 'P0002';
  end if;

  v_old_expires := v_profile.expires_at;
  v_new_expires := case when p_plan = 'family' then null else now() + interval '365 days' end;

  update public.profiles
  set status = 'active', plan = p_plan, approved_at = now(), expires_at = v_new_expires
  where id = p_user_id
  returning * into v_profile;

  insert into public.subscription_events (user_id, actor_id, action, plan, old_expires_at, new_expires_at)
  values (p_user_id, (select auth.uid()), 'approve', p_plan, v_old_expires, v_new_expires);

  return v_profile;
end;
$$;

create function public.admin_reject_user(p_user_id uuid)
returns public.profiles
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_profile public.profiles;
begin
  if not public.is_admin() then
    raise exception 'not allowed' using errcode = '42501';
  end if;

  update public.profiles
  set status = 'rejected'
  where id = p_user_id and status = 'pending_approval'
  returning * into v_profile;

  if not found then
    raise exception 'user is not pending approval' using errcode = 'P0002';
  end if;

  insert into public.subscription_events (user_id, actor_id, action)
  values (p_user_id, (select auth.uid()), 'reject');

  return v_profile;
end;
$$;

-- Adds 365 days: from the current expiry when it is still in the future,
-- otherwise from now. Also re-activates an expired account.
create function public.admin_extend_user(p_user_id uuid)
returns public.profiles
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_profile public.profiles;
  v_old_expires timestamptz;
  v_new_expires timestamptz;
begin
  if not public.is_admin() then
    raise exception 'not allowed' using errcode = '42501';
  end if;

  select * into v_profile from public.profiles where id = p_user_id for update;
  if not found then
    raise exception 'user not found' using errcode = 'P0002';
  end if;
  if v_profile.plan is null or v_profile.status not in ('active', 'expired') then
    raise exception 'user was never approved; approve instead' using errcode = 'P0001';
  end if;
  if v_profile.plan = 'family' then
    raise exception 'family plan does not expire' using errcode = 'P0001';
  end if;

  v_old_expires := v_profile.expires_at;
  v_new_expires := greatest(coalesce(v_profile.expires_at, now()), now()) + interval '365 days';

  update public.profiles
  set status = 'active', expires_at = v_new_expires
  where id = p_user_id
  returning * into v_profile;

  insert into public.subscription_events (user_id, actor_id, action, plan, old_expires_at, new_expires_at)
  values (p_user_id, (select auth.uid()), 'extend', v_profile.plan, v_old_expires, v_new_expires);

  return v_profile;
end;
$$;

-- Change the plan of an approved user. To family: expiry is removed.
-- From family to paid / vip: one year from now.
create function public.admin_set_plan(p_user_id uuid, p_plan public.access_plan)
returns public.profiles
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_profile public.profiles;
  v_old_expires timestamptz;
  v_new_expires timestamptz;
begin
  if not public.is_admin() then
    raise exception 'not allowed' using errcode = '42501';
  end if;

  select * into v_profile from public.profiles where id = p_user_id for update;
  if not found then
    raise exception 'user not found' using errcode = 'P0002';
  end if;
  if v_profile.status <> 'active' then
    raise exception 'user is not active; approve or extend first' using errcode = 'P0001';
  end if;

  v_old_expires := v_profile.expires_at;
  v_new_expires := case
    when p_plan = 'family' then null
    else coalesce(v_profile.expires_at, now() + interval '365 days')
  end;

  update public.profiles
  set plan = p_plan, expires_at = v_new_expires
  where id = p_user_id
  returning * into v_profile;

  insert into public.subscription_events (user_id, actor_id, action, plan, old_expires_at, new_expires_at)
  values (p_user_id, (select auth.uid()), 'set_plan', p_plan, v_old_expires, v_new_expires);

  return v_profile;
end;
$$;

create function public.admin_dashboard_stats()
returns json
language plpgsql
stable
security definer
set search_path = ''
as $$
begin
  if not public.is_admin() then
    raise exception 'not allowed' using errcode = '42501';
  end if;

  return (
    select json_build_object(
      'total_users', count(*) filter (where role = 'client'),
      'active_subscribers', count(*) filter (where role = 'client' and status = 'active'),
      'pending_approvals', count(*) filter (where role = 'client' and status = 'pending_approval'),
      'expiring_soon', count(*) filter (
        where role = 'client' and status = 'active'
          and expires_at is not null and expires_at <= now() + interval '30 days'
      )
    )
    from public.profiles
  );
end;
$$;

-- ---------------------------------------------------------------------------
-- Client action: a rejected user asks again
-- ---------------------------------------------------------------------------

create function public.request_approval()
returns public.profiles
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_profile public.profiles;
begin
  update public.profiles
  set status = 'pending_approval'
  where id = (select auth.uid()) and status = 'rejected'
  returning * into v_profile;

  if not found then
    raise exception 'only a rejected account can ask again' using errcode = 'P0001';
  end if;

  insert into public.subscription_events (user_id, actor_id, action)
  values (v_profile.id, v_profile.id, 'resubmit');

  return v_profile;
end;
$$;

-- ---------------------------------------------------------------------------
-- Daily expiry
-- ---------------------------------------------------------------------------

create function public.expire_subscriptions()
returns integer
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_count integer;
begin
  with expired as (
    update public.profiles
    set status = 'expired'
    where status = 'active' and expires_at is not null and expires_at < now()
    returning id, plan, expires_at
  ), logged as (
    insert into public.subscription_events (user_id, action, plan, old_expires_at)
    select id, 'expire', plan, expires_at from expired
    returning 1
  )
  select count(*) into v_count from logged;
  return v_count;
end;
$$;

-- Functions are callable only by who needs them.
revoke execute on function public.handle_new_user() from public, anon, authenticated;
revoke execute on function public.set_updated_at() from public, anon, authenticated;
revoke execute on function public.expire_subscriptions() from public, anon, authenticated;

revoke execute on function public.is_admin() from public, anon;
revoke execute on function public.has_access() from public, anon;
revoke execute on function public.admin_approve_user(uuid, public.access_plan) from public, anon;
revoke execute on function public.admin_reject_user(uuid) from public, anon;
revoke execute on function public.admin_extend_user(uuid) from public, anon;
revoke execute on function public.admin_set_plan(uuid, public.access_plan) from public, anon;
revoke execute on function public.admin_dashboard_stats() from public, anon;
revoke execute on function public.request_approval() from public, anon;

grant execute on function public.is_admin() to authenticated;
grant execute on function public.has_access() to authenticated;
grant execute on function public.admin_approve_user(uuid, public.access_plan) to authenticated;
grant execute on function public.admin_reject_user(uuid) to authenticated;
grant execute on function public.admin_extend_user(uuid) to authenticated;
grant execute on function public.admin_set_plan(uuid, public.access_plan) to authenticated;
grant execute on function public.admin_dashboard_stats() to authenticated;
grant execute on function public.request_approval() to authenticated;
