-- ============================================================
--  תזכורת «מחר» על אירוע שקורה בעוד שעה
--
--  להדבקה ב-SQL Editor של Supabase והרצה. בטוח להריץ שוב.
--
--  אירוע שנקבע פחות מ-24 שעות לפני שהוא מתחיל ייצר גם את
--  תזכורת ה-24 שעות — שזמנה כבר עבר, ועדיין בתוך חלון השליחה
--  של היממה. התוצאה: הודעה שיוצאת מיד ואומרת «מחר» על משהו
--  שקורה בעוד שעה וחצי.
--
--  זו לא תזכורת מאחרת אלא תזכורת שקרית, והיא מגיעה דווקא
--  ברגע שבו בודקים אם המערכת עובדת — כלומר היא גם מבלבלת וגם
--  מגיעה בתזמון הגרוע ביותר.
--
--  «היום» של יום הולדת לא הושמט: הוא נשאר נכון עד חצות, ולכן
--  יום הולדת שנוסף אחרי 10:30 עדיין שווה הודעה.
--
--  מחליף את הפונקציה בלבד. תזכורות שכבר נשלחו אינן נוגעות.
-- ============================================================

create or replace function rebuild_event_reminders(p_event_id uuid)
returns void
language plpgsql
as $$
declare
  ev  events%rowtype;
  tz  text;
begin
  select * into ev from events where id = p_event_id;
  if not found then
    return;
  end if;

  -- תזכורות שכבר נשלחו נשארות כרשומת היסטוריה; רק הממתינות נבנות מחדש.
  -- כולל מופעים עתידיים שהקרון חימר, כי שינוי במועד או במשתתפים משנה
  -- גם אותם — הקרון ייצור אותם מחדש בהרצה הבאה.
  delete from event_reminders where event_id = p_event_id and sent_at is null;

  if not ev.reminders_on then
    return;
  end if;

  select timezone into tz from households where id = ev.household_id;
  tz := coalesce(tz, 'Asia/Jerusalem');

  insert into event_reminders (event_id, member_id, kind, occurrence_at, fire_at)
  select ev.id, r.member_id, p.kind, ev.starts_at, p.fire_at
  from (
    -- הורים תמיד; ילדים רק אם האירוע נוגע להם
    select m.id as member_id
      from members m
     where m.household_id = ev.household_id
       and (
         m.role = 'parent'
         or m.id in (select member_id from event_participants where event_id = ev.id)
         or m.id = (select patient_id from appointments where event_id = ev.id)
       )
  ) r
  cross join lateral (
    select *
      from (
        values
          ('lead_24h'::reminder_kind,    ev.starts_at - interval '24 hours'),
          ('lead_1h'::reminder_kind,     ev.starts_at - interval '1 hour'),
          ('day_of_1030'::reminder_kind,
             ((ev.starts_at at time zone tz)::date + time '10:30') at time zone tz)
      ) as v(kind, fire_at)
     where case
             when ev.kind in ('birthday', 'holiday') then v.kind = 'day_of_1030'
             else v.kind in ('lead_24h', 'lead_1h')
           end
       -- תזכורת שזמנה כבר עבר אינה נוצרת, אם מה שהיא אומרת תלוי בזמן.
       --
       -- אירוע שנקבע תשעים דקות לפני שהוא מתחיל ייצר גם את תזכורת
       -- ה-24 שעות, שזמנה עבר לפני עשרים ושתיים שעות — ועדיין בתוך
       -- חלון השליחה של היממה. התוצאה היא הודעה שיוצאת מיד ואומרת
       -- «מחר» על משהו שקורה בעוד שעה וחצי. זו לא תזכורת מאחרת, זו
       -- תזכורת שקרית, והיא מגיעה דווקא ברגע שבו אדם בודק אם המערכת
       -- עובדת.
       --
       -- «היום» של יום הולדת לא מושמט: הוא נשאר נכון עד חצות, ולכן
       -- יום הולדת שנוסף אחרי 10:30 עדיין שווה הודעה.
       and (v.kind = 'day_of_1030' or v.fire_at > now())
  ) p
  on conflict (event_id, member_id, kind, occurrence_at) do update
    set fire_at = excluded.fire_at;
end;
$$;

-- ------------------------------------------------------------
--  בונה מחדש את התזכורות הממתינות, כדי שתזכורות שקריות שכבר
--  נוצרו ייעלמו במקום לחכות בתור. שורות שנשלחו נשמרות.
-- ------------------------------------------------------------
do $do$
declare e uuid;
begin
  for e in select id from events loop
    perform rebuild_event_reminders(e);
  end loop;
end
$do$;

select count(*) as "תזכורות ממתינות אחרי הניקוי"
  from event_reminders where sent_at is null;
