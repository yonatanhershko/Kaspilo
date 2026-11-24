-- Admin web for in-app purchase (docs/spec.md "Admin web", "Analytics"), phase C.
--  * Dashboard KPIs: paying (store), in trial, admin access, without access, ending soon.
--  * Daily analytics: "approved" now means "got access" (first trial, subscription or admin
--    grant; legacy approvals still count), plus paywall views and first paid subscriptions.
--  * admin_analytics: a "subscriptions" block (cards, trial -> paid, cancellations, refunds).
-- Counts only: no prices or amounts are stored or returned.

-- ---- dashboard -------------------------------------------------------------------------

create or replace function public.admin_dashboard_stats()
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
    with u as (
      select p.*,
        (p.status = 'active' and (p.expires_at is null or p.expires_at > now())) as has_access,
        s.period_type, s.will_renew, s.billing_issue_at,
        (s.user_id is not null and s.expires_at > now() and s.refunded_at is null) as store_live
      from public.profiles p
      left join public.store_subscriptions s on s.user_id = p.id
      where p.role = 'client'
    )
    select json_build_object(
      'total_users', count(*),
      'paying', count(*) filter (where store_live and period_type <> 'trial'),
      'in_trial', count(*) filter (where store_live and period_type = 'trial'),
      'admin_access', count(*) filter (where has_access and access_via = 'grant'),
      'without_access', count(*) filter (where not has_access),
      -- Access really ends within 7 days: not a store subscription that renews by itself.
      'expiring_soon', count(*) filter (
        where has_access and expires_at is not null and expires_at <= now() + interval '7 days'
          and not (store_live and coalesce(will_renew, false))
      ),
      'billing_issue', count(*) filter (where store_live and billing_issue_at is not null)
    )
    from u
  );
end;
$$;

-- ---- daily analytics -------------------------------------------------------------------

alter table public.analytics_daily
  add column if not exists paywall_views integer not null default 0,
  add column if not exists paid integer not null default 0;

comment on column public.analytics_daily.approved is
  'Users who got access that day for the first time: trial, subscription or admin grant (legacy: admin approval).';

create or replace function public.analytics_compute_day(p_day date)
returns public.analytics_daily
language sql
stable
security definer
set search_path = ''
as $$
  with counted as (
    select id from public.profiles where role = 'client' and not analytics_excluded
  ),
  ev as (
    select e.name, e.user_id, e.device_id, e.platform, e.occurred_at,
      (e.occurred_at at time zone 'Asia/Jerusalem')::date as d
    from public.analytics_events e
    where e.occurred_at >= ((p_day - 29)::timestamp at time zone 'Asia/Jerusalem')
      and e.occurred_at < ((p_day + 1)::timestamp at time zone 'Asia/Jerusalem')
  ),
  active as (
    select distinct ev.user_id, ev.d from ev
    join counted c on c.id = ev.user_id
    where ev.name in ('app_open', 'first_app_entry')
  ),
  entries as (
    select e.user_id, (min(e.occurred_at) at time zone 'Asia/Jerusalem')::date as d
    from public.analytics_events e
    join counted c on c.id = e.user_id
    where e.name = 'first_app_entry'
    group by e.user_id
  ),
  day_platform as (
    select distinct on (ev.user_id) ev.user_id, ev.platform from ev
    join counted c on c.id = ev.user_id
    where ev.name in ('app_open', 'first_app_entry') and ev.d = p_day
    order by ev.user_id, ev.occurred_at desc
  ),
  -- First time each user got access: store trial / subscription, admin grant, or a legacy approval.
  got_access as (
    select x.user_id, (min(x.at) at time zone 'Asia/Jerusalem')::date as d
    from (
      select e.user_id, e.occurred_at as at from public.analytics_events e
      where e.name in ('trial_started', 'subscribed', 'access_granted')
      union all
      select s.user_id, s.created_at from public.subscription_events s where s.action = 'approve'
    ) x
    join counted c on c.id = x.user_id
    group by x.user_id
  ),
  first_paid as (
    select e.user_id, (min(e.occurred_at) at time zone 'Asia/Jerusalem')::date as d
    from public.analytics_events e
    join counted c on c.id = e.user_id
    where e.name = 'subscribed'
    group by e.user_id
  )
  select
    p_day,
    (select count(distinct user_id) from active where d = p_day)::int,
    (select count(distinct user_id) from active where d > p_day - 7)::int,
    (select count(distinct user_id) from active)::int,
    (select count(*) from entries where d = p_day)::int,
    (select count(*) from active a where a.d = p_day
       and not exists (select 1 from entries n where n.user_id = a.user_id and n.d >= p_day))::int,
    (select count(*) from ev where name = 'first_open' and d = p_day)::int,
    (select count(distinct device_id) from ev where name = 'signup_started' and d = p_day)::int,
    (select count(*) from ev join counted c on c.id = ev.user_id
       where ev.name = 'signup_completed' and ev.d = p_day)::int,
    (select count(*) from got_access where d = p_day)::int,
    (select count(*) from entries where d = p_day)::int,
    now(),
    (select count(*) from day_platform where platform = 'ios')::int,
    (select count(*) from day_platform where platform = 'android')::int,
    (select count(distinct ev.user_id) from ev join counted c on c.id = ev.user_id
       where ev.name = 'paywall_viewed' and ev.d = p_day)::int,
    (select count(*) from first_paid where d = p_day)::int;
