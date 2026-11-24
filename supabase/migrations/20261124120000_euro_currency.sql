-- Euro as a third currency (owner 2026-11-24, docs/spec.md "Currency"). Display only, like the
-- shekel and the dollar: only the sign changes, nothing is converted.

alter table public.user_settings drop constraint user_settings_currency_check;
alter table public.user_settings
  add constraint user_settings_currency_check check (currency in ('ILS', 'USD', 'EUR'));

-- The admin "Purchase detected" test shows the euro sign too. Same body otherwise.
create or replace function public.admin_send_purchase_test(
  p_user_id uuid,
  p_amount_minor bigint,
  p_merchant text
)
returns integer
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_merchant text := nullif(regexp_replace(trim(coalesce(p_merchant, '')), '\s+', ' ', 'g'), '');
  v_messages jsonb;
begin
  if not public.is_admin() then
    raise exception 'not allowed' using errcode = '42501';
  end if;
  if p_amount_minor is null or p_amount_minor <= 0 or p_amount_minor > 99999999999 then
    raise exception 'Amount must be more than 0';
  end if;
  if v_merchant is null or char_length(v_merchant) > 100 then
    raise exception 'Merchant is 1 to 100 characters';
  end if;
  if p_user_id is not null and not exists (
    select 1 from public.profiles where id = p_user_id and status = 'active'
  ) then
    raise exception 'User is not active';
  end if;

  with target as (
    select
      t.token,
      t.language,
      coalesce(s.currency, 'ILS') as currency,
      -- Same as the app's formatMoney: "₪ 1,850" / "$ 12.50" / "€ 9", kept left to right.
      chr(8206)
        || case coalesce(s.currency, 'ILS') when 'USD' then '$' when 'EUR' then '€' else '₪' end
        || ' ' || to_char(p_amount_minor / 100, 'FM999,999,999,990')
        || case when p_amount_minor % 100 <> 0 then '.' || lpad((p_amount_minor % 100)::text, 2, '0') else '' end
        || chr(8206) as amount
    from public.profiles p
    join public.push_tokens t on t.user_id = p.id
    left join public.user_settings s on s.user_id = p.id
    where p.status = 'active' and (p_user_id is null or p.id = p_user_id)
      and public.push_allowed('custom', t.subscription_reminders, t.inactivity_reminders)
  )
  select coalesce(jsonb_agg(jsonb_build_object(
    'to', token,
    'title', case when language = 'he' then 'קלטנו הוצאה' else 'Purchase detected' end,
    'body', case when language = 'he'
      then chr(8207) || amount || ' ב-' || v_merchant || '. להוסיף?'
      else amount || ' at ' || v_merchant || '. Add it?' end,
    'sound', 'default',
    'channelId', 'default',
    -- What the phone's own reminder carries: tapping opens the expense sheet filled in.
    'data', jsonb_build_object(
      'kind', 'purchase',
      'amountMinor', p_amount_minor::text,
      'currency', currency,
      'merchant', v_merchant
    )
  )), '[]'::jsonb)
  into v_messages
  from target;

  return public.post_push_messages(v_messages);
end;
$$;

