-- =====================================================================
--  OPTIONAL: schedule the "due tomorrow" email to send itself every
--  morning, instead of the Master Admin tapping the button by hand.
--  Skip this file entirely if the button is enough for you.
--
--  1. Dashboard, Database, Extensions: enable  pg_cron  and  pg_net
--  2. Replace YOUR-PROJECT-REF and YOUR_CRON_SECRET below
--     (YOUR_CRON_SECRET must be the exact same value as CRON_SECRET
--     in your Edge Function secrets)
--  3. Run this in the SQL Editor
--
--  06:00 UTC = 08:00 in Zambia (CAT).
-- =====================================================================
select cron.schedule(
  'daily-loan-reminders',
  '0 6 * * *',
  $$
  select net.http_post(
    url     := 'https://YOUR-PROJECT-REF.supabase.co/functions/v1/daily-reminders',
    headers := jsonb_build_object('Content-Type', 'application/json', 'x-cron-secret', 'YOUR_CRON_SECRET'),
    body    := '{}'::jsonb
  );
  $$
);

-- To test right now, without waiting for 6am:
--   select net.http_post(url := 'https://YOUR-PROJECT-REF.supabase.co/functions/v1/daily-reminders',
--     headers := jsonb_build_object('Content-Type','application/json','x-cron-secret','YOUR_CRON_SECRET'), body := '{}'::jsonb);

-- To remove the schedule later:
--   select cron.unschedule('daily-loan-reminders');