$$;

create or replace function public.analytics_rollup()
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_today date := (now() at time zone 'Asia/Jerusalem')::date;
  v_day date;
begin
  for v_day in select generate_series(v_today - 8, v_today - 1, interval '1 day')::date loop
    insert into public.analytics_daily select * from public.analytics_compute_day(v_day)
    on conflict (day) do update set
      dau = excluded.dau, wau = excluded.wau, mau = excluded.mau,
      new_users = excluded.new_users, returning_users = excluded.returning_users,
      first_opens = excluded.first_opens, signups_started = excluded.signups_started,
      signups_completed = excluded.signups_completed, approved = excluded.approved,
      first_entries = excluded.first_entries, computed_at = excluded.computed_at,
      dau_ios = excluded.dau_ios, dau_android = excluded.dau_android,
      paywall_views = excluded.paywall_views, paid = excluded.paid;
  end loop;
  delete from public.analytics_events where occurred_at < now() - interval '25 months';
end;
$$;

-- ---- subscriptions block of the analytics page -----------------------------------------

create or replace function public.admin_subscription_report(p_from date, p_to date)
returns jsonb
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  v_from timestamptz := p_from::timestamp at time zone 'Asia/Jerusalem';
  v_to timestamptz := least((p_to + 1)::timestamp at time zone 'Asia/Jerusalem', now());
  v_now jsonb;
  v_trials jsonb;
  v_months jsonb;
begin
  if not public.is_admin() then
    raise exception 'admins only' using errcode = '42501';
  end if;
  if p_from is null or p_to is null or p_from > p_to or p_to - p_from > 400 then
    raise exception 'bad range' using errcode = '22023';
  end if;

  -- Right now (not tied to the range).
  with u as (
    select p.*,
      (p.status = 'active' and (p.expires_at is null or p.expires_at > now())) as has_access,
      s.plan as store_plan, s.period_type, s.billing_issue_at,
      (s.user_id is not null and s.expires_at > now() and s.refunded_at is null) as store_live
    from public.profiles p
    left join public.store_subscriptions s on s.user_id = p.id
    where p.role = 'client' and not p.analytics_excluded
  )
  select jsonb_build_object(
    'paying_monthly', count(*) filter (where store_live and period_type <> 'trial' and store_plan = 'monthly'),
    'paying_yearly', count(*) filter (where store_live and period_type <> 'trial' and store_plan = 'yearly'),
    'in_trial', count(*) filter (where store_live and period_type = 'trial'),
    'admin_paid', count(*) filter (where has_access and access_via = 'grant' and plan = 'paid'),
    'admin_vip', count(*) filter (where has_access and access_via = 'grant' and plan = 'vip'),
    'admin_family', count(*) filter (where has_access and access_via = 'grant' and plan = 'family'),
    'billing_issue', count(*) filter (where store_live and billing_issue_at is not null),
    'without_access', count(*) filter (where not has_access)
  ) into v_now
  from u;

  -- Trials whose 14 days ended inside the range, and how many of them became paid.
  with counted as (
    select id from public.profiles where role = 'client' and not analytics_excluded
  ),
  trials as (
    select e.user_id, min(e.occurred_at) as started
    from public.analytics_events e join counted c on c.id = e.user_id
    where e.name = 'trial_started'
    group by e.user_id
  )
  select jsonb_build_object(
    'ended', count(*),
    'converted', count(*) filter (where exists (
      select 1 from public.analytics_events s
      where s.user_id = t.user_id and s.name = 'subscribed' and s.occurred_at >= t.started))
  ) into v_trials
  from trials t
  where t.started + interval '14 days' >= v_from and t.started + interval '14 days' < v_to;

  -- Cancellations and refunds per Israel-time month in the range.
  with counted as (
    select id from public.profiles where role = 'client' and not analytics_excluded
  )
  select coalesce(jsonb_agg(x order by x.month), '[]'::jsonb) into v_months
  from (
    select to_char((e.occurred_at at time zone 'Asia/Jerusalem'), 'YYYY-MM') as month,
      count(*) filter (where e.name = 'cancelled')::int as cancelled,
      count(*) filter (where e.name = 'refunded')::int as refunded
    from public.analytics_events e join counted c on c.id = e.user_id
    where e.name in ('cancelled', 'refunded') and e.occurred_at >= v_from and e.occurred_at < v_to
    group by 1
  ) x;

  return jsonb_build_object('now', v_now, 'trials', v_trials, 'months', v_months);
end;
$$;

revoke all on function public.admin_subscription_report(date, date) from public, anon;
grant execute on function public.admin_subscription_report(date, date) to authenticated;
