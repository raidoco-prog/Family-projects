-- ============================================================
--  תזמון ההתראות
--
--  להרצה ב-SQL Editor של Supabase *אחרי* ש-web/ עלה לאוויר.
--  מחליפים את שתי השורות המסומנות ואז מריצים.
--
--  למה כאן ולא ב-Vercel: התוכנית החינמית של Vercel מגבילה קרון
--  להרצה אחת ביום, וזה חסר תועלת לתזכורת "שעה לפני".
--  pg_cron רץ כל רבע שעה בחינם.
--
--  הקובץ עוצר מיד אם השורות לא הוחלפו, ובסוף שולח קריאת בדיקה
--  אחת ומדפיס מה האפליקציה ענתה. שתי התוספות האלה נכתבו אחרי
--  שהקובץ הורץ כמות שהוא: המשימה נרשמה בהצלחה, פנתה לכתובת
--  הדוגמה, ושאילתת האישור בסוף דיווחה «נרשמה» — כי זו האמת. היא
--  פשוט לא השאלה. שבוע עבר בלי תזכורות ובלי שום דבר שאפשר
--  להצביע עליו.
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
  -- ------------------------------------------------------------
  --  לעצור לפני שנרשמת משימה שתפנה לשומקום, כל רבע שעה, לנצח.
  -- ------------------------------------------------------------
  if app_url like '%your-app.vercel.app%' then
    raise exception E'\n\n  לא הוחלפה הכתובת.\n'
      '  שנו את app_url לכתובת האמיתית של האפליקציה ב-Vercel,\n'
      '  למשל https://family-projects.vercel.app — ואז הריצו שוב.\n';
  end if;

  if cron_secret like 'paste-the-same-value%' or length(cron_secret) < 16 then
    raise exception E'\n\n  לא הוחלף הסוד.\n'
      '  שנו את cron_secret לאותו ערך שנמצא ב-CRON_SECRET במשתני\n'
      '  הסביבה של Vercel — ואז הריצו שוב.\n';
  end if;

  if app_url not like 'https://%' then
    raise exception E'\n\n  הכתובת חייבת להתחיל ב-https:// .\n';
  end if;

  -- שגיאה נפוצה: מדביקים את הכתובת עם / בסוף, ואז הקריאה יוצאת
  -- אל //api/cron/notify ומקבלת 404.
  app_url := rtrim(app_url, '/');

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

  -- ------------------------------------------------------------
  --  קריאת בדיקה אחת, עכשיו, במקום להמתין לרבע השעה הבא.
  --  התשובה נקראת בשאילתה שאחרי הבלוק.
  -- ------------------------------------------------------------
  perform net.http_post(
    url     := app_url || '/api/cron/notify',
    headers := jsonb_build_object(
                 'Content-Type',  'application/json',
                 'Authorization', 'Bearer ' || cron_secret),
    body    := '{}'::jsonb
  );
end
$$;

-- pg_net שולח ברקע. שנייה-שתיים ואז יש תשובה.
select pg_sleep(4);

-- ------------------------------------------------------------
--  מה האפליקציה ענתה על קריאת הבדיקה
--
--  200 עם ok:true  — השרשרת פועלת.
--  401             — ה-CRON_SECRET כאן שונה מזה שב-Vercel.
--  404             — הכתובת שגויה, או שהפריסה לא כוללת את הנתיב.
--  500             — חסר משתנה סביבה; הגוף אומר איזה.
--  אין שורה כלל    — pg_net לא הצליח לצאת החוצה.
-- ------------------------------------------------------------
select
  coalesce(status_code::text, 'אין תשובה')      as "קוד",
  left(coalesce(content, error_msg, ''), 300)   as "מה חזר",
  case
    when status_code = 200 then 'תקין — הקרון יפעל מעכשיו כל רבע שעה'
    when status_code = 401 then 'ה-CRON_SECRET כאן שונה מזה שב-Vercel'
    when status_code = 404 then 'הכתובת שגויה, או שהפריסה ישנה'
    when status_code = 500 then 'חסר משתנה סביבה בשרת — ראו «מה חזר»'
    when status_code is null then 'הקריאה לא יצאה. בדקו את הכתובת'
    else 'ראו את הקוד ואת הגוף'
  end                                            as "מסקנה"
from net._http_response
order by created desc
limit 1;

-- בדיקה שהמשימה נרשמה
select jobname as "משימה", schedule as "תזמון", active as "פעילה"
  from cron.job where jobname = 'family-notify';

-- לצפייה בהרצות האחרונות, אחרי שהקרון התחיל לרוץ:
--   select status, return_message, start_time
--     from cron.job_run_details
--    where jobid = (select jobid from cron.job where jobname = 'family-notify')
--    order by start_time desc limit 10;
