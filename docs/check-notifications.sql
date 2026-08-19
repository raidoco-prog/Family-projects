-- ============================================================
--  למה לא מגיעות התראות
--
--  להדבקה ב-SQL Editor של Supabase. קריאה בלבד — לא משנה כלום.
--
--  שרשרת ההתראות עוברת דרך שישה מקומות, וכשל בכל אחד מהם נראה
--  מהטלפון בדיוק אותו דבר: שום דבר לא מגיע. זה שואל את כולם
--  בבת אחת ואומר איפה זה נעצר.
--
--  הכל בתוך פונקציה עם EXECUTE, ולא שאילתות רגילות, מסיבה
--  מעשית: פוסטגרס מאתר כל טבלה בזמן הניתוח: אזכור של cron.job
--  מפיל את ההרצה כולה כשהתוסף חסר, גם אם התנאי שמעליו אמור
--  לדלג עליו. בדיקה שנופלת כשמשהו חסר היא חסרת ערך בדיוק במקרה
--  שבשבילו נכתבה.
-- ============================================================

create or replace function pg_temp.notification_report()
returns table (שלב text, ממצא text, מסקנה text)
language plpgsql
as $$
declare
  v_found  text;
  v_count  bigint;
  v_sent   bigint;
  v_due    bigint;
begin
  ---------------------------------------------------------------
  שלב := '1. תוספים';
  select coalesce(string_agg(extname, ', ' order by extname), '— אין')
    into v_found
    from pg_extension where extname in ('pg_cron', 'pg_net');

  ממצא := v_found;
  מסקנה := case when v_found like '%pg_cron%' and v_found like '%pg_net%'
                then 'תקין'
                else 'חסרים. הריצו את cron.sql' end;
  return next;

  ---------------------------------------------------------------
  שלב := '2. המשימה המתוזמנת';
  if to_regclass('cron.job') is null then
    ממצא := 'pg_cron לא מותקן';
    מסקנה := 'הריצו קודם את cron.sql';
  else
    execute $q$
      select jobname || '  ·  ' || schedule ||
             case when active then '  ·  פעילה' else '  ·  כבויה' end
        from cron.job where jobname = 'family-notify'
    $q$ into v_found;
    ממצא := coalesce(v_found, '— לא נרשמה');
    מסקנה := case when v_found is null
                  then 'cron.sql לא הושלם'
                  when v_found like '%כבויה%'
                  then 'המשימה קיימת אבל מושבתת'
                  else 'תקין' end;
  end if;
  return next;

  ---------------------------------------------------------------
  -- אם pg_cron ירה בכלל. succeeded פירושו שה-SQL רץ — לא
  -- שהאפליקציה ענתה בסדר. את זה בודקים בשלב הבא.
  שלב := '3. הרצות אחרונות';
  if to_regclass('cron.job_run_details') is null then
    ממצא := '—';
    מסקנה := 'אין מידע עדיין';
  else
    execute $q$
      select string_agg(to_char(start_time at time zone 'Asia/Jerusalem',
                                'DD/MM HH24:MI') || '  ' || status, chr(10)
                        order by start_time desc)
        from (select start_time, status from cron.job_run_details
               where jobid = (select jobid from cron.job where jobname='family-notify')
               order by start_time desc limit 5) r
    $q$ into v_found;
    ממצא := coalesce(v_found, '— עוד לא רצה');
    מסקנה := case when v_found is null
                  then 'ממתינים לרבע השעה הבא'
                  else 'הקרון פועל' end;
  end if;
  return next;

  ---------------------------------------------------------------
  -- השלב שבאמת עונה: מה השרת החזיר.
  שלב := '4. תשובת האפליקציה';
  if to_regclass('net._http_response') is null then
    ממצא := 'pg_net לא מותקן';
    מסקנה := 'הריצו את cron.sql';
  else
    execute $q$
      select string_agg(to_char(created at time zone 'Asia/Jerusalem','DD/MM HH24:MI') ||
                        '  status=' || coalesce(status_code::text,'אין') || '  ' ||
                        left(coalesce(content, error_msg, ''), 200), chr(10)
                        order by created desc)
        from (select created, status_code, content, error_msg
                from net._http_response order by created desc limit 5) r
    $q$ into v_found;
    ממצא := coalesce(v_found, '— הקריאה עוד לא יצאה');
    מסקנה :=
      case
        when v_found is null            then 'ממתינים להרצה הראשונה'
        when v_found like '%status=200%' then 'הקריאה הצליחה. בדקו sent בגוף התשובה'
        when v_found like '%status=401%' then 'ה-CRON_SECRET במסד שונה מזה שב-Vercel'
        when v_found like '%status=500%' then 'חסר משתנה סביבה בשרת — ראו את גוף התשובה'
        else 'ראו את הקוד והגוף' end;
  end if;
  return next;

  ---------------------------------------------------------------
  שלב := '5. מכשירים רשומים';
  select count(*) into v_count from push_subscriptions;
  ממצא := v_count::text;
  מסקנה := case when v_count = 0
                then 'אף אחד לא לחץ «הפעלת התראות» — אין למי לשלוח'
                else 'יש למי לשלוח' end;
  return next;

  ---------------------------------------------------------------
  שלב := '6. התור';
  select count(*) filter (where sent_at is null and fire_at <= now()),
         count(*) filter (where sent_at is not null)
    into v_due, v_sent
    from notifications;

  ממצא := 'ממתינות שהגיע זמנן: ' || v_due || '  ·  נשלחו אי פעם: ' || v_sent;
  מסקנה :=
    case
      when v_sent > 0 then 'השרשרת עבדה לפחות פעם אחת'
      when v_due > 0  then 'יש ממתינות ואיש לא שלח — הקרון אינו רץ'
      else 'אין מה לשלוח כרגע. צרו אירוע בעוד שעה וחצי ובדקו שוב'
    end;
  return next;
end;
$$;

select * from pg_temp.notification_report();
