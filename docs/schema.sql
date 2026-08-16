-- ============================================================
--  אפליקציה משפחתית — סכימת Postgres / Supabase
--  להרצה ב-SQL Editor של Supabase (או psql מול Postgres 15+).
--  מניח קיום של schema בשם auth (מגיע עם Supabase).
-- ============================================================

create extension if not exists "pgcrypto";

-- ------------------------------------------------------------
-- 1. משק בית ובני משפחה
-- ------------------------------------------------------------

create table households (
  id          uuid primary key default gen_random_uuid(),
  name        text not null,
  timezone    text not null default 'Asia/Jerusalem',
  created_at  timestamptz not null default now()
);

create type member_role as enum ('parent', 'child', 'guest');

-- user_id יכול להיות NULL: כך אפשר לשייך תור רפואי לילד קטן
-- בלי שיהיה לו חשבון משלו.
create table members (
  id            uuid primary key default gen_random_uuid(),
  household_id  uuid not null references households(id) on delete cascade,
  user_id       uuid unique references auth.users(id) on delete set null,
  display_name  text not null,
  role          member_role not null default 'child',
  color         text not null default '#3b82f6',
  birth_date    date,
  avatar_url    text,
  created_at    timestamptz not null default now()
);

create index on members (household_id);

-- הפונקציה שכל מדיניות ה-RLS נשענת עליה.
-- security definer כדי שהשאילתה על members לא תיכנס לרקורסיה עם המדיניות שלה.
create or replace function current_household_ids()
returns setof uuid
language sql
stable
security definer
set search_path = public
as $$
  select household_id from members where user_id = auth.uid();
$$;

-- ------------------------------------------------------------
-- 2. יומן ותורים רפואיים
-- ------------------------------------------------------------

create type event_kind as enum ('general', 'appointment', 'birthday', 'holiday', 'school', 'reminder');

create table events (
  id            uuid primary key default gen_random_uuid(),
  household_id  uuid not null references households(id) on delete cascade,
  kind          event_kind not null default 'general',
  title         text not null,
  description   text,
  location      text,
  starts_at     timestamptz not null,
  ends_at       timestamptz,
  all_day       boolean not null default false,
  rrule         text,                    -- חזרתיות בתקן RFC 5545, למשל FREQ=WEEKLY;BYDAY=SU,TU
  color         text,
  reminders_on  boolean not null default true,   -- כיבוי תזכורות לאירוע בודד
  -- מסומן כשהאירוע הוא יום הולדת שנגזר משורת בן משפחה, ולא הוזן ידנית.
  birthday_for  uuid unique references members(id) on delete cascade,
  -- C9: מזהה יציב של חג מלוח השנה העברי, כדי שסנכרון חוזר יעדכן ולא ישכפל.
  holiday_key   text,
  created_by    uuid references members(id) on delete set null,
  created_at    timestamptz not null default now(),
  updated_at    timestamptz not null default now(),
  constraint events_time_order check (ends_at is null or ends_at >= starts_at)
);

create index on events (household_id, starts_at);
-- חג אחד לכל משק בית. הסנכרון עושה upsert מעל האינדקס הזה.
--
-- לא אינדקס חלקי, למרות שרוב האירועים אינם חגים: ל-ON CONFLICT אפשר
-- להסיק אינדקס חלקי רק אם המשפט חוזר על תנאי ה-WHERE שלו, ו-PostgREST
-- אינו שולח אותו — התוצאה הייתה 42P10. NULL נחשב ייחודי בפוסטגרס, ולכן
-- אינדקס מלא מתיר כמה שצריך אירועים רגילים עם holiday_key ריק.
create unique index events_household_holiday_key
  on events (household_id, holiday_key);

create table event_participants (
  event_id   uuid not null references events(id) on delete cascade,
  member_id  uuid not null references members(id) on delete cascade,
  primary key (event_id, member_id)
);

