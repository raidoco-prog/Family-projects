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

create type event_kind as enum ('general', 'appointment', 'birthday', 'school', 'reminder');

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
  created_by    uuid references members(id) on delete set null,
  created_at    timestamptz not null default now(),
  updated_at    timestamptz not null default now(),
  constraint events_time_order check (ends_at is null or ends_at >= starts_at)
);

create index on events (household_id, starts_at);

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
