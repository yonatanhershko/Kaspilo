-- A manual send from the admin now respects the user's switches (owner 2026-11-22,
-- was "sent even when switched off"). Rules: docs/spec.md "Notifications" -> "Manual send".
--   renewal kinds    -> devices with the renewal switch on
--   inactivity kinds -> devices with the inactivity switch on
--   custom message   -> devices with at least one switch on
-- The server only knew the renewal switch, so the device now saves both.

alter table public.push_tokens
  add column inactivity_reminders boolean not null default true;

-- Which devices may get a manual send of this kind.
create function public.push_allowed(p_kind text, p_subscription boolean, p_inactivity boolean)
returns boolean
language sql
immutable
set search_path = ''
as $$
  select case
    when p_kind like 'expiry_%' then p_subscription
    when p_kind like 'inactive_%' then p_inactivity
    else p_subscription or p_inactivity
  end;
$$;

-- New form with both switches. The 4-argument form stays for app builds from before
-- this change (it leaves the inactivity switch as it was).
create function public.register_push_token(
  p_token text,
  p_platform text,
  p_language text,
  p_subscription_reminders boolean,
  p_inactivity_reminders boolean
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
  if p_platform not in ('ios', 'android') or p_language not in ('he', 'en') then
    raise exception 'invalid device';
  end if;

  insert into public.push_tokens (token, user_id, platform, language, subscription_reminders, inactivity_reminders)
  values (p_token, v_user, p_platform, p_language, p_subscription_reminders, p_inactivity_reminders)
  on conflict (token) do update
  set user_id = excluded.user_id,
      platform = excluded.platform,
      language = excluded.language,
      subscription_reminders = excluded.subscription_reminders,
      inactivity_reminders = excluded.inactivity_reminders,
      updated_at = now();
end;
$$;

-- Who a manual send of p_kind would reach. p_kind null = renewal (the dialog's default).
drop function public.admin_push_audience(uuid);
create function public.admin_push_audience(p_user_id uuid default null, p_kind text default null)
returns json
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  v_kind text := coalesce(p_kind, 'expiry_30');
begin
  if not public.is_admin() then
    raise exception 'not allowed' using errcode = '42501';
  end if;

  return (
    select json_build_object(
      'users', count(distinct p.id),
      'users_with_device', count(distinct t.user_id)
        filter (where public.push_allowed(v_kind, t.subscription_reminders, t.inactivity_reminders)),
      'devices', count(t.token)
        filter (where public.push_allowed(v_kind, t.subscription_reminders, t.inactivity_reminders)),
      'off_devices', count(t.token)
        filter (where not public.push_allowed(v_kind, t.subscription_reminders, t.inactivity_reminders))
    )
    from public.profiles p
    left join public.push_tokens t on t.user_id = p.id
    where p.status = 'active' and (p_user_id is null or p.id = p_user_id)
  );
end;
$$;

create or replace function public.admin_send_notification(
  p_user_id uuid,
  p_kind text,
  p_title text default null,
  p_body text default null
)
returns integer
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_title text := nullif(trim(coalesce(p_title, '')), '');
  v_body text := nullif(trim(coalesce(p_body, '')), '');
  v_messages jsonb;
begin
  if not public.is_admin() then
    raise exception 'not allowed' using errcode = '42501';
  end if;

  if p_kind = 'custom' then
    if v_title is null or v_body is null then
      raise exception 'A custom notification needs a title and a message';
    end if;
    if char_length(v_title) > 60 or char_length(v_body) > 200 then
      raise exception 'Title is at most 60 characters, message at most 200';
    end if;
  elsif not exists (select 1 from public.notification_text(p_kind, 'en')) then
    raise exception 'Unknown notification kind';
  end if;

  if p_user_id is not null and not exists (
    select 1 from public.profiles where id = p_user_id and status = 'active'
  ) then
    raise exception 'User is not active';
  end if;

  select coalesce(jsonb_agg(jsonb_build_object(
    'to', t.token,
    'title', coalesce(x.title, v_title),
    'body', coalesce(x.body, v_body),
    'sound', 'default',
    'channelId', 'default',
    'data', jsonb_build_object('url', case when p_kind like 'expiry_%' then '/renew' else '/today' end)
  )), '[]'::jsonb)
  into v_messages
  from public.profiles p
  join public.push_tokens t on t.user_id = p.id
  left join lateral public.notification_text(p_kind, t.language) x on true
  where p.status = 'active' and (p_user_id is null or p.id = p_user_id)
    and public.push_allowed(p_kind, t.subscription_reminders, t.inactivity_reminders);

  return public.post_push_messages(v_messages);
end;
$$;

revoke execute on function public.push_allowed(text, boolean, boolean) from public, anon, authenticated;
revoke execute on function public.register_push_token(text, text, text, boolean, boolean) from public, anon;
revoke execute on function public.admin_push_audience(uuid, text) from public, anon;
grant execute on function public.register_push_token(text, text, text, boolean, boolean) to authenticated;
grant execute on function public.admin_push_audience(uuid, text) to authenticated;
