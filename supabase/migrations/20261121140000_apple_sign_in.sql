-- Sign in with Apple (docs/spec.md "Auth", owner 2026-11-21): sign-up method `apple`
-- in analytics, next to `email` and `google`. Nothing else changes; the profile trigger
-- already handles any provider (Apple sends no name in the token: the app fills it).

alter table public.analytics_events drop constraint analytics_events_method_check;
alter table public.analytics_events
  add constraint analytics_events_method_check check (method in ('email', 'google', 'apple'));

create or replace function public.track_signup_completed()
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
    case when v_provider in ('google', 'apple') then v_provider else 'email' end,
    new.created_at
  )
  on conflict do nothing;
  return new;
end;
$$;

revoke execute on function public.track_signup_completed() from public, anon, authenticated;
