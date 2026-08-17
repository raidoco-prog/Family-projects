-- ============================================================
--  שלב 7 — סנכרון מתמשך עם יומן גוגל
--
--  להרצה ב-SQL Editor של Supabase. אחרי gcal-import.sql, אבל
--  גם בלעדיו: הסנכרון יביא את אותם אירועים בעצמו.
--
--  כיוון אחד בלבד — גוגל אל האפליקציה. ראה PLAN.md שלב 7.
-- ============================================================

create table if not exists calendar_connections (
  member_id      uuid primary key references members(id) on delete cascade,
  google_email   text,
  -- אסימון רענון של גוגל. סוד לכל דבר: מי שמחזיק בו יכול לקרוא
  -- את היומן ללא הגבלת זמן.
  refresh_token  text not null,
  calendar_id    text not null default 'primary',
  -- אסימון הסנכרון של גוגל. מכאן והלאה כל קריאה מחזירה רק את מה
  -- שהשתנה, ולא את היומן כולו.
  sync_token     text,
  last_synced_at timestamptz,
  last_error     text,
  created_at     timestamptz not null default now()
);

-- RLS דלוקה ובלי אף מדיניות — כלומר אף לקוח לא קורא ולא כותב כאן,
-- גם לא בעל השורה. רק service_role, שעוקף RLS, ניגש לטבלה, והוא
-- קיים רק בצד השרת. זו ההגנה על אסימון הרענון.
alter table calendar_connections enable row level security;

revoke all on calendar_connections from anon, authenticated;


-- מסך ההגדרות צריך להציג «מחובר / לא מחובר», ואסור לו לראות את
-- האסימון. RLS מסננת שורות ולא עמודות, ולכן המצב מגיע מפונקציה
-- שמחזירה בדיוק את מה שמותר להציג.
create or replace function calendar_status()
returns table (connected boolean, google_email text,
               last_synced_at timestamptz, last_error text)
language sql
stable
security definer
set search_path = public
as $$
  select true, c.google_email, c.last_synced_at, c.last_error
    from calendar_connections c
    join members m on m.id = c.member_id
   where m.user_id = auth.uid()
  union all
  select false, null, null, null
   where not exists (
     select 1 from calendar_connections c
       join members m on m.id = c.member_id
      where m.user_id = auth.uid()
   );
$$;

grant execute on function calendar_status() to authenticated;


-- ניתוק. מוחק את האסימון בלבד; האירועים שכבר יובאו נשארים.
create or replace function calendar_disconnect()
returns void
language sql
volatile
security definer
set search_path = public
as $$
  delete from calendar_connections c
   using members m
   where m.id = c.member_id
     and m.user_id = auth.uid();
$$;

grant execute on function calendar_disconnect() to authenticated;


-- אותה עמודה ואותו אינדקס שהייבוא הידני מוסיף, למקרה שהסנכרון
-- מופעל בלעדיו.
alter table events add column if not exists external_key text;
create unique index if not exists events_household_external_key
  on events (household_id, external_key);