-- הרחבה 1:1 מעל events. תור רפואי הוא אירוע יומן לכל דבר —
-- כאן יושבים רק השדות שמייחדים אותו.
create table appointments (
  event_id         uuid primary key references events(id) on delete cascade,
  patient_id       uuid not null references members(id) on delete cascade,
  doctor_name      text,
  specialty        text,     -- רופא משפחה / שיניים / עיניים / התפתחות הילד
  clinic           text,
  hmo              text,     -- קופת חולים
  phone            text,
  referral_needed  boolean not null default false,
  referral_number  text,
  prep_notes       text,     -- צום 12 שעות, להביא בדיקות דם, טופס 17
  follow_up_after  interval  -- לקבוע ביקורת בעוד X (למשל '6 months')
);

create index on appointments (patient_id);

-- ------------------------------------------------------------
-- 2א. ימי הולדת נגזרים
--
-- יום הולדת אינו נשמר כאירוע שמישהו הזין, אלא נגזר מתאריך הלידה
-- של בן המשפחה. הסיבה שהוא בכל זאת שורה ב-events ולא חישוב בתצוגה:
-- התזכורות נתלות ב-event_id, ולכן אירוע שלא קיים בטבלה לא יכול
-- לייצר התראה.
-- ------------------------------------------------------------

create or replace function sync_birthday_event()
returns trigger
language plpgsql
as $$
declare
  tz        text;
  v_next    date;
  v_starts  timestamptz;
  v_event   uuid;
begin
  -- אין תאריך לידה ⟵ אין אירוע. גם מוחק אחד קיים אם התאריך נמחק.
  if new.birth_date is null then
    delete from events where birthday_for = new.id;
    return new;
  end if;

  select coalesce(h.timezone, 'Asia/Jerusalem') into tz
    from households h where h.id = new.household_id;

  -- המופע הקרוב: השנה, ואם כבר עבר — בשנה הבאה.
  v_next := make_date(
    extract(year from (now() at time zone tz))::int,
    extract(month from new.birth_date)::int,
    extract(day from new.birth_date)::int
  );
  if v_next < (now() at time zone tz)::date then
    v_next := v_next + interval '1 year';
  end if;

  v_starts := v_next::timestamp at time zone tz;

  select id into v_event from events where birthday_for = new.id;

  if v_event is null then
    insert into events
      (household_id, kind, title, starts_at, all_day, rrule, birthday_for)
    values
      (new.household_id, 'birthday', 'יום הולדת ' || new.display_name,
       v_starts, true, 'FREQ=YEARLY', new.id)
    returning id into v_event;

    insert into event_participants (event_id, member_id)
         values (v_event, new.id)
    on conflict do nothing;
  else
    update events
       set title     = 'יום הולדת ' || new.display_name,
           starts_at = v_starts
     where id = v_event;
  end if;

  return new;
end;
$$;

create trigger members_birthday_sync
  after insert or update of birth_date, display_name on members
  for each row execute function sync_birthday_event();

-- ------------------------------------------------------------
-- 2ב. תזכורות לאירועים
--
--   ימי הולדת וחגים  ⟵  תזכורת אחת, ב-10:30 ביום האירוע עצמו
--   כל שאר האירועים  ⟵  שתי תזכורות: 24 שעות לפני, ושעה לפני
--
-- הנמענים: שני ההורים תמיד, ובנוסף כל ילד שהאירוע נוגע לו —
-- משתתף באירוע, או המטופל בתור רפואי.
--
-- השורות כאן הן תור עבודה: פונקציית ה-cron סורקת fire_at שהגיע
-- ו-sent_at ריק, שולחת פוש, ומסמנת. זה מה שהופך תזכורת שהוחמצה
-- לניתנת לאיתור במקום להיעלם בשקט.
-- ------------------------------------------------------------

create type reminder_kind as enum ('lead_24h', 'lead_1h', 'day_of_1030');

