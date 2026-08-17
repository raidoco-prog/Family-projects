-- ============================================================
--  מי רואה מה — הפרדה בין הורים לילדים
--
--  להרצה ב-SQL Editor של Supabase על מסד קיים. מסד חדש שנבנה
--  מ-schema.sql כולל את זה כבר מלכתחילה, והרצה כאן לא תזיק לו.
--
--  הכלל: ההורים רואים הכל. ילד רואה אירוע שמסומן בשמו, ואירוע
--  שלא מסומן באיש. חג, יום הולדת וארוחה משפחתית אינם מסומנים
--  ולכן גלויים לכולם; תור רפואי וחוג פרטי כן, ולכן אינם.
--
--  זה משנה מה שאילתות מחזירות, לא מה שקיים. שום שורה לא נמחקת.
-- ============================================================

create or replace function can_see_event(p_event_id uuid)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1
      from events e
      join members me
        on me.user_id = auth.uid()
       and me.household_id = e.household_id
     where e.id = p_event_id
       and (
            me.role = 'parent'
         or exists (select 1 from event_participants p
                     where p.event_id = e.id and p.member_id = me.id)
         or exists (select 1 from appointments a
                     where a.event_id = e.id and a.patient_id = me.id)
         -- תור רפואי לעולם אינו «של כל הבית», גם לפני ששורת
         -- appointments נכתבה. אחרת יש חלון שבו הוא גלוי לילדים.
         or (
              e.kind <> 'appointment'
              and not exists (select 1 from event_participants p where p.event_id = e.id)
              and not exists (select 1 from appointments a where a.event_id = e.id)
            )
       )
  );
$$;

-- ה-USING מסנן קריאה, עדכון ומחיקה. ה-WITH CHECK נשאר ברמת משק
-- הבית בכוונה: בזמן INSERT האירוע עדיין חסר סימונים, ובדיקה
-- מחמירה שם הייתה מונעת מילד ליצור לעצמו תור.
drop policy if exists event_access on events;
create policy event_access on events
  for all using (
    household_id in (select current_household_ids())
    and can_see_event(id)
  )
  with check (household_id in (select current_household_ids()));

drop policy if exists participant_access on event_participants;
create policy participant_access on event_participants
  for all using (can_see_event(event_id))
  with check (
    event_id in (
      select id from events where household_id in (select current_household_ids())
    )
  );

drop policy if exists appointment_access on appointments;
create policy appointment_access on appointments
  for all using (can_see_event(event_id))
  with check (
    event_id in (
      select id from events where household_id in (select current_household_ids())
    )
  );

drop policy if exists reminder_access on event_reminders;
create policy reminder_access on event_reminders
  for all using (can_see_event(event_id))
  with check (
    event_id in (
      select id from events where household_id in (select current_household_ids())
    )
  );
