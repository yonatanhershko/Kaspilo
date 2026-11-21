-- App renamed Finny -> Kaspilo (owner 2026-11-20, docs/spec.md). Only the push texts users see
-- change here. Cron job names (finny-*) stay: nobody sees them, and renaming means unschedule + schedule.
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
    ('inactive_1', 'he', 'איפה נעלמת? 🌱', 'כמה ימים בלי מעקב. דקה אחת עכשיו, ועתיד כלכלי טוב יותר אחר כך.'),
    ('inactive_2', 'he', 'הארנק מתגעגע', 'רישום קצר של ההוצאות וההכנסות מחזיר אותך לשליטה.'),
    ('inactive_3', 'he', 'צעד קטן, הרגל גדול', 'מעקב קבוע הוא הדרך לעתיד כלכלי טוב יותר. נמשיך?'),
    ('expiry_30', 'en', 'Your Kaspilo subscription ends in a month', 'Renew in time and keep tracking without a break.'),
    ('expiry_7',  'en', 'Your Kaspilo subscription ends in a week', 'Renew in time and keep tracking without a break.'),
    ('expiry_1',  'en', 'Your Kaspilo subscription ends tomorrow', 'Renew in time and keep tracking without a break.'),
    ('expiry_0',  'en', 'Your Kaspilo subscription ends today', 'Your data is kept. Renew to keep using the app.'),
    ('inactive_1', 'en', 'Where did you go? 🌱', 'A few days without tracking. One minute now, a better financial future later.'),
    ('inactive_2', 'en', 'Your wallet misses you', 'A quick log of spending and income puts you back in control.'),
    ('inactive_3', 'en', 'Small step, big habit', 'Steady tracking is the way to a better financial future. Shall we?')
  ) as t (kind, language, title, body)
  where t.kind = p_kind and t.language = p_language;
$$;
