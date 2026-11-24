-- In-app purchase (Apple / Google through RevenueCat) next to admin grants.
-- Rules: docs/spec.md "Subscription and access" (owner 2026-11-24), .claude/rules/security.md
--
-- Access now has two sources:
--   grant  — set by an admin: profiles.plan + profiles.grant_expires_at (family: no end)
--   store  — a store subscription, mirrored from RevenueCat into store_subscriptions
-- profiles.expires_at becomes the later of the two, kept by recompute_access().
-- has_access() still reads only profiles.status + profiles.expires_at, so RLS is unchanged.
-- Nothing is deleted: existing admin dates are copied into grant_expires_at.

-- ---------------------------------------------------------------------------
-- Profiles: the admin date apart from the effective date
-- ---------------------------------------------------------------------------

alter table public.profiles
  add column grant_expires_at timestamptz,
  add column access_via text check (access_via in ('store', 'grant'));

update public.profiles
set grant_expires_at = expires_at,
    access_via = case when plan is not null then 'grant' end
where plan is not null;

-- Active means: family (no end) or some end date. A store user has no admin plan.
alter table public.profiles drop constraint profiles_expiry_matches_plan;
alter table public.profiles add constraint profiles_expiry_matches_plan check (
  status <> 'active'
  or (plan = 'family' and expires_at is null)
  or expires_at is not null
);

-- ---------------------------------------------------------------------------
-- Store subscriptions: one row per user, written only by the server
-- ---------------------------------------------------------------------------

create table public.store_subscriptions (
  user_id uuid primary key references public.profiles (id) on delete cascade,
  store text not null check (store in ('app_store', 'play_store', 'test_store', 'promotional', 'other')),
  product_id text not null check (char_length(product_id) <= 100),
  plan text check (plan in ('monthly', 'yearly')),
  period_type text not null check (period_type in ('trial', 'intro', 'normal')),
  -- end of access from the store, grace period included
  expires_at timestamptz not null,
  will_renew boolean not null default false,
  billing_issue_at timestamptz,
  refunded_at timestamptz,
  is_sandbox boolean not null default false,
  updated_at timestamptz not null default now()
);

create index store_subscriptions_expires_idx on public.store_subscriptions (expires_at);

alter table public.store_subscriptions enable row level security;

create policy "store_subscriptions: read own or admin reads all"
on public.store_subscriptions for select
to authenticated
using (user_id = (select auth.uid()) or (select public.is_admin()));

-- No insert / update / delete policy: only store_apply() (security definer) writes.
revoke all on public.store_subscriptions from anon, authenticated;
grant select on public.store_subscriptions to authenticated;

-- Webhook events already seen, so a repeated delivery is not counted twice.
create table public.store_webhook_events (
  event_id text primary key check (char_length(event_id) <= 100),
  received_at timestamptz not null default now()
);

create index store_webhook_events_received_idx on public.store_webhook_events (received_at);

alter table public.store_webhook_events enable row level security;

create policy "store_webhook_events: admin reads"
on public.store_webhook_events for select
to authenticated
using ((select public.is_admin()));

revoke all on public.store_webhook_events from anon, authenticated;
grant select on public.store_webhook_events to authenticated;

-- ---------------------------------------------------------------------------
-- Audit and analytics: new kinds
-- ---------------------------------------------------------------------------

alter table public.subscription_events drop constraint subscription_events_action_check;
alter table public.subscription_events add constraint subscription_events_action_check check (
  action in ('approve', 'reject', 'extend', 'set_plan', 'resubmit', 'expire', 'grant', 'revoke', 'store')
);
alter table public.subscription_events
  add column note text check (char_length(note) <= 200),
  add column store_event text check (char_length(store_event) <= 40);

alter table public.analytics_events drop constraint analytics_events_name_check;
alter table public.analytics_events add constraint analytics_events_name_check check (
  name in (
    'first_open', 'signup_started', 'signup_completed', 'first_app_entry', 'app_open',
    'paywall_viewed',
    'trial_started', 'subscribed', 'renewed', 'cancelled', 'refunded', 'billing_issue', 'access_granted'
  )
);
alter table public.analytics_events
  add column plan text check (plan in ('monthly', 'yearly', 'paid', 'vip', 'family'));

