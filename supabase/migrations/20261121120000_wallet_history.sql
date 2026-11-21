-- History in pages (docs/spec.md "Wallets": history list, upcoming, complete export).
-- One wallet's transactions and goal deposits as one list, so the app can load
-- 50 at a time and export everything in batches instead of one capped read.
--
-- Security invoker: Row Level Security on transactions and goal_deposits decides
-- what the caller sees, exactly as with a plain select.
--
-- p_today     the caller's today (the phone's calendar date, not the server's UTC date).
-- p_upcoming  false: rows up to today, newest first. true: rows after today, soonest first.
-- p_since     optional: only rows on or after this date (offline cache of the last 3 months).
-- p_cursor_*  keyset cursor = (date, created_at, id) of the last row already shown.
-- p_limit     rows per page, 1-1000.

create or replace function public.wallet_history(
  p_wallet_id uuid,
  p_today date,
  p_upcoming boolean default false,
  p_since date default null,
  p_cursor_date date default null,
  p_cursor_at timestamptz default null,
  p_cursor_id uuid default null,
  p_limit integer default 50
)
returns table (
  kind text,
  id uuid,
  date date,
  created_at timestamptz,
  type public.transaction_type,
  amount bigint,
  description text,
  category_id uuid,
  recurring_rule_id uuid,
  goal_id uuid,
  wallet_id uuid,
  user_id uuid
)
language sql
stable
security invoker
set search_path = ''
as $$
  with rows as (
    select 'tx'::text as kind, t.id, t.date, t.created_at, t.type, t.amount, t.description,
           t.category_id, t.recurring_rule_id, null::uuid as goal_id, t.wallet_id, t.user_id
    from public.transactions t
    where t.wallet_id = p_wallet_id
    union all
    select 'deposit'::text, d.id, d.date, d.created_at, null::public.transaction_type, d.amount, ''::text,
           null::uuid, null::uuid, d.goal_id, d.wallet_id, d.user_id
    from public.goal_deposits d
    where d.wallet_id = p_wallet_id
  )
  select r.*
  from rows r
  where case when p_upcoming then r.date > p_today else r.date <= p_today end
    and (p_since is null or r.date >= p_since)
    and (
      p_cursor_date is null
      or case
           when p_upcoming then (r.date, r.created_at, r.id) > (p_cursor_date, p_cursor_at, p_cursor_id)
           else (r.date, r.created_at, r.id) < (p_cursor_date, p_cursor_at, p_cursor_id)
         end
    )
  order by
    case when p_upcoming then r.date end asc,
    case when p_upcoming then r.created_at end asc,
    case when p_upcoming then r.id end asc,
    r.date desc,
    r.created_at desc,
    r.id desc
  limit least(greatest(coalesce(p_limit, 50), 1), 1000);
$$;

revoke execute on function public.wallet_history(uuid, date, boolean, date, date, timestamptz, uuid, integer) from public, anon;
grant execute on function public.wallet_history(uuid, date, boolean, date, date, timestamptz, uuid, integer) to authenticated;
