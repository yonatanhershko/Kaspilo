-- Analytics: iPhone / Android split (docs/spec.md "Analytics", owner 2026-11-18).
-- A user seen on both counts once, by the device of their last app open.

alter table public.analytics_daily
  add column dau_ios integer not null default 0,
  add column dau_android integer not null default 0;

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
  -- Device of each active user's last app open that day (a user on both counts once).
  day_platform as (
    select distinct on (ev.user_id) ev.user_id, ev.platform from ev
    join counted c on c.id = ev.user_id
    where ev.name in ('app_open', 'first_app_entry') and ev.d = p_day
    order by ev.user_id, ev.occurred_at desc
  ),
  approvals as (
    select s.user_id, (min(s.created_at) at time zone 'Asia/Jerusalem')::date as d
    from public.subscription_events s
    join counted c on c.id = s.user_id
    where s.action = 'approve'
    group by s.user_id
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
    (select count(*) from approvals where d = p_day)::int,
    (select count(*) from entries where d = p_day)::int,
    now(),
    (select count(*) from day_platform where platform = 'ios')::int,
    (select count(*) from day_platform where platform = 'android')::int;
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
      dau_ios = excluded.dau_ios, dau_android = excluded.dau_android;
  end loop;
  delete from public.analytics_events where occurred_at < now() - interval '25 months';
end;
$$;


create or replace function public.admin_analytics(p_from date, p_to date)
returns jsonb
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  v_today date := (now() at time zone 'Asia/Jerusalem')::date;
  v_to date := least(p_to, v_today);
  v_days jsonb;
  v_retention jsonb;
  v_not_started integer;
  v_platforms jsonb;
begin
  if not public.is_admin() then
    raise exception 'admins only' using errcode = '42501';
  end if;
  if p_from is null or p_to is null or p_from > p_to or p_to - p_from > 400 then
    raise exception 'bad range' using errcode = '22023';
  end if;

  -- Stored days, except the last 8 and any missing day, which are computed now.
  select coalesce(jsonb_agg(to_jsonb(r) - 'computed_at' order by r.day), '[]'::jsonb) into v_days
  from (
    select (case
      when s.day is not null and g.day < v_today - 8 then s
      else public.analytics_compute_day(g.day)
    end).*
    from generate_series(p_from, v_to, interval '1 day') as g_raw(day)
    cross join lateral (select g_raw.day::date as day) g
    left join public.analytics_daily s on s.day = g.day
  ) r;

  -- Weekly cohorts by the day of first app entry (weeks start Sunday).
  with counted as (
    select id from public.profiles where role = 'client' and not analytics_excluded
  ),
  entries as (
    select e.user_id, (min(e.occurred_at) at time zone 'Asia/Jerusalem')::date as d
    from public.analytics_events e join counted c on c.id = e.user_id
    where e.name = 'first_app_entry'
    group by e.user_id
  ),
  active as (
    select distinct e.user_id, (e.occurred_at at time zone 'Asia/Jerusalem')::date as d
    from public.analytics_events e join counted c on c.id = e.user_id
    where e.name in ('app_open', 'first_app_entry')
  ),
  cohorts as (
    select (n.d - extract(dow from n.d)::int) as week, n.user_id, n.d from entries n
    where n.d between p_from - extract(dow from p_from)::int and v_to
  )
  select coalesce(jsonb_agg(row_to_json(x) order by x.week desc), '[]'::jsonb) into v_retention
  from (
    select c.week,
      count(*)::int as users,
      count(*) filter (where c.d + 1 < v_today)::int as d1_eligible,
      count(*) filter (where c.d + 1 < v_today and exists (
        select 1 from active a where a.user_id = c.user_id and a.d = c.d + 1))::int as d1,
      count(*) filter (where c.d + 7 < v_today)::int as d7_eligible,
      count(*) filter (where c.d + 7 < v_today and exists (
        select 1 from active a where a.user_id = c.user_id and a.d = c.d + 7))::int as d7,
      count(*) filter (where c.d + 30 < v_today)::int as d30_eligible,
      count(*) filter (where c.d + 30 < v_today and exists (
        select 1 from active a where a.user_id = c.user_id and a.d = c.d + 30))::int as d30
    from cohorts c
    group by c.week
  ) x;

  -- Approved, the 7 days after first entry (or approval, if never entered) are over,
  -- and no transaction was added in them. Only "any transaction exists", never amounts.
  select count(*)::int into v_not_started
  from public.profiles p
  left join lateral (
    select min(e.occurred_at) as at from public.analytics_events e
    where e.user_id = p.id and e.name = 'first_app_entry'
  ) fe on true
  where p.role = 'client' and not p.analytics_excluded and p.approved_at is not null
    and coalesce(fe.at, p.approved_at) + interval '7 days' < now()
    and not exists (
      select 1 from public.transactions t
      where t.user_id = p.id
        and t.created_at >= coalesce(fe.at, p.approved_at)
        and t.created_at < coalesce(fe.at, p.approved_at) + interval '7 days'
    );

  -- Active users in the range by the device of their last app open, and first opens by device.
  with counted as (
    select id from public.profiles where role = 'client' and not analytics_excluded
  ),
  last_seen as (
    select distinct on (e.user_id) e.platform
    from public.analytics_events e join counted c on c.id = e.user_id
    where e.name in ('app_open', 'first_app_entry')
      and e.occurred_at >= (p_from::timestamp at time zone 'Asia/Jerusalem')
      and e.occurred_at < ((v_to + 1)::timestamp at time zone 'Asia/Jerusalem')
    order by e.user_id, e.occurred_at desc
  ),
  opens as (
    select e.platform from public.analytics_events e
    where e.name = 'first_open'
      and e.occurred_at >= (p_from::timestamp at time zone 'Asia/Jerusalem')
      and e.occurred_at < ((v_to + 1)::timestamp at time zone 'Asia/Jerusalem')
  )
  select jsonb_build_object(
    'active_ios', (select count(*) from last_seen where platform = 'ios'),
    'active_android', (select count(*) from last_seen where platform = 'android'),
    'first_open_ios', (select count(*) from opens where platform = 'ios'),
    'first_open_android', (select count(*) from opens where platform = 'android')
  ) into v_platforms;

  return jsonb_build_object(
    'platforms', v_platforms,
    'today', v_today,
    'days', v_days,
    'retention', v_retention,
    'not_started', v_not_started
  );
end;
$$;

