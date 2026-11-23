-- Money saved before (docs/spec.md "Goals", owner 2026-11-23).
-- A deposit is either 'new' (money set aside now: comes off the balance, as before)
-- or 'existing' (money the user already had saved: counts toward the goal only).
-- Every deposit made before this change is 'new'.

alter table public.goal_deposits
  add column source text not null default 'new'
  constraint goal_deposits_source_check check (source in ('new', 'existing'));

-- History rows now carry the deposit's source ('new' for transactions).
-- The return type changes, so the function is dropped and made again (no data involved).
drop function public.wallet_history(uuid, date, boolean, date, date, timestamptz, uuid, integer);

create function public.wallet_history(
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
  user_id uuid,
  source text
)
language sql
stable
security invoker
set search_path = ''
as $$
  with rows as (
    select 'tx'::text as kind, t.id, t.date, t.created_at, t.type, t.amount, t.description,
           t.category_id, t.recurring_rule_id, null::uuid as goal_id, t.wallet_id, t.user_id,
           'new'::text as source
    from public.transactions t
    where t.wallet_id = p_wallet_id
    union all
    select 'deposit'::text, d.id, d.date, d.created_at, null::public.transaction_type, d.amount, ''::text,
           null::uuid, null::uuid, d.goal_id, d.wallet_id, d.user_id, d.source
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