create table event_reminders (
  id         uuid primary key default gen_random_uuid(),
  event_id   uuid not null references events(id) on delete cascade,
  member_id  uuid not null references members(id) on delete cascade,
  kind       reminder_kind not null,
  -- המופע שהתזכורת שייכת אליו. לאירוע חד-פעמי זהה ל-starts_at; לאירוע
  -- חוזר זה מה שמאפשר שורה נפרדת לכל מופע, ולא רק לראשון.
  occurrence_at timestamptz not null,
  fire_at    timestamptz not null,
  sent_at    timestamptz,
  unique (event_id, member_id, kind, occurrence_at)
);

-- האינדקס שהקרון סורק: רק תזכורות שטרם נשלחו.
create index event_reminders_pending
  on event_reminders (fire_at)
  where sent_at is null;

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
  ) p
  on conflict (event_id, member_id, kind, occurrence_at) do update
    set fire_at = excluded.fire_at;
end;
$$;

create or replace function trg_rebuild_reminders_event()
returns trigger language plpgsql as $$
begin
  perform rebuild_event_reminders(new.id);
  return new;
end;
$$;

create or replace function trg_rebuild_reminders_child()
returns trigger language plpgsql as $$
begin
  perform rebuild_event_reminders(coalesce(new.event_id, old.event_id));
  return coalesce(new, old);
end;
$$;

-- הרכב הנמענים תלוי בהרכב משק הבית, ולא רק באירוע עצמו. בלי הטריגר
-- הזה הורה שהצטרף אחרי שנוצרו אירועים לא היה מקבל עליהם תזכורת לעולם,
-- כי השורות חושבו פעם אחת ברגע היצירה.
--
-- שם הטריגר מתחיל ב-m כדי שירוץ אחרי members_birthday_sync (טריגרים
-- באותו תזמון רצים לפי סדר אלפביתי), ולכן אירוע יום ההולדת של החבר
-- החדש כבר קיים כשהתזכורות נבנות.
create or replace function trg_rebuild_reminders_member()
returns trigger
language plpgsql
as $$
declare
  hh uuid := coalesce(new.household_id, old.household_id);
  e  uuid;
begin
  for e in select id from events where household_id = hh loop
    perform rebuild_event_reminders(e);
  end loop;
  return coalesce(new, old);
end;
$$;

create trigger members_reminders_sync
  after insert or delete or update of role, household_id on members
  for each row execute function trg_rebuild_reminders_member();

create trigger events_reminders_sync
  after insert or update of starts_at, kind, reminders_on on events
  for each row execute function trg_rebuild_reminders_event();

create trigger participants_reminders_sync
  after insert or delete on event_participants
  for each row execute function trg_rebuild_reminders_child();

create trigger appointments_reminders_sync
  after insert or update of patient_id on appointments
  for each row execute function trg_rebuild_reminders_child();

-- ------------------------------------------------------------
-- 3. משימות
-- ------------------------------------------------------------

create type task_status as enum ('open', 'in_progress', 'done', 'cancelled');

create table tasks (
  id            uuid primary key default gen_random_uuid(),
  household_id  uuid not null references households(id) on delete cascade,
  title         text not null,
  notes         text,
  assignee_id   uuid references members(id) on delete set null,
  created_by    uuid references members(id) on delete set null,
  due_at        timestamptz,
  priority      smallint not null default 2 check (priority between 1 and 3),
  status        task_status not null default 'open',
  rrule         text,
  points        smallint not null default 0,   -- לגיימיפיקציה של מטלות ילדים
  completed_at  timestamptz,
  completed_by  uuid references members(id) on delete set null,
  created_at    timestamptz not null default now()
);

create index on tasks (household_id, status, due_at);
create index on tasks (assignee_id) where status in ('open', 'in_progress');

-- ------------------------------------------------------------
-- 4. מלאי הבית ורשימת קניות
-- ------------------------------------------------------------

