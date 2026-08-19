-- ============================================================
--  תיקון: «התראות פעילות» מעל «0 מכשירים רשומים»
--
--  להדבקה ב-SQL Editor של Supabase והרצה. בטוח להריץ שוב.
--
--  הדפדפן נרשם להתראות בהצלחה, והשרת מעולם לא שמע על זה. שתי
--  התשובות הגיעו משני מקומות שונים ואף אחת לא ידעה על השנייה,
--  ולכן המסך יכול היה להראות שההתראות פועלות בזמן שאין למי לשלוח.
--
--  הכתיבה לטבלה הייתה upsert לפי endpoint, ושני דברים נפרדים
--  מנעו אותה — שניהם בשקט:
--
--  1. ON CONFLICT DO UPDATE דורש הרשאת UPDATE כבר בזמן ניתוח
--     השאילתה, גם כשאין שום שורה מתנגשת. לתפקיד authenticated יש
--     על הטבלה הזו select, insert ו-delete בלבד. כלומר כל רישום
--     נדחה תמיד, מהניסיון הראשון, אצל כולם.
--
--  2. וכשכן הייתה שורה לאותו endpoint תחת בן משפחה אחר — טלפון
--     אחד ושני חשבונות — RLS דחה את העדכון, וזה התנהגות נכונה.
--
--  הפתרון הוא פונקציה אחת שעושה את הרישום, במקום כתיבה ישירה.
-- ============================================================

create or replace function claim_push_device(
  p_endpoint   text,
  p_p256dh     text,
  p_auth       text,
  p_user_agent text default null
)
returns integer
language plpgsql
security definer
set search_path = public
as $$
declare
  v_member uuid;
  v_count  integer;
begin
  select id into v_member from members where user_id = auth.uid();
  if v_member is null then
    raise exception 'no member is linked to this account'
      using errcode = 'P0001';
  end if;

  if coalesce(p_endpoint, '') = '' or coalesce(p_p256dh, '') = ''
     or coalesce(p_auth, '') = '' then
    raise exception 'incomplete subscription' using errcode = 'P0001';
  end if;

  -- endpoint מזהה דפדפן אחד במכשיר אחד, ואפשר להשיג אותו רק מאותו
  -- דפדפן. מי שמחובר שם עכשיו הוא זה שהתזכורות שייכות לו, ולכן
  -- שורה שנשארה מחשבון קודם באותו טלפון היא שארית — לא טענה מתחרה.
  delete from push_subscriptions where endpoint = p_endpoint;

  insert into push_subscriptions (member_id, endpoint, p256dh, auth, user_agent)
  values (v_member, p_endpoint, p_p256dh, p_auth, left(p_user_agent, 300));

  select count(*) into v_count
    from push_subscriptions where member_id = v_member;
  return v_count;
end;
$$;

revoke all on function claim_push_device(text, text, text, text) from public;
grant execute on function claim_push_device(text, text, text, text) to authenticated;

-- ------------------------------------------------------------
--  מה עכשיו
--
--  אחרי הפריסה הבאה, כל מי שההתראות שלו כבר «פעילות» בדפדפן
--  יירשם מעצמו ברגע שיפתח את האפליקציה — הערכים כולם כבר נמצאים
--  אצלו במכשיר, ואין מה לבקש ממנו לעשות שוב.
-- ------------------------------------------------------------

select 'הפונקציה הותקנה. פרסו מחדש ב-Vercel ופתחו את האפליקציה.' as תוצאה;
