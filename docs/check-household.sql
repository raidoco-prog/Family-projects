-- ============================================================
--  מי נמצא באיזה משק בית
--
--  להדבקה ב-SQL Editor של Supabase. קריאה בלבד — לא משנה כלום.
--
--  התסמין שבגללו זה נכתב: אחד מוסיף פריט לרשימת הקניות והשני לא
--  רואה אותו. ההרשאות עצמן סימטריות ונבדקו — שני בני משפחה באותו
--  משק בית רואים את אותם פריטים, תמיד. לכן «הוא לא רואה» פירושו
--  כמעט תמיד שהוא פשוט לא נמצא באותו משק בית.
--
--  זה קורה בשקט: בהרשמה, מי שלא נכנס דרך קישור הזמנה תקין מקבל
--  משק בית משלו. ובמסך המשפחה שום דבר לא נראה חריג — שורת «סטס»
--  שנוצרה ידנית ממשיכה להופיע שם, רק שהיא לא מקושרת לחשבון שלו.
-- ============================================================

-- ------------------------------------------------------------
--  1. משקי הבית שקיימים, וכמה חשבונות מחוברים בכל אחד
--
--     יותר משורה אחת כאן הוא כבר הממצא.
-- ------------------------------------------------------------
select
  h.name                                    as "משק בית",
  h.id                                      as "מזהה",
  count(m.id)                               as "שורות בני משפחה",
  count(m.user_id)                          as "מתוכן מחוברות לחשבון",
  to_char(h.created_at at time zone 'Asia/Jerusalem', 'DD/MM/YYYY HH24:MI') as "נוצר"
from households h
left join members m on m.household_id = h.id
group by h.id, h.name, h.created_at
order by h.created_at;

-- ------------------------------------------------------------
--  2. כל בן משפחה, ולאיזה חשבון הוא מקושר
--
--     «— לא מקושר» היא שורה שנוצרה ידנית ואיש עדיין לא נכנס דרכה.
--     זו לא בהכרח תקלה: כך נראה ילד שטרם הצטרף. זו כן תקלה אם
--     אותו אדם כן נכנס לאפליקציה — כי אז החשבון שלו נמצא במקום אחר.
-- ------------------------------------------------------------
select
  h.name                              as "משק בית",
  m.display_name                      as "שם",
  m.role                              as "תפקיד",
  coalesce(u.email, '— לא מקושר')     as "חשבון",
  to_char(m.created_at at time zone 'Asia/Jerusalem', 'DD/MM HH24:MI') as "נוצר"
from members m
join households h on h.id = m.household_id
left join auth.users u on u.id = m.user_id
order by h.created_at, m.created_at;

-- ------------------------------------------------------------
--  3. השורה התחתונה
-- ------------------------------------------------------------
select
  case
    when (select count(*) from households) > 1
      then 'יש יותר ממשק בית אחד. זו הסיבה שפריטים לא נראים — ' ||
           'כל אחד כותב לבית שלו. ראו את טבלה 2 כדי לזהות מי נמצא היכן.'
    when (select count(*) from members where user_id is not null) < 2
      then 'רק חשבון אחד מחובר. השאר עדיין לא נכנסו דרך קישור הזמנה.'
    else 'משק בית אחד, וכל המחוברים בתוכו. הבעיה אינה כאן.'
  end as "מסקנה";

-- ------------------------------------------------------------
--  לתיקון, אם אכן יש שני משקי בית
--
--  להעביר חשבון למשק הבית הנכון, מבלי לאבד את מה שהוא כתב.
--  להריץ רק אחרי שראיתם בטבלה 2 מי צריך לעבור, ועם המיילים
--  האמיתיים במקום הדוגמאות. מוחק את משק הבית המיותם בסוף.
--
--    begin;
--
--    -- הפריטים שנכתבו למשק הבית הלא נכון עוברים איתו
--    update shopping_items  set household_id = (select household_id from members m join auth.users u on u.id=m.user_id where u.email='<המייל שלך>')
--      where household_id = (select household_id from members m join auth.users u on u.id=m.user_id where u.email='<המייל שלו>');
--    update inventory_items set household_id = (select household_id from members m join auth.users u on u.id=m.user_id where u.email='<המייל שלך>')
--      where household_id = (select household_id from members m join auth.users u on u.id=m.user_id where u.email='<המייל שלו>');
--    update tasks           set household_id = (select household_id from members m join auth.users u on u.id=m.user_id where u.email='<המייל שלך>')
--      where household_id = (select household_id from members m join auth.users u on u.id=m.user_id where u.email='<המייל שלו>');
--    update events          set household_id = (select household_id from members m join auth.users u on u.id=m.user_id where u.email='<המייל שלך>')
--      where household_id = (select household_id from members m join auth.users u on u.id=m.user_id where u.email='<המייל שלו>');
--
--    -- ואז מקשרים את החשבון שלו לשורה שכבר קיימת אצלך, ומוחקים
--    -- את השורה הכפולה ואת משק הבית הריק
--    ...
--
--  אם זה המצב — עדיף לומר לי, ואשלח את הפקודות המדויקות לפי מה
--  שהטבלאות למעלה יראו. העברה ידנית של מזהים היא בדיוק המקום שבו
--  קל למחוק את הדברים הנכונים.
-- ------------------------------------------------------------
