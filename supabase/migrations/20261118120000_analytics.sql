-- Product analytics: growth, use and engagement. Never money (docs/spec.md "Analytics").
-- Raw events from the app, daily totals kept forever, admin-only reading.

-- Accounts that never count (the owner's own test accounts). Admins never count either.
alter table public.profiles add column analytics_excluded boolean not null default false;

create table public.analytics_events (
  id bigint generated always as identity primary key,
  name text not null check (
    name in ('first_open', 'signup_started', 'signup_completed', 'first_app_entry', 'app_open')
  ),
  -- Deleting the account deletes its events. Device-only events (before sign-up) have no user.
  user_id uuid references public.profiles (id) on delete cascade,
  device_id uuid,
  platform text check (platform in ('ios', 'android', 'web')),
  app_version text check (char_length(app_version) <= 20),
  method text check (method in ('email', 'google')),
  occurred_at timestamptz not null,
  received_at timestamptz not null default now(),
  constraint analytics_events_has_subject check (user_id is not null or device_id is not null)
);

create index analytics_events_name_time_idx on public.analytics_events (name, occurred_at);
create index analytics_events_user_time_idx on public.analytics_events (user_id, occurred_at) where user_id is not null;
create index analytics_events_device_time_idx on public.analytics_events (device_id, occurred_at) where device_id is not null;
-- Once per device / per user.
create unique index analytics_events_first_open_once on public.analytics_events (device_id) where name = 'first_open';
create unique index analytics_events_first_entry_once on public.analytics_events (user_id) where name = 'first_app_entry';
create unique index analytics_events_signup_once on public.analytics_events (user_id) where name = 'signup_completed';

-- Numbers only, no user ids. Kept forever so past charts never change.
create table public.analytics_daily (
  day date primary key,
  dau integer not null,
  wau integer not null,
  mau integer not null,
  new_users integer not null,
  returning_users integer not null,
  first_opens integer not null,
  signups_started integer not null,
  signups_completed integer not null,
  approved integer not null,
  first_entries integer not null,
  computed_at timestamptz not null default now()
);

alter table public.analytics_events enable row level security;
alter table public.analytics_daily enable row level security;
-- No policies: clients never read or write these tables directly. Only the functions below.
revoke all on public.analytics_events from anon, authenticated;
revoke all on public.analytics_daily from anon, authenticated;

-- ---------------------------------------------------------------------------
-- Sending
-- ---------------------------------------------------------------------------

-- The app sends events here, signed in or not. Accepts only the known names,
-- keeps a sane time, and limits how many one device / user / the whole world can send.
create function public.track_event(
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
  if p_name not in ('first_open', 'signup_started', 'first_app_entry', 'app_open') then
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

  -- User events: signed in, with access (locked users are not active).
  if v_user is null then
    raise exception 'not signed in' using errcode = '42501';
  end if;
  if not public.has_access() then
    return;
  end if;
  if (select count(*) from public.analytics_events
      where user_id = v_user and received_at > now() - interval '1 hour') >= 20 then
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

-- Sign-up completed is recorded by the database itself when the profile is created,
-- with the method from the auth provider (email / google).
create function public.track_signup_completed()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_provider text;
begin
  select raw_app_meta_data ->> 'provider' into v_provider from auth.users where id = new.id;
  insert into public.analytics_events (name, user_id, method, occurred_at)
  values (
    'signup_completed',
    new.id,
    case when v_provider = 'google' then 'google' else 'email' end,
    new.created_at
  )
  on conflict do nothing;
  return new;
end;
$$;

create trigger profiles_track_signup
after insert on public.profiles
for each row execute function public.track_signup_completed();

-- ---------------------------------------------------------------------------
-- Daily numbers (days in Israel time)
-- ---------------------------------------------------------------------------

create function public.analytics_compute_day(p_day date)
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
    select e.name, e.user_id, e.device_id, (e.occurred_at at time zone 'Asia/Jerusalem')::date as d
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
    now();
$$;

-- Nightly: (re)compute the last 8 days (late offline events can arrive up to 7 days after),
-- and delete raw events older than 25 months.
create function public.analytics_rollup()
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
      first_entries = excluded.first_entries, computed_at = excluded.computed_at;
  end loop;
  delete from public.analytics_events where occurred_at < now() - interval '25 months';
end;
$$;

-- 23:30 UTC = 01:30 / 02:30 Israel time, after the Israel day has ended.
select cron.schedule('finny-analytics-rollup', '30 23 * * *', $$select public.analytics_rollup()$$);

-- ---------------------------------------------------------------------------
-- Admin reading
-- ---------------------------------------------------------------------------

-- Everything the Analytics page shows for a range of days (Israel time), at most 400 days.
create function public.admin_analytics(p_from date, p_to date)
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

  return jsonb_build_object(
    'today', v_today,
    'days', v_days,
    'retention', v_retention,
    'not_started', v_not_started
  );
end;
$$;

revoke execute on function public.track_event(text, uuid, text, text, timestamptz) from public;
revoke execute on function public.track_signup_completed() from public, anon, authenticated;
revoke execute on function public.analytics_compute_day(date) from public, anon, authenticated;
revoke execute on function public.analytics_rollup() from public, anon, authenticated;
revoke execute on function public.admin_analytics(date, date) from public, anon;

grant execute on function public.track_event(text, uuid, text, text, timestamptz) to anon, authenticated;
grant execute on function public.admin_analytics(date, date) to authenticated;
