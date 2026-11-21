-- Password lock and per-user request limits. Rules: docs/spec.md "Sign-in"
-- (password protection) and "Request limits" (owner 2026-11-21).

-- ---------------------------------------------------------------------------
-- Password lock: 5 wrong passwords in a row for one email -> 15 minutes locked.
-- Used only by the Edge Function `auth-password` with the secret key. No client
-- can read or call any of it.
-- ---------------------------------------------------------------------------

create table public.auth_password_attempts (
  -- sha-256 of the lower-cased email, so the table holds no email addresses
  email_hash text primary key check (email_hash ~ '^[0-9a-f]{64}$'),
  -- tries since the last success, counted when a try starts (so tries sent at the
  -- same moment cannot slip past the limit)
  failed_count integer not null default 0 check (failed_count >= 0),
  last_failed_at timestamptz,
  locked_until timestamptz
);

alter table public.auth_password_attempts enable row level security;
revoke all on public.auth_password_attempts from anon, authenticated;

-- Before checking a password. Returns 0 to go ahead, or the seconds the email is
-- still locked. A try that goes ahead is counted as wrong until finished.
create function public.auth_attempt_begin(p_email_hash text)
returns integer
language plpgsql
set search_path = ''
as $$
declare
  r public.auth_password_attempts;
  v_count integer;
begin
  insert into public.auth_password_attempts (email_hash) values (p_email_hash)
  on conflict (email_hash) do nothing;
  select * into r from public.auth_password_attempts where email_hash = p_email_hash for update;

  if r.locked_until is not null and r.locked_until > now() then
    return greatest(1, ceil(extract(epoch from r.locked_until - now()))::integer);
  end if;

  -- Tries older than 24 hours, or a lock that has ended: start over.
  v_count := case
    when r.locked_until is not null or r.last_failed_at is null or r.last_failed_at < now() - interval '24 hours' then 0
    else r.failed_count
  end;
  -- Five tries already under way or wrong: same answer as a lock.
  if v_count >= 5 then
    return 900;
  end if;

  update public.auth_password_attempts
  set failed_count = v_count + 1, last_failed_at = now(), locked_until = null
  where email_hash = p_email_hash;
  return 0;
end;
$$;

-- After checking. p_outcome: 'ok' (right password, or a password reset: clears the
-- count and any lock), 'wrong', or 'error' (Supabase did not answer: the try does
-- not count). Returns the seconds locked from now (900 after the 5th wrong try), else 0.
create function public.auth_attempt_finish(p_email_hash text, p_outcome text)
returns integer
language plpgsql
set search_path = ''
as $$
declare
  v_count integer;
begin
  if p_outcome = 'ok' then
    delete from public.auth_password_attempts where email_hash = p_email_hash;
    return 0;
  elsif p_outcome = 'error' then
    update public.auth_password_attempts
    set failed_count = greatest(failed_count - 1, 0)
    where email_hash = p_email_hash;
    return 0;
  elsif p_outcome = 'wrong' then
    select failed_count into v_count
    from public.auth_password_attempts where email_hash = p_email_hash for update;
    if coalesce(v_count, 0) >= 5 then
      update public.auth_password_attempts
      set locked_until = now() + interval '15 minutes', failed_count = 0
      where email_hash = p_email_hash;
      return 900;
    end if;
    return 0;
  end if;
  raise exception 'unknown outcome %', p_outcome using errcode = '22023';
end;
$$;

revoke execute on function public.auth_attempt_begin(text) from public, anon, authenticated;
revoke execute on function public.auth_attempt_finish(text, text) from public, anon, authenticated;
grant execute on function public.auth_attempt_begin(text) to service_role;
grant execute on function public.auth_attempt_finish(text, text) to service_role;

-- ---------------------------------------------------------------------------
-- Request limits per signed-in user, in fixed windows (a clock minute, a UTC day).
-- Over the limit: SQLSTATE PT429, which the API returns as HTTP 429.
-- Server jobs (no signed-in user) are never counted.
-- ---------------------------------------------------------------------------