-- ---------------------------------------------------------------------------
-- The one place that decides a user's access from both sources
-- ---------------------------------------------------------------------------

create function public.recompute_access(p_user_id uuid)
returns public.profiles
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_profile public.profiles;
  v_store_end timestamptz;
  v_end timestamptz;
  v_via text;
  v_status public.account_status;
begin
  select * into v_profile from public.profiles where id = p_user_id for update;
  if not found then
    raise exception 'user not found' using errcode = 'P0002';
  end if;
  select expires_at into v_store_end from public.store_subscriptions where user_id = p_user_id;

  if v_profile.plan = 'family' then
    v_end := null;
    v_via := 'grant';
    v_status := 'active';
  else
    v_end := greatest(v_profile.grant_expires_at, v_store_end); -- nulls are skipped
    v_via := case
      when v_end is null then null
      when v_store_end is not null and v_store_end >= coalesce(v_profile.grant_expires_at, '-infinity') then 'store'
      else 'grant'
    end;
    v_status := case
      when v_end > now() then 'active'
      when v_end is not null then 'expired'
      when v_profile.status in ('active', 'expired') then 'expired'
      else v_profile.status -- never had access: stays as it is
    end;
  end if;

  update public.profiles
  set status = v_status,
      expires_at = case when v_status = 'active' or v_end is not null then v_end else expires_at end,
      access_via = v_via,
      approved_at = case when v_status = 'active' then coalesce(approved_at, now()) else approved_at end
  where id = p_user_id
  returning * into v_profile;

  return v_profile;
end;
$$;

-- ---------------------------------------------------------------------------
-- Admin grants
-- ---------------------------------------------------------------------------

-- 1, 2, 3 calendar months or 1 year (365 days, as before).
create or replace function public.access_duration(p_months integer)
returns interval
language plpgsql
immutable
set search_path = ''
as $$
begin
  if p_months = 12 then
    return interval '365 days';
  elsif p_months in (1, 2, 3) then
    return make_interval(months => p_months);
  end if;
  raise exception 'duration must be 1, 2, 3 or 12 months' using errcode = '22023';
end;
$$;

-- Give or extend admin access. Length: p_months, or p_until (a date: access lasts to
-- the end of that day, Israel time). family ignores both. A note is kept in the log.
-- New admin date = old admin date + length while it is still in the future, else now + length.
create function public.admin_grant_access(
  p_user_id uuid,
  p_plan public.access_plan,
  p_months integer default null,
  p_until date default null,
  p_note text default null
)
returns public.profiles
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_profile public.profiles;
  v_old_effective timestamptz;
  v_new_grant timestamptz;
begin
  if not public.is_admin() then
    raise exception 'not allowed' using errcode = '42501';
  end if;
  if p_note is not null and char_length(p_note) > 200 then
    raise exception 'note too long' using errcode = '22023';
  end if;

  select * into v_profile from public.profiles where id = p_user_id for update;
  if not found then
    raise exception 'user not found' using errcode = 'P0002';
  end if;
  v_old_effective := v_profile.expires_at;

  if p_plan = 'family' then
    v_new_grant := null;
  elsif p_until is not null and p_months is null then
    v_new_grant := ((p_until + 1)::timestamp at time zone 'Asia/Jerusalem');
    if v_new_grant <= now() then
      raise exception 'date must be in the future' using errcode = '22023';
    end if;
  elsif p_months is not null and p_until is null then
    v_new_grant := greatest(coalesce(v_profile.grant_expires_at, now()), now()) + public.access_duration(p_months);
  else
    raise exception 'give months or a date' using errcode = '22023';
  end if;

  -- expires_at is set here too only so the row stays valid in between
  -- (an active row needs a date unless family); recompute_access sets the real one.
  update public.profiles
  set plan = p_plan, grant_expires_at = v_new_grant, expires_at = coalesce(v_new_grant, expires_at)
  where id = p_user_id;

  v_profile := public.recompute_access(p_user_id);

  insert into public.subscription_events (user_id, actor_id, action, plan, old_expires_at, new_expires_at, note)
  values (p_user_id, (select auth.uid()), 'grant', p_plan, v_old_effective, v_profile.expires_at, nullif(trim(p_note), ''));

  insert into public.analytics_events (name, user_id, plan, occurred_at)
  values ('access_granted', p_user_id, p_plan::text, now());

  return v_profile;