create table inventory_items (
  id                uuid primary key default gen_random_uuid(),
  household_id      uuid not null references households(id) on delete cascade,
  name              text not null,
  category          text,                       -- מוצרי חלב / ניקיון / תרופות
  storage_location  text,                       -- מקרר / מקפיא / מזווה / אמבטיה
  unit              text not null default 'יח׳',
  quantity          numeric not null default 0,
  min_quantity      numeric not null default 1, -- הסף שמתחתיו נפתח פריט קניות
  target_quantity   numeric,                    -- לכמה להשלים בקנייה; ברירת מחדל: פי שניים מהסף
  auto_restock      boolean not null default true,
  barcode           text,
  expires_on        date,
  updated_at        timestamptz not null default now(),
  unique (household_id, name)
);

create index on inventory_items (household_id)
  where quantity <= min_quantity;

create table shopping_items (
  id                 uuid primary key default gen_random_uuid(),
  household_id       uuid not null references households(id) on delete cascade,
  name               text not null,
  quantity           numeric not null default 1,
  unit               text,
  category           text,
  store              text,
  is_checked         boolean not null default false,
  source             text not null default 'manual'
                       check (source in ('manual', 'auto_low_stock')),
  inventory_item_id  uuid references inventory_items(id) on delete set null,
  added_by           uuid references members(id) on delete set null,
  checked_by         uuid references members(id) on delete set null,
  checked_at         timestamptz,
  created_at         timestamptz not null default now()
);

create index on shopping_items (household_id, is_checked);

-- לכל היותר פריט קניות פתוח אחד לכל פריט מלאי.
-- זה מה שמונע מהטריגר להציף את הרשימה בכפילויות.
create unique index shopping_items_one_open_per_inventory
  on shopping_items (inventory_item_id)
  where inventory_item_id is not null and is_checked = false;

-- ------------------------------------------------------------
-- 5. הלוגיקה שמחברת מלאי לקניות
--    יושבת בבסיס הנתונים ולא באפליקציה, כדי שתחול על כל מקור
--    עדכון — ממשק, סקריפט, או בוט עתידי.
-- ------------------------------------------------------------

-- כמות ירדה לסף או מתחתיו ⟵ פריט נכנס לרשימת הקניות.
--
-- שתי נקודות עדינות שקל לפספס:
--   1. קונים עד יעד ההשלמה, לא עד הסף. השלמה עד הסף בלבד מחזירה אתכם
--      מיד למצב חוסר אחרי הקנייה הראשונה.
--   2. אם המלאי ממשיך לרדת בזמן שהפריט כבר ברשימה — הכמות ברשימה מתעדכנת.
--      בלי זה הכמות קופאת ברגע חציית הסף ולא מספיקה עד שמגיעים לסופר.
create or replace function sync_low_stock_to_shopping()
returns trigger
language plpgsql
as $$
declare
  v_target numeric := coalesce(new.target_quantity, new.min_quantity * 2);
  v_needed numeric := greatest(v_target - new.quantity, 1);
begin
  if not new.auto_restock or new.quantity > new.min_quantity then
    return new;
  end if;

  insert into shopping_items
    (household_id, name, quantity, unit, category, source, inventory_item_id)
  values
    (new.household_id, new.name, v_needed, new.unit, new.category, 'auto_low_stock', new.id)
  on conflict (inventory_item_id) where (inventory_item_id is not null and is_checked = false)
  do update set quantity = excluded.quantity;

  return new;
end;
$$;

create trigger trg_inventory_low_stock
  after insert or update of quantity, min_quantity, target_quantity, auto_restock
  on inventory_items
  for each row
  execute function sync_low_stock_to_shopping();

-- פריט קניות מקושר סומן כ"נקנה" ⟵ המלאי גדל בחזרה.
create or replace function restock_inventory_on_check()
returns trigger
language plpgsql
as $$
begin
  if new.is_checked and not old.is_checked and new.inventory_item_id is not null then
    update inventory_items
       set quantity   = quantity + new.quantity,
           updated_at = now()
     where id = new.inventory_item_id;
  end if;
  return new;
