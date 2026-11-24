-- Store pushes (docs/spec.md "Billing problems", "Notifications"), phase D.
--  * Trial reminder 2 days before a renewing trial ends.
--  * Billing problem: first day, after 7 days, and the day before the grace period ends.
--  * Renewal reminders only to users whose access really ends: a store subscription that
--    renews by itself gets none.
--  * Spanish texts (were missing: Spanish phones got nothing), and English for any other language.
-- All sent by the existing daily job (send_subscription_reminders, 08:00 UTC), once per kind
-- per end date (notification_log), only to devices with the renewal switch on.

alter table public.notification_log drop constraint notification_log_kind_check;
alter table public.notification_log add constraint notification_log_kind_check check (
  kind in ('expiry_30', 'expiry_7', 'expiry_1', 'expiry_0', 'trial_end_2', 'billing_1', 'billing_7', 'billing_last')
);

create or replace function public.notification_text(p_kind text, p_language text)
returns table (title text, body text)
language sql
immutable
set search_path = ''
as $$
  select t.title, t.body
  from (values
    ('expiry_30', 'he', 'המנוי ב-Kaspilo מסתיים בעוד חודש', 'כדאי לחדש בזמן ולהמשיך לעקוב בלי הפסקה.'),
    ('expiry_7',  'he', 'המנוי ב-Kaspilo מסתיים בעוד שבוע', 'כדאי לחדש בזמן ולהמשיך לעקוב בלי הפסקה.'),
    ('expiry_1',  'he', 'המנוי ב-Kaspilo מסתיים מחר', 'כדאי לחדש בזמן ולהמשיך לעקוב בלי הפסקה.'),
    ('expiry_0',  'he', 'המנוי ב-Kaspilo מסתיים היום', 'הנתונים שלך נשמרים. חדש את המנוי כדי להמשיך להשתמש.'),
    ('trial_end_2', 'he', 'תקופת הניסיון מסתיימת בעוד יומיים', 'אחרי זה המנוי שבחרת מתחיל ומתחדש לבד. אפשר לבטל בהגדרות המנויים בחנות.'),
    ('billing_1', 'he', 'התשלום על המנוי לא עבר', 'עדכן את אמצעי התשלום בחנות כדי להמשיך בלי הפסקה.'),
    ('billing_7', 'he', 'התשלום על המנוי עדיין לא עבר', 'עדכן את אמצעי התשלום בחנות כדי לשמור על הגישה.'),
    ('billing_last', 'he', 'הגישה ל-Kaspilo נעצרת מחר', 'התשלום לא עבר. עדכן את אמצעי התשלום בחנות. הנתונים שלך נשמרים.'),
    ('inactive_1', 'he', 'איפה נעלמת? 🌱', 'כמה ימים בלי מעקב. דקה אחת עכשיו, ועתיד כלכלי טוב יותר אחר כך.'),
    ('inactive_2', 'he', 'הארנק מתגעגע', 'רישום קצר של ההוצאות וההכנסות מחזיר אותך לשליטה.'),
    ('inactive_3', 'he', 'צעד קטן, הרגל גדול', 'מעקב קבוע הוא הדרך לעתיד כלכלי טוב יותר. נמשיך?'),
    ('expiry_30', 'en', 'Your Kaspilo subscription ends in a month', 'Renew in time and keep tracking without a break.'),
    ('expiry_7',  'en', 'Your Kaspilo subscription ends in a week', 'Renew in time and keep tracking without a break.'),
    ('expiry_1',  'en', 'Your Kaspilo subscription ends tomorrow', 'Renew in time and keep tracking without a break.'),
    ('expiry_0',  'en', 'Your Kaspilo subscription ends today', 'Your data is kept. Renew to keep using the app.'),
    ('trial_end_2', 'en', 'Your free trial ends in 2 days', 'Then the plan you chose starts and renews by itself. Cancel any time in the store''s subscription settings.'),
    ('billing_1', 'en', 'Your subscription payment didn''t go through', 'Update your payment method in the store to keep going without a break.'),
    ('billing_7', 'en', 'Your subscription payment still didn''t go through', 'Update your payment method in the store to keep your access.'),
    ('billing_last', 'en', 'Kaspilo access stops tomorrow', 'The payment didn''t go through. Update your payment method in the store. Your data is kept.'),
    ('inactive_1', 'en', 'Where did you go? 🌱', 'A few days without tracking. One minute now, a better financial future later.'),
    ('inactive_2', 'en', 'Your wallet misses you', 'A quick log of spending and income puts you back in control.'),
    ('inactive_3', 'en', 'Small step, big habit', 'Steady tracking is the way to a better financial future. Shall we?'),
    ('expiry_30', 'es', 'Tu suscripción a Kaspilo termina en un mes', 'Renueva a tiempo y sigue registrando sin pausas.'),
    ('expiry_7',  'es', 'Tu suscripción a Kaspilo termina en una semana', 'Renueva a tiempo y sigue registrando sin pausas.'),
    ('expiry_1',  'es', 'Tu suscripción a Kaspilo termina mañana', 'Renueva a tiempo y sigue registrando sin pausas.'),
    ('expiry_0',  'es', 'Tu suscripción a Kaspilo termina hoy', 'Tus datos se conservan. Renueva para seguir usando la app.'),
    ('trial_end_2', 'es', 'Tu prueba gratis termina en 2 días', 'Después empieza el plan que elegiste y se renueva solo. Cancela cuando quieras en los ajustes de suscripciones de la tienda.'),
    ('billing_1', 'es', 'El pago de tu suscripción no se completó', 'Actualiza tu método de pago en la tienda para seguir sin pausas.'),
    ('billing_7', 'es', 'El pago de tu suscripción sigue sin completarse', 'Actualiza tu método de pago en la tienda para mantener el acceso.'),
    ('billing_last', 'es', 'El acceso a Kaspilo se detiene mañana', 'El pago no se completó. Actualiza tu método de pago en la tienda. Tus datos se conservan.'),
    ('inactive_1', 'es', '¿Dónde te metiste? 🌱', 'Unos días sin registrar. Un minuto ahora, un mejor futuro financiero después.'),
    ('inactive_2', 'es', 'Tu cartera te extraña', 'Un registro rápido de gastos e ingresos te devuelve el control.'),
    ('inactive_3', 'es', 'Paso pequeño, gran hábito', 'Registrar con constancia es el camino a un mejor futuro financiero. ¿Seguimos?')
  ) as t (kind, language, title, body)
  where t.kind = p_kind
    and t.language = case when p_language in ('he', 'en', 'es') then p_language else 'en' end;