end;
$$;

-- End admin access now. A store subscription is not touched (only the stores cancel it).
create function public.admin_revoke_access(p_user_id uuid, p_note text default null)
returns public.profiles
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_profile public.profiles;
  v_old_effective timestamptz;
begin
  if not public.is_admin() then
    raise exception 'not allowed' using errcode = '42501';
  end if;
  if p_note is not null and char_length(p_note) > 200 then
    raise exception 'note too long' using errcode = '22023';
  end if;

  select * into v_profile from public.profiles where id = p_user_id for update;
  if not found then
    raise exception 'user not found' using errcode = 'P0002';
  end if;
  if v_profile.plan is null then
    raise exception 'user has no admin access' using errcode = 'P0001';
  end if;
  v_old_effective := v_profile.expires_at;

  update public.profiles
  set plan = null,
      grant_expires_at = case when grant_expires_at is null or grant_expires_at > now() then now() else grant_expires_at end,
      expires_at = coalesce(expires_at, now())
  where id = p_user_id;

  v_profile := public.recompute_access(p_user_id);

  insert into public.subscription_events (user_id, actor_id, action, old_expires_at, new_expires_at, note)
  values (p_user_id, (select auth.uid()), 'revoke', v_old_effective, v_profile.expires_at, nullif(trim(p_note), ''));

  return v_profile;
end;
$$;

-- The old admin actions keep working until the admin web moves to the two above
-- (phase C), now on the admin date only.
create or replace function public.admin_approve_user(
  p_user_id uuid,
  p_plan public.access_plan default 'paid',
  p_months integer default 12
)
returns public.profiles
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_profile public.profiles;
  v_old timestamptz;
begin
  if not public.is_admin() then
    raise exception 'not allowed' using errcode = '42501';
  end if;
  select * into v_profile from public.profiles where id = p_user_id for update;
  if not found then
    raise exception 'user not found' using errcode = 'P0002';
  end if;
  v_old := v_profile.expires_at;

  update public.profiles
  set plan = p_plan,
      grant_expires_at = case when p_plan = 'family' then null else now() + public.access_duration(p_months) end,
      expires_at = coalesce(case when p_plan = 'family' then null else now() + public.access_duration(p_months) end, expires_at)
  where id = p_user_id;
  v_profile := public.recompute_access(p_user_id);

  insert into public.subscription_events (user_id, actor_id, action, plan, old_expires_at, new_expires_at)
  values (p_user_id, (select auth.uid()), 'approve', p_plan, v_old, v_profile.expires_at);
  return v_profile;
end;
$$;

create or replace function public.admin_extend_user(p_user_id uuid, p_months integer default 12)
returns public.profiles
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_profile public.profiles;
  v_old timestamptz;
begin
  if not public.is_admin() then
    raise exception 'not allowed' using errcode = '42501';
  end if;
  select * into v_profile from public.profiles where id = p_user_id for update;
  if not found then
    raise exception 'user not found' using errcode = 'P0002';
  end if;
  if v_profile.plan is null then
    raise exception 'user has no admin access; grant instead' using errcode = 'P0001';
  end if;
  if v_profile.plan = 'family' then
    raise exception 'family plan does not expire' using errcode = 'P0001';
  end if;
  v_old := v_profile.expires_at;

  update public.profiles
  set grant_expires_at = greatest(coalesce(grant_expires_at, now()), now()) + public.access_duration(p_months)
  where id = p_user_id;
  v_profile := public.recompute_access(p_user_id);

  insert into public.subscription_events (user_id, actor_id, action, plan, old_expires_at, new_expires_at)
  values (p_user_id, (select auth.uid()), 'extend', v_profile.plan, v_old, v_profile.expires_at);
  return v_profile;
