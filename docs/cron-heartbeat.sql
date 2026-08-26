-- ============================================================
--  דופק הקרון
--
--  להדבקה ב-SQL Editor של Supabase והרצה. בטוח להריץ שוב.
--
--  למה: אפשר לקבל התראת בדיקה ועדיין לא לקבל אף תזכורת. הבדיקה
--  נשלחת ישירות מהשרת ברגע הלחיצה; תזכורת עוברת דרך משימה
--  מתוזמנת שרצה כל רבע שעה בבסיס הנתונים וקוראת לאפליקציה.
--  כשהמשימה הזו אינה רצה — או רצה ונדחית — שני המצבים נראים
--  מהטלפון בדיוק אותו דבר: שקט.
--
--  השורה כאן נכתבת מחדש בכל הרצה של הקרון, ומסך ההגדרות מציג
--  אותה. כך «הקרון לא רץ» כתוב על המסך במקום להיות מסקנה אחרי
--  שבוע בלי תזכורות.
-- ============================================================

create table if not exists cron_runs (
  id      boolean primary key default true check (id),
  ran_at  timestamptz not null default now(),
  queued  integer not null default 0,
  sent    integer not null default 0,
  failed  integer not null default 0,
  note    text
);

alter table cron_runs enable row level security;

drop policy if exists cron_runs_read on cron_runs;
create policy cron_runs_read on cron_runs
  for select using (auth.uid() is not null);

do $$
begin
  if exists (select 1 from pg_roles where rolname = 'authenticated') then
    grant select on cron_runs to authenticated;
  end if;
end
$$;

select 'הטבלה מוכנה. פרסו מחדש ב-Vercel, ואז הריצו את cron.sql.' as תוצאה;
