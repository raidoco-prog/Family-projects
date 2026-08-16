-- ============================================================
--  איפוס מלא של הסכימה
--
--  להרצה ב-SQL Editor של Supabase *לפני* schema.sql, כשמריצים
--  גרסה מעודכנת של הסכימה על פרויקט שכבר הורץ בו קודם.
--
--  ⚠️  מוחק את כל הנתונים בטבלאות האפליקציה. חשבונות המשתמשים
--      ב-auth.users נשארים — רק השיוך שלהם למשק בית נמחק.
-- ============================================================

drop trigger if exists members_birthday_sync         on members;
drop trigger if exists events_reminders_sync          on events;
drop trigger if exists participants_reminders_sync    on event_participants;
drop trigger if exists appointments_reminders_sync    on appointments;
drop trigger if exists trg_inventory_low_stock        on inventory_items;
drop trigger if exists trg_shopping_checked_restock   on shopping_items;

drop function if exists sync_birthday_event()            cascade;
drop function if exists rebuild_event_reminders(uuid)    cascade;
drop function if exists trg_rebuild_reminders_event()    cascade;
drop function if exists trg_rebuild_reminders_child()    cascade;
drop function if exists sync_low_stock_to_shopping()     cascade;
drop function if exists restock_inventory_on_check()     cascade;
drop function if exists create_household(text, text, text, date) cascade;
drop function if exists claim_invite(text, text)         cascade;
drop function if exists current_household_ids()          cascade;

drop table if exists event_reminders     cascade;
drop table if exists appointments        cascade;
drop table if exists event_participants  cascade;
drop table if exists events              cascade;
drop table if exists tasks               cascade;
drop table if exists shopping_items      cascade;
drop table if exists inventory_items     cascade;
drop table if exists household_invites   cascade;
drop table if exists members             cascade;
drop table if exists households          cascade;

drop type if exists reminder_kind cascade;
drop type if exists event_kind    cascade;
drop type if exists task_status   cascade;
drop type if exists member_role   cascade;
