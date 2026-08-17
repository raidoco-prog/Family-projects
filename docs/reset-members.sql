-- ============================================================
--  איפוס שיוכי החשבונות
--
--  מנתק כל בן משפחה מהחשבון שנקשר אליו, חוץ מהבעלים. השורות
--  עצמן — השמות, התפקידים, תאריכי הלידה, האירועים והמשימות —
--  לא נוגעים בהן. רק הקשר בין שורת בן משפחה לחשבון גוגל.
--
--  למה זה נחוץ: כשילד לחץ «המשך עם גוגל» במכשיר שמחובר לחשבון
--  של הורה, גוגל החזירה את חשבון ההורה בלי להציג בורר, והשיוך
--  נקשר לאדם הלא נכון. ההזמנה גם נשרפה בדרך.
--
--  להרצה ב-SQL Editor של Supabase. אפשר להריץ שוב.
-- ============================================================

-- ⬇️ החשבון היחיד שנשאר מקושר. שנה אם זה לא אתה.
create temporary table keeper as
  select id from auth.users where email = 'raido.co@gmail.com';


-- ---------- 1. מה יש עכשיו ----------
select m.display_name as שם,
       m.role         as תפקיד,
       case
         when m.user_id is null                       then '—'
         when m.user_id in (select id from keeper)    then 'מקושר אליך  ⚠️'
         else 'מקושר לחשבון אחר'
       end as מצב
from members m
order by m.role desc, m.created_at;


-- ---------- 2. ניתוק ----------
-- כל מי שאינו הבעלים משוחרר. אם שורה של ילד הצביעה על החשבון
-- שלך, כאן היא מתנקה.
update members
   set user_id = null
 where user_id is null = false
   and user_id not in (select id from keeper);


-- ---------- 3. ההזמנות ----------
-- רק אלה שנוצלו או שפג תוקפן. הזמנה תקפה שכבר נשלחה בוואטסאפ
-- נשארת עובדת — אין סיבה להכריח אותך לשלוח הכל מחדש.
delete from household_invites
 where used_at is not null or expires_at <= now();


-- ---------- 4. מכשירים רשומים להתראות ----------
-- טלפון שנרשם בזמן שהיה מחובר בזהות הלא נכונה יקבל את ההתראות
-- של אותו אדם, ואין דרך אמינה לזהות אילו שורות אלה. כולן
-- נמחקות, וכל אחד ילחץ «הפעלת התראות» פעם אחת במכשיר שלו.
-- אם עוד לא הגדרת התראות הטבלה ריקה וזה לא עושה כלום.
delete from push_subscriptions;


-- ---------- 5. שורות שנוצרו מאליהן ----------
-- הזמנה בלי שיוך לשורה קיימת יוצרת בן משפחה חדש בשם «בן משפחה».
-- מוצג בלבד — מחק ידנית רק אם אתה מזהה שזה זבל.
select id, display_name, created_at
  from members
 where display_name = 'בן משפחה';


-- ---------- 6. מה נשאר ----------
select m.display_name as שם,
       case when m.user_id is null then 'מנותק — צריך הזמנה חדשה'
            else 'מקושר' end as מצב
from members m
order by m.role desc, m.created_at;


-- ============================================================
--  אופציונלי — מחיקת חשבונות ההתחברות עצמם
--
--  אם נוצרו ב-Supabase Auth חשבונות של אנשים שנכנסו בטעות,
--  השורות למטה מוחקות אותם. זה בלתי הפיך, אבל לא מסוכן: מי
--  שנמחק פשוט יתחבר שוב עם גוגל ויקבל חשבון חדש ונקי.
--
--  הרץ קודם את ה-SELECT, ורק אם הרשימה נראית לך — הסר את
--  הסימון מה-DELETE.
-- ============================================================

select id, email, created_at
  from auth.users
 where id not in (select id from keeper);

-- delete from auth.users where id not in (select id from keeper);


-- ============================================================
--  ולבסוף — שזה לא יקרה שוב בשקט
--
--  כשילד מחובר לגוגל של הורה, החשבון שמגיע לכאן הוא של ההורה,
--  והוא כבר משויך לשורה אחרת. עד עכשיו ההתנגשות הגיעה מהאינדקס
--  הייחודי כ-23505 — אותו קוד שמסמן «המקום נתפס», כלומר הודעה
--  שמפנה בדיוק לכיוון ההפוך מהבעיה. עכשיו יש לזה קוד משלו,
--  והאפליקציה אומרת להתחבר עם חשבון אחר.
-- ============================================================

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

  if exists (select 1 from members where user_id = auth.uid()) then
    raise exception 'account already linked to a member'
      using errcode = 'P0003';
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
