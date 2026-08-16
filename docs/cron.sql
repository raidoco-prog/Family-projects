-- ============================================================
--  תזמון ההתראות
--
--  להרצה ב-SQL Editor של Supabase *אחרי* ש-web/ עלה לאוויר.
--  מחליפים את שתי השורות המסומנות ואז מריצים.
--
--  למה כאן ולא ב-Vercel: התוכנית החינמית של Vercel מגבילה קרון
--  להרצה אחת ביום, וזה חסר תועלת לתזכורת "שעה לפני".
--  pg_cron רץ כל רבע שעה בחינם.
-- ============================================================

create extension if not exists pg_cron;
create extension if not exists pg_net;

-- ⬇️ להחליף לכתובת הפרודקשן ולסוד מ-CRON_SECRET
--    (אותו ערך שנמצא במשתני הסביבה של Vercel)
do $$
declare
  app_url     text := 'https://your-app.vercel.app';
  cron_secret text := 'paste-the-same-value-as-CRON_SECRET';
begin
  perform cron.unschedule('family-notify')
    where exists (select 1 from cron.job where jobname = 'family-notify');

  perform cron.schedule(
    'family-notify',
    '*/15 * * * *',
    format(
      $q$select net.http_post(
           url     := %L,
           headers := jsonb_build_object(
                        'Content-Type',  'application/json',
                        'Authorization', %L),
           body    := '{}'::jsonb
         )$q$,
      app_url || '/api/cron/notify',
      'Bearer ' || cron_secret
    )
  );
end
$$;

-- בדיקה שהמשימה נרשמה
select jobname, schedule, active from cron.job where jobname = 'family-notify';

-- לצפייה בהרצות האחרונות, אחרי שהקרון התחיל לרוץ:
--   select status, return_message, start_time
--     from cron.job_run_details
--    where jobid = (select jobid from cron.job where jobname = 'family-notify')
--    order by start_time desc limit 10;