end;
$$;

create trigger trg_shopping_checked_restock
  after update of is_checked on shopping_items
  for each row
  execute function restock_inventory_on_check();

-- ------------------------------------------------------------
-- 6. Row Level Security
--    כלל אחד לכל הטבלאות: רואים רק את משק הבית שאתה חבר בו.
-- ------------------------------------------------------------

alter table households        enable row level security;
alter table members           enable row level security;
alter table events            enable row level security;
alter table event_participants enable row level security;
alter table appointments      enable row level security;
alter table event_reminders   enable row level security;
alter table tasks             enable row level security;
alter table inventory_items   enable row level security;
alter table shopping_items    enable row level security;

create policy household_access on households
  for all using (id in (select current_household_ids()))
  with check (id in (select current_household_ids()));

-- טבלאות עם household_id ישיר
create policy member_access on members
  for all using (household_id in (select current_household_ids()))
  with check (household_id in (select current_household_ids()));

create policy event_access on events
  for all using (household_id in (select current_household_ids()))
  with check (household_id in (select current_household_ids()));

create policy task_access on tasks
  for all using (household_id in (select current_household_ids()))
  with check (household_id in (select current_household_ids()));

create policy inventory_access on inventory_items
  for all using (household_id in (select current_household_ids()))
  with check (household_id in (select current_household_ids()));

create policy shopping_access on shopping_items
  for all using (household_id in (select current_household_ids()))
  with check (household_id in (select current_household_ids()));

-- טבלאות שמגיעות למשק הבית דרך האירוע שלהן
create policy participant_access on event_participants
  for all using (
    event_id in (
      select id from events where household_id in (select current_household_ids())
    )
  )
  with check (
    event_id in (
      select id from events where household_id in (select current_household_ids())
    )
  );

create policy appointment_access on appointments
  for all using (
    event_id in (
      select id from events where household_id in (select current_household_ids())
    )
  )
  with check (
    event_id in (
      select id from events where household_id in (select current_household_ids())
    )
  );

create policy reminder_access on event_reminders
  for all using (
    event_id in (
      select id from events where household_id in (select current_household_ids())
    )
  )
  with check (
    event_id in (
      select id from events where household_id in (select current_household_ids())
    )
  );

-- ------------------------------------------------------------
-- 5ב. התראות
--
-- שלוש טבלאות, ותפקיד שונה לכל אחת:
--
--   push_subscriptions       — לאיזה מכשיר לשלוח. באייפון נרשם רק אחרי
--                              "הוסף למסך הבית", ולכן לאדם אחד יכולים
--                              להיות כמה מכשירים או אף אחד.
--   notification_preferences — מה כל אחד מסכים לקבל, ומתי לא להפריע.
--   notifications            — תור השליחה. מקורות שונים כותבים לתוכו
--                              (תזכורות יומן, משימות, סיכום בוקר), והקרון
--                              קורא ממנו מקור אחד.
-- ------------------------------------------------------------

create table push_subscriptions (
  id          uuid primary key default gen_random_uuid(),
  member_id   uuid not null references members(id) on delete cascade,
  endpoint    text not null unique,
  p256dh      text not null,
  auth        text not null,
  user_agent  text,
  created_at  timestamptz not null default now(),
  -- מתעדכן כשדחיפה נכשלת, כדי לזהות מנויים מתים
  failed_at   timestamptz
);

create index on push_subscriptions (member_id);

create type notification_kind as enum (
  'appointment', 'event', 'birthday', 'task', 'shopping', 'digest'
);

create table notification_preferences (
  member_id     uuid primary key references members(id) on delete cascade,
  appointments  boolean not null default true,
  events        boolean not null default true,
  birthdays     boolean not null default true,
  tasks         boolean not null default true,
  shopping      boolean not null default false,  -- הכי רועש, כבוי כברירת מחדל
  digest        boolean not null default true,
  digest_at     time not null default '07:30',
  quiet_from    time not null default '22:00',
  quiet_to      time not null default '07:00',
  created_at    timestamptz not null default now()
);