create table public.rate_counters (
  user_id uuid not null references public.profiles (id) on delete cascade,
  action text not null,
  window_seconds integer not null check (window_seconds > 0),
  window_start timestamptz not null,
  hits integer not null,
  primary key (user_id, action, window_seconds)
);

alter table public.rate_counters enable row level security;
revoke all on public.rate_counters from anon, authenticated;

create function public.rate_hit(p_action text, p_window_seconds integer, p_limit integer)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_user uuid := (select auth.uid());
  v_start timestamptz;
  v_hits integer;
begin
  if v_user is null then
    return;
  end if;
  v_start := to_timestamp(floor(extract(epoch from now()) / p_window_seconds) * p_window_seconds);
  insert into public.rate_counters as c (user_id, action, window_seconds, window_start, hits)
  values (v_user, p_action, p_window_seconds, v_start, 1)
  on conflict (user_id, action, window_seconds) do update
  set hits = case when c.window_start = excluded.window_start then c.hits + 1 else 1 end,
      window_start = excluded.window_start
  returning hits into v_hits;
  if v_hits > p_limit then
    -- The whole request rolls back, this count included: nothing is saved.
    raise exception 'rate_limited'
      using errcode = 'PT429', detail = p_action, hint = 'Too many requests. Wait and try again.';
  end if;
end;
$$;

-- Insert trigger. Args: action, per-minute limit, per-day limit. One request (one
-- database transaction) counts once, however many rows it adds: an installments
-- plan or the recurring catch-up is one save. Transactions also count rows per day.
create function public.rate_limit_insert()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_action text := tg_argv[0];
  v_flag text := 'kaspilo.rate_' || tg_argv[0];
begin
  if (select auth.uid()) is null then
    return new;
  end if;
  if coalesce(current_setting(v_flag, true), '') = '' then
    perform set_config(v_flag, 'counted', true);
    perform public.rate_hit(v_action, 60, tg_argv[1]::integer);
    perform public.rate_hit(v_action, 86400, tg_argv[2]::integer);
  end if;
  if v_action = 'transactions' then
    perform public.rate_hit('transaction_rows', 86400, 5000);
  end if;
  return new;
end;
$$;

revoke execute on function public.rate_hit(text, integer, integer) from public, anon, authenticated;
revoke execute on function public.rate_limit_insert() from public, anon, authenticated;

create trigger rate_limit before insert on public.transactions
  for each row execute function public.rate_limit_insert('transactions', '60', '2000');
create trigger rate_limit before insert on public.wallets
  for each row execute function public.rate_limit_insert('wallets', '30', '500');
create trigger rate_limit before insert on public.categories
  for each row execute function public.rate_limit_insert('categories', '30', '500');
create trigger rate_limit before insert on public.goals
  for each row execute function public.rate_limit_insert('goals', '30', '500');
create trigger rate_limit before insert on public.goal_deposits
  for each row execute function public.rate_limit_insert('goal_deposits', '30', '500');
create trigger rate_limit before insert on public.recurring_rules
  for each row execute function public.rate_limit_insert('recurring_rules', '30', '500');

-- ---------------------------------------------------------------------------
-- Push tokens: a new device token at most 10 an hour. Updating the token this
-- user already has (every app open) is not counted.
-- ---------------------------------------------------------------------------

create or replace function public.register_push_token(
  p_token text,
  p_platform text,
  p_language text,
  p_subscription_reminders boolean
)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_user uuid := (select auth.uid());
begin
  if v_user is null then
    raise exception 'not signed in';
  end if;
  if p_token !~ '^Expo(nent)?PushToken\[[A-Za-z0-9_-]+\]$' then
    raise exception 'invalid push token';
  end if;
  if not exists (select 1 from public.push_tokens where token = p_token and user_id = v_user) then
    perform public.rate_hit('push_token', 3600, 10);
  end if;

  insert into public.push_tokens (token, user_id, platform, language, subscription_reminders)
  values (p_token, v_user, p_platform, p_language, p_subscription_reminders)
  on conflict (token) do update
  set user_id = excluded.user_id,
      platform = excluded.platform,
      language = excluded.language,
      subscription_reminders = excluded.subscription_reminders,
      updated_at = now();
end;
$$;