end;
$$;

create or replace function public.admin_set_plan(p_user_id uuid, p_plan public.access_plan)
returns public.profiles
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_profile public.profiles;
  v_old timestamptz;
begin
  if not public.is_admin() then
    raise exception 'not allowed' using errcode = '42501';
  end if;
  select * into v_profile from public.profiles where id = p_user_id for update;
  if not found then
    raise exception 'user not found' using errcode = 'P0002';
  end if;
  if v_profile.status <> 'active' or v_profile.plan is null then
    raise exception 'user has no active admin access' using errcode = 'P0001';
  end if;
  v_old := v_profile.expires_at;

  update public.profiles
  set plan = p_plan,
      grant_expires_at = case
        when p_plan = 'family' then null
        else coalesce(grant_expires_at, now() + interval '365 days')
      end,
      expires_at = coalesce(expires_at, grant_expires_at, now() + interval '365 days')
  where id = p_user_id;
  v_profile := public.recompute_access(p_user_id);

  insert into public.subscription_events (user_id, actor_id, action, plan, old_expires_at, new_expires_at)
  values (p_user_id, (select auth.uid()), 'set_plan', p_plan, v_old, v_profile.expires_at);
  return v_profile;
end;
$$;

-- ---------------------------------------------------------------------------
-- Store state from RevenueCat (called only by the Edge Functions, secret key)
-- ---------------------------------------------------------------------------

-- p_state: null when the user has no store subscription, else
--   { store, product_id, plan, period_type, expires_at, will_renew,
--     billing_issue_at, refunded_at, is_sandbox }
-- p_event_id / p_event_type: the webhook event (null for a sync from the app).
-- p_analytics: the analytics event to count once for this webhook event, or null.
-- Applying the same state twice changes nothing, so repeats and out-of-order
-- deliveries are safe: the state is always read fresh from RevenueCat.
create function public.store_apply(
  p_user_id uuid,
  p_state jsonb,
  p_event_id text default null,
  p_event_type text default null,
  p_analytics text default null
)
returns public.profiles
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_profile public.profiles;
  v_old timestamptz;
  v_new_event boolean := true;
begin
  select * into v_profile from public.profiles where id = p_user_id for update;
  if not found then
    return null; -- an unknown or deleted user: nothing to do
  end if;
  v_old := v_profile.expires_at;

  if p_state is null or jsonb_typeof(p_state) = 'null' then
    delete from public.store_subscriptions where user_id = p_user_id;
  else
    insert into public.store_subscriptions as s (
      user_id, store, product_id, plan, period_type, expires_at, will_renew,
      billing_issue_at, refunded_at, is_sandbox, updated_at
    )
    values (
      p_user_id,
      p_state ->> 'store',
      p_state ->> 'product_id',
      p_state ->> 'plan',
      p_state ->> 'period_type',
      (p_state ->> 'expires_at')::timestamptz,
      coalesce((p_state ->> 'will_renew')::boolean, false),
      (p_state ->> 'billing_issue_at')::timestamptz,
      (p_state ->> 'refunded_at')::timestamptz,
      coalesce((p_state ->> 'is_sandbox')::boolean, false),
      now()
    )
    on conflict (user_id) do update
    set store = excluded.store,
        product_id = excluded.product_id,
        plan = excluded.plan,
        period_type = excluded.period_type,
        expires_at = excluded.expires_at,
        will_renew = excluded.will_renew,
        billing_issue_at = excluded.billing_issue_at,
        refunded_at = excluded.refunded_at,
        is_sandbox = excluded.is_sandbox,
        updated_at = now();
  end if;

  v_profile := public.recompute_access(p_user_id);

  if p_event_id is not null then
    insert into public.store_webhook_events (event_id) values (p_event_id)
    on conflict do nothing;
    v_new_event := found;
  end if;

  if v_new_event and (p_event_type is not null or v_old is distinct from v_profile.expires_at) then
    insert into public.subscription_events (user_id, action, old_expires_at, new_expires_at, store_event)
    values (p_user_id, 'store', v_old, v_profile.expires_at, coalesce(left(p_event_type, 40), 'sync'));
  end if;

  if v_new_event and p_analytics in (
    'trial_started', 'subscribed', 'renewed', 'cancelled', 'refunded', 'billing_issue'
  ) then
    insert into public.analytics_events (name, user_id, plan, occurred_at)
    values (p_analytics, p_user_id, p_state ->> 'plan', now());
  end if;

  return v_profile;