-- לכל בן משפחה יש העדפות מרגע שנוצר, כדי שהקרון לא יצטרך לטפל בחסר.
--
-- security definer בכוונה: הטריגר רץ בהרשאות מי שהוסיף את בן המשפחה,
-- ולטבלה אין מדיניות INSERT — היא נכתבת רק מכאן. בלי זה הוספת בן משפחה
-- דרך מסך המשפחה נכשלת ב-"new row violates row-level security policy".
create or replace function ensure_notification_preferences()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  insert into notification_preferences (member_id) values (new.id)
  on conflict (member_id) do nothing;
  return new;
end;
$$;

create trigger members_default_preferences
  after insert on members
  for each row execute function ensure_notification_preferences();

create table notifications (
  id          uuid primary key default gen_random_uuid(),
  member_id   uuid not null references members(id) on delete cascade,
  kind        notification_kind not null,
  title       text not null,
  body        text,
  url         text,
  fire_at     timestamptz not null,
  sent_at     timestamptz,
  -- מזהה לוגי של ההתראה. מונע כפילות כשהקרון רץ שוב על אותו חלון,
  -- וזה קורה בכל הרצה.
  dedupe_key  text not null,
  created_at  timestamptz not null default now(),
  unique (member_id, dedupe_key)
);

create index notifications_pending
  on notifications (fire_at)
  where sent_at is null;

alter table push_subscriptions       enable row level security;
alter table notification_preferences enable row level security;
alter table notifications            enable row level security;

-- מנוי לדחיפה שייך למכשיר של אדם אחד, ולא לכל משק הבית.
create policy push_own on push_subscriptions
  for all using (
    member_id in (select id from members where user_id = auth.uid())
  )
  with check (
    member_id in (select id from members where user_id = auth.uid())
  );

-- העדפות: כל אחד עורך את שלו, אך הורה רואה את של כולם כדי לעזור לילד.
create policy prefs_read on notification_preferences
  for select using (
    member_id in (select id from members where household_id in (select current_household_ids()))
  );

create policy prefs_write on notification_preferences
  for update
  using (
    member_id in (select id from members where user_id = auth.uid())
    or exists (
      select 1 from members me
       where me.user_id = auth.uid()
         and me.role = 'parent'
         and me.household_id = (select household_id from members m2 where m2.id = member_id)
    )
  )
  with check (
    member_id in (select id from members where user_id = auth.uid())
    or exists (
      select 1 from members me
       where me.user_id = auth.uid()
         and me.role = 'parent'
         and me.household_id = (select household_id from members m2 where m2.id = member_id)
    )
  );

create policy notifications_own on notifications
  for select using (
    member_id in (select id from members where user_id = auth.uid())
  );

do $$
begin
  if exists (select 1 from pg_roles where rolname = 'authenticated') then
    grant select, insert, delete on push_subscriptions to authenticated;
    grant select, update on notification_preferences to authenticated;
    grant select on notifications to authenticated;
  end if;
end
$$;

-- ------------------------------------------------------------
-- 6ב. הצטרפות למשק בית
--
-- שתי הפעולות כאן הן security definer בכוונה, כי שתיהן קורות
-- כשלמשתמש עדיין אין שיוך למשק בית — ולכן מדיניות ה-RLS הרגילה
-- הייתה חוסמת אותן. זו נקודת הכניסה היחידה שעוקפת אותה, והיא
-- מצומצמת בדיוק לשני התרחישים האלה.
-- ------------------------------------------------------------

