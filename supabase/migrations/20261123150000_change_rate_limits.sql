-- Request limits on changes and deletions (docs/spec.md "Request limits", owner 2026-11-23).
-- Changing or deleting money data: 120 requests a minute and 5,000 a day per user, all
-- tables together. One request (one database transaction) counts once, however many rows
-- it touches, so deleting a wallet with all its rows is one. Server jobs (no auth.uid())
-- are not counted, and neither is deleting the account.

create function public.rate_limit_change()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if (select auth.uid()) is not null
     and coalesce(current_setting('kaspilo.deleting_account', true), '') = ''
     and coalesce(current_setting('kaspilo.rate_changes', true), '') = '' then
    perform set_config('kaspilo.rate_changes', 'counted', true);
    perform public.rate_hit('changes', 60, 120);
    perform public.rate_hit('changes', 86400, 5000);
  end if;
  return case when tg_op = 'DELETE' then old else new end;
end;
$$;

revoke execute on function public.rate_limit_change() from public, anon, authenticated;

create trigger rate_limit_change before update or delete on public.transactions
  for each row execute function public.rate_limit_change();
create trigger rate_limit_change before update or delete on public.wallets
  for each row execute function public.rate_limit_change();
create trigger rate_limit_change before update or delete on public.categories
  for each row execute function public.rate_limit_change();
create trigger rate_limit_change before update or delete on public.goals
  for each row execute function public.rate_limit_change();
create trigger rate_limit_change before update or delete on public.goal_deposits
  for each row execute function public.rate_limit_change();
create trigger rate_limit_change before update or delete on public.recurring_rules
  for each row execute function public.rate_limit_change();

-- Deleting the account is never limited: mark the request so the triggers above skip it.
create or replace function public.delete_account()
returns void
language plpgsql
security definer
set search_path = ''
as $$
begin
  if (select auth.uid()) is null then
    raise exception 'not signed in' using errcode = '42501';
  end if;
  perform set_config('kaspilo.deleting_account', 'on', true);
  delete from auth.users where id = (select auth.uid());
end;
$$;