end;
$$;

-- Webhook events older than 60 days are no longer needed to spot repeats.
create function public.store_webhook_cleanup()
returns integer
language sql
security definer
set search_path = ''
as $$
  with gone as (
    delete from public.store_webhook_events where received_at < now() - interval '60 days' returning 1
  )
  select count(*)::integer from gone;
$$;

select cron.schedule('kaspilo-store-webhook-cleanup', '20 0 * * *', $$select public.store_webhook_cleanup()$$);

-- ---------------------------------------------------------------------------
-- Analytics: the paywall is seen by users without access
-- ---------------------------------------------------------------------------

create or replace function public.track_event(
  p_name text,
  p_device_id uuid,
  p_platform text,
  p_app_version text,
  p_occurred_at timestamptz
)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_user uuid := (select auth.uid());
  v_at timestamptz := least(greatest(coalesce(p_occurred_at, now()), now() - interval '8 days'), now());
begin
  if p_name not in ('first_open', 'signup_started', 'first_app_entry', 'app_open', 'paywall_viewed') then
    raise exception 'unknown event' using errcode = '22023';
  end if;
  if p_platform is not null and p_platform not in ('ios', 'android', 'web') then
    raise exception 'bad platform' using errcode = '22023';
  end if;
  if p_app_version is not null and char_length(p_app_version) > 20 then
    raise exception 'bad version' using errcode = '22023';
  end if;
  if p_occurred_at < now() - interval '8 days' then
    return; -- too old (the phone drops these after 7 days too)
  end if;

  if p_name in ('first_open', 'signup_started') then
    if p_device_id is null then
      raise exception 'device id needed' using errcode = '22023';
    end if;
    -- Rate limits: one device 20 per hour; all devices together 600 per hour.
    if (select count(*) from public.analytics_events
        where device_id = p_device_id and received_at > now() - interval '1 hour') >= 20
      or (select count(*) from public.analytics_events
          where user_id is null and received_at > now() - interval '1 hour') >= 600 then
      return;
    end if;
    insert into public.analytics_events (name, device_id, platform, app_version, occurred_at)
    values (p_name, p_device_id, p_platform, p_app_version, v_at)
    on conflict do nothing;
    return;
  end if;

  if v_user is null then
    raise exception 'not signed in' using errcode = '42501';
  end if;
  if (select count(*) from public.analytics_events
      where user_id = v_user and received_at > now() - interval '1 hour') >= 20 then
    return;
  end if;

  -- The paywall is for users without access: count it at most once per 30 minutes.
  if p_name = 'paywall_viewed' then
    if exists (
      select 1 from public.analytics_events
      where user_id = v_user and name = 'paywall_viewed' and occurred_at > v_at - interval '30 minutes'
    ) then
      return;
    end if;
    insert into public.analytics_events (name, user_id, device_id, platform, app_version, occurred_at)
    values (p_name, v_user, p_device_id, p_platform, p_app_version, v_at);
    return;
  end if;

  -- Other user events: with access only (locked users are not active).
  if not public.has_access() then
    return;
  end if;
  -- At most one app open per 30 minutes.
  if p_name = 'app_open' and exists (
    select 1 from public.analytics_events
    where user_id = v_user and name = 'app_open'
      and occurred_at > v_at - interval '30 minutes' and occurred_at <= v_at + interval '30 minutes'
  ) then
    return;
  end if;
  insert into public.analytics_events (name, user_id, device_id, platform, app_version, occurred_at)
  values (p_name, v_user, p_device_id, p_platform, p_app_version, v_at)
  on conflict do nothing;