$$;

create or replace function public.send_subscription_reminders()
returns integer
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_today date := (now() at time zone 'Asia/Jerusalem')::date;
  v_messages jsonb;
begin
  with due as (
    -- Renewal: access that really ends. None while a live store subscription renews by itself.
    select p.id as user_id, p.expires_at as ends_at,
      'expiry_' || ((p.expires_at at time zone 'Asia/Jerusalem')::date - v_today) as kind,
      p.status, (p.expires_at at time zone 'Asia/Jerusalem')::date - v_today as days_left
    from public.profiles p
    left join public.store_subscriptions s on s.user_id = p.id
    where p.expires_at is not null and p.status in ('active', 'expired')
      and not (s.user_id is not null and s.will_renew and s.refunded_at is null
               and s.expires_at > now())
  ), renewal as (
    select user_id, ends_at, kind from due
    where (status = 'active' and days_left in (30, 7, 1, 0)) or (status = 'expired' and days_left = 0)
  ), store as (
    select s.user_id, s.expires_at as ends_at,
      case
        when s.period_type = 'trial' and s.will_renew and s.billing_issue_at is null
          and (s.expires_at at time zone 'Asia/Jerusalem')::date - v_today = 2 then 'trial_end_2'
        when s.billing_issue_at is not null
          and (s.expires_at at time zone 'Asia/Jerusalem')::date - v_today = 1 then 'billing_last'
        when s.billing_issue_at is not null
          and v_today - (s.billing_issue_at at time zone 'Asia/Jerusalem')::date = 0 then 'billing_1'
        when s.billing_issue_at is not null
          and v_today - (s.billing_issue_at at time zone 'Asia/Jerusalem')::date = 7 then 'billing_7'
      end as kind
    from public.store_subscriptions s
    where s.refunded_at is null and s.expires_at > now()
  ), fresh as (
    insert into public.notification_log (user_id, kind, expires_at)
    select user_id, kind, ends_at from renewal
    union all
    select user_id, kind, ends_at from store where kind is not null
    on conflict do nothing
    returning user_id, kind
  )
  select coalesce(jsonb_agg(jsonb_build_object(
    'to', t.token,
    'title', x.title,
    'body', x.body,
    'sound', 'default',
    'channelId', 'default',
    'data', jsonb_build_object('url', '/renew')
  )), '[]'::jsonb)
  into v_messages
  from fresh f
  join public.push_tokens t on t.user_id = f.user_id
  cross join lateral public.notification_text(f.kind, t.language) x
  where t.subscription_reminders;

  return public.post_push_messages(v_messages);
end;
$$;
