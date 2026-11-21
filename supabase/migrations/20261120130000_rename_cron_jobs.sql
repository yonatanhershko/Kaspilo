-- App renamed Finny -> Kaspilo (owner 2026-11-20): the daily jobs get the new name too.
-- Same schedules and commands as before; only the job names change. Safe to run again.
do $$
begin
  if exists (select 1 from cron.job where jobname = 'finny-expire-subscriptions') then
    perform cron.unschedule('finny-expire-subscriptions');
  end if;
  if exists (select 1 from cron.job where jobname = 'finny-subscription-reminders') then
    perform cron.unschedule('finny-subscription-reminders');
  end if;
  if exists (select 1 from cron.job where jobname = 'finny-analytics-rollup') then
    perform cron.unschedule('finny-analytics-rollup');
  end if;
end;
$$;

-- 00:05 UTC: mark ended subscriptions as expired.
select cron.schedule('kaspilo-expire-subscriptions', '5 0 * * *', $$select public.expire_subscriptions()$$);
-- 08:00 UTC: subscription reminder pushes.
select cron.schedule('kaspilo-subscription-reminders', '0 8 * * *', $$select public.send_subscription_reminders()$$);
-- 23:30 UTC: store the daily analytics numbers.
select cron.schedule('kaspilo-analytics-rollup', '30 23 * * *', $$select public.analytics_rollup()$$);