end;
$$;

-- ---------------------------------------------------------------------------
-- Export while locked (owner 2026-11-24): own rows only, no access needed
-- ---------------------------------------------------------------------------

-- Every transaction and goal deposit of the caller, all wallets, oldest first,
-- in pages: pass the last row's created_at and id to get the next page.
create function public.export_my_rows(
  p_after_at timestamptz default null,
  p_after_id uuid default null,
  p_limit integer default 500
)
returns table (
  id uuid,
  kind text,
  wallet_name text,
  wallet_default_key text,
  date date,
  created_at timestamptz,
  tx_type text,
  deposit_source text,
  category_name text,
  category_default_key text,
  goal_name text,
  description text,
  amount bigint
)
language plpgsql
security definer
set search_path = ''
as $$
#variable_conflict use_column
declare
  v_user uuid := (select auth.uid());
begin
  if v_user is null then
    raise exception 'not signed in' using errcode = '42501';
  end if;
  if p_limit is null or p_limit < 1 or p_limit > 1000 then
    raise exception 'limit must be 1 to 1000' using errcode = '22023';
  end if;
  -- 120 pages a minute is far more than any real export needs.
  perform public.rate_hit('export_my_rows', 60, 120);

  return query
  select * from (
    select t.id, 'tx'::text, w.name, w.default_key, t.date, t.created_at, t.type::text, null::text,
           c.name, c.default_key, null::text, t.description, t.amount
    from public.transactions t
    join public.categories c on c.id = t.category_id and c.user_id = t.user_id
    left join public.wallets w on w.id = t.wallet_id
    where t.user_id = v_user
    union all
    select d.id, 'deposit'::text, w.name, w.default_key, d.date, d.created_at, null::text, d.source,
           null::text, null::text, g.name, ''::text, d.amount
    from public.goal_deposits d
    join public.goals g on g.id = d.goal_id and g.user_id = d.user_id
    left join public.wallets w on w.id = d.wallet_id
    where d.user_id = v_user
  ) r (id, kind, wallet_name, wallet_default_key, date, created_at, tx_type, deposit_source,
       category_name, category_default_key, goal_name, description, amount)
  where p_after_at is null or (r.created_at, r.id) > (p_after_at, p_after_id)
  order by r.created_at, r.id
  limit p_limit;
end;
$$;

-- The app's "sync after purchase / restore" goes through an Edge Function that first
-- calls this as the signed-in user: 10 a minute, 100 a day.
create function public.store_sync_check()
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_user uuid := (select auth.uid());
begin
  if v_user is null then
    raise exception 'not signed in' using errcode = '42501';
  end if;
  perform public.rate_hit('store_sync', 60, 10);
  perform public.rate_hit('store_sync', 86400, 100);
  return v_user;
end;
$$;

-- ---------------------------------------------------------------------------
-- Who may call what
-- ---------------------------------------------------------------------------

revoke execute on function public.recompute_access(uuid) from public, anon, authenticated;
revoke execute on function public.store_apply(uuid, jsonb, text, text, text) from public, anon, authenticated;
revoke execute on function public.store_webhook_cleanup() from public, anon, authenticated;
grant execute on function public.store_apply(uuid, jsonb, text, text, text) to service_role;

revoke execute on function public.admin_grant_access(uuid, public.access_plan, integer, date, text) from public, anon;
revoke execute on function public.admin_revoke_access(uuid, text) from public, anon;
grant execute on function public.admin_grant_access(uuid, public.access_plan, integer, date, text) to authenticated;
grant execute on function public.admin_revoke_access(uuid, text) to authenticated;

revoke execute on function public.export_my_rows(timestamptz, uuid, integer) from public, anon;
grant execute on function public.export_my_rows(timestamptz, uuid, integer) to authenticated;

revoke execute on function public.store_sync_check() from public, anon;
grant execute on function public.store_sync_check() to authenticated;