create table household_invites (
  id           uuid primary key default gen_random_uuid(),
  household_id uuid not null references households(id) on delete cascade,
  -- שיוך להזמנה לשורת בן משפחה קיימת (למשל: "ההזמנה הזו היא ליונתן").
  -- null = צרף כבן משפחה חדש.
  member_id    uuid references members(id) on delete cascade,
  token        text not null unique default encode(gen_random_bytes(16), 'hex'),
  created_by   uuid references members(id) on delete set null,
  expires_at   timestamptz not null default now() + interval '14 days',
  used_at      timestamptz,
  used_by      uuid references auth.users(id) on delete set null,
  created_at   timestamptz not null default now()
);

create index household_invites_open
  on household_invites (household_id)
  where used_at is null;

-- יצירת משק בית חדש על ידי המשתמש הראשון, שהופך אוטומטית להורה.
create or replace function create_household(
  p_household_name text,
  p_display_name   text,
  p_color          text default '#BFD8EC',
  p_birth_date     date default null
)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  v_household uuid;
begin
  if auth.uid() is null then
    raise exception 'not authenticated' using errcode = '28000';
  end if;

  if exists (select 1 from members where user_id = auth.uid()) then
    raise exception 'user already belongs to a household' using errcode = '23505';
  end if;

  insert into households (name)
       values (p_household_name)
    returning id into v_household;

  insert into members (household_id, user_id, display_name, role, color, birth_date)
       values (v_household, auth.uid(), p_display_name, 'parent', p_color, p_birth_date);

  return v_household;
end;
$$;

-- מימוש הזמנה: המשתמש המחובר נקשר לשורת בן משפחה קיימת, או נוצר כחדש.
create or replace function claim_invite(
  p_token        text,
  p_display_name text default null
)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  inv      household_invites%rowtype;
  v_member uuid;
begin
  if auth.uid() is null then
    raise exception 'not authenticated' using errcode = '28000';
  end if;

  select * into inv
    from household_invites
   where token = p_token
     and used_at is null
     and expires_at > now()
     for update;

  if not found then
    raise exception 'invite not found or expired' using errcode = '22023';
  end if;

  if inv.member_id is not null then
    -- ההזמנה שמורה לשורה קיימת. התנאי user_id is null מונע גניבת מקום
    -- שכבר נתפס, גם אם שני אנשים לחצו על אותו קישור.
    update members
       set user_id      = auth.uid(),
           display_name = coalesce(p_display_name, display_name)
     where id = inv.member_id
       and user_id is null
    returning id into v_member;

    if v_member is null then
      raise exception 'member slot already claimed' using errcode = '23505';
    end if;
  else
    insert into members (household_id, user_id, display_name, role)
         values (inv.household_id, auth.uid(), coalesce(p_display_name, 'בן משפחה'), 'child')
      returning id into v_member;
  end if;

  update household_invites
     set used_at = now(), used_by = auth.uid()
   where id = inv.id;

  return v_member;
end;
$$;

alter table household_invites enable row level security;

create policy invite_access on household_invites
  for all using (household_id in (select current_household_ids()))
  with check (household_id in (select current_household_ids()));

-- המוזמן עדיין אינו חבר, ולכן אינו רואה את השורה ישירות —
-- claim_invite היא הדרך היחידה שלו לגעת בה.

do $$
begin
  if exists (select 1 from pg_roles where rolname = 'authenticated') then
    grant execute on function create_household(text, text, text, date) to authenticated;
    grant execute on function claim_invite(text, text) to authenticated;
  end if;
end
$$;

-- ------------------------------------------------------------
-- 7. סנכרון חי (Supabase Realtime)
--    ה-publication קיים רק ב-Supabase. התנאי מאפשר להריץ את אותו
--    קובץ גם מול Postgres רגיל באחסון עצמי, בלי שגיאה.
-- ------------------------------------------------------------

do $$
begin
  if exists (select 1 from pg_publication where pubname = 'supabase_realtime') then
    alter publication supabase_realtime add table shopping_items;
    alter publication supabase_realtime add table inventory_items;
    alter publication supabase_realtime add table tasks;
    alter publication supabase_realtime add table events;
  end if;
end
$$;
