-- ============================================================
--  נתוני בדיקה
--
--  להרצה *אחרי* שנכנסתם לאפליקציה והקמתם משק בית דרך מסך
--  ההרשמה. הסקריפט מוסיף את שאר בני המשפחה, מלאי, ורשימת קניות,
--  כדי שיהיה מה לבדוק בלי להזין הכול ביד.
--
--  הוא מזהה את משק הבית לבד, בהנחה שיש בדיוק אחד.
--
--  השעות מקובעות ל-Asia/Jerusalem במפורש: חותמת נאיבית שנכנסת
--  לעמודת timestamptz מתפרשת לפי אזור הזמן של החיבור, וב-SQL Editor
--  של Supabase זה UTC — מה שהיה מזיז כל שעה בשלוש שעות.
-- ============================================================

do $$
declare
  hh uuid;
  m_stas uuid;
  m_yonatan uuid;
  m_shani uuid;
  m_first uuid;
  ev uuid;
begin
  select id into hh from households order by created_at limit 1;
  if hh is null then
    raise exception 'לא נמצא משק בית. הקימו אחד דרך מסך ההרשמה קודם.';
  end if;

  select id into m_first from members where household_id = hh order by created_at limit 1;

  -- ---------- בני משפחה ----------
  insert into members (household_id, display_name, role, color, birth_date)
       values (hh, 'סטס', 'parent', '#BFD8EC', '1975-06-09')
    returning id into m_stas;

  insert into members (household_id, display_name, role, color, birth_date)
       values (hh, 'יונתן', 'child', '#C4E0BE', '2011-04-18')
    returning id into m_yonatan;

  insert into members (household_id, display_name, role, color, birth_date)
       values (hh, 'שני', 'child', '#CE9FDF', '2016-02-11')
    returning id into m_shani;

  -- ---------- מלאי ----------
  -- חלב וקפה מתחת לסף בכוונה: הטריגר אמור לפתוח להם פריטי קניות מיד.
  insert into inventory_items
    (household_id, name, category, storage_location, unit, quantity, min_quantity)
  values
    (hh, 'חלב',         'מוצרי חלב', 'מקרר',   'ליטר',  1,  2),
    (hh, 'ביצים',        'מוצרי חלב', 'מקרר',   'יח׳',   12, 6),
    (hh, 'לחם',          'מאפים',     'מזווה',  'כיכר',  2,  1),
    (hh, 'קפה',          'יבשים',     'מזווה',  'חבילה', 0,  1),
    (hh, 'שמן זית',      'יבשים',     'מזווה',  'בקבוק', 2,  1),
    (hh, 'נייר טואלט',   'ניקיון',    'אמבטיה', 'גליל',  8,  4),
    (hh, 'אבקת כביסה',   'ניקיון',    'מכבסה',  'חבילה', 2,  1),
    (hh, 'אקמול לילדים', 'תרופות',    'ארונית', 'בקבוק', 1,  1);

  -- ---------- קניות שהוזנו ידנית ----------
  insert into shopping_items (household_id, name, quantity, unit, category, added_by)
  values
    (hh, 'עגבניות', 1, 'ק״ג', 'ירקות ופירות', m_first),
    (hh, 'יוגורט',  6, 'יח׳',  'מוצרי חלב',    m_first);

  -- ---------- תור רפואי מחר ----------
  insert into events (household_id, kind, title, location, starts_at, created_by)
       values (hh, 'appointment', 'רופא שיניים — שני',
               'מרפאת שיניים, רחוב הרצל 12',
               ((current_date + 1)::timestamp + time '16:30') at time zone 'Asia/Jerusalem', m_first)
    returning id into ev;
  insert into event_participants (event_id, member_id) values (ev, m_shani);
  insert into appointments
    (event_id, patient_id, doctor_name, specialty, clinic, hmo, phone, prep_notes)
  values
    (ev, m_shani, 'ד״ר לוי', 'רופא שיניים', 'מכבידנט', 'מכבי',
     '03-1234567', 'לצחצח שיניים לפני, להביא טופס 17');

  -- ---------- משימות ----------
  -- אחת באיחור בכוונה, כדי לראות את הסימון האדום.
  insert into tasks (household_id, title, assignee_id, due_at, priority, status, created_by)
  values
    (hh, 'להוציא את הזבל',        m_yonatan,
     ((current_date)::timestamp     + time '20:00') at time zone 'Asia/Jerusalem', 3, 'open',  m_first),
    (hh, 'לתאם טיפול לרכב',        m_stas,
     ((current_date - 1)::timestamp + time '10:00') at time zone 'Asia/Jerusalem', 1, 'open',  m_first),
    (hh, 'לקנות מתנה ליום הולדת',  m_first,
     ((current_date + 2)::timestamp + time '12:00') at time zone 'Asia/Jerusalem', 2, 'open',  m_first),
    (hh, 'לסדר את החדר',           m_shani,
     ((current_date)::timestamp     + time '18:00') at time zone 'Asia/Jerusalem', 3, 'open',  m_first),
    (hh, 'לשלם ארנונה',            m_first,
     ((current_date + 5)::timestamp + time '12:00') at time zone 'Asia/Jerusalem', 2, 'open',  m_first),
    (hh, 'להחזיר ספרים לספרייה',   m_yonatan,
     ((current_date - 2)::timestamp + time '16:00') at time zone 'Asia/Jerusalem', 2, 'done',  m_first);

  -- ---------- אירוע שבועי חוזר ----------
  insert into events (household_id, kind, title, location, starts_at, rrule, created_by)
       values (hh, 'general', 'אימון כדורסל — יונתן', 'אולם הספורט',
               ((current_date + 2)::timestamp + time '17:00') at time zone 'Asia/Jerusalem', 'FREQ=WEEKLY', m_first)
    returning id into ev;
  insert into event_participants (event_id, member_id) values (ev, m_yonatan);

  -- ---------- אסיפת הורים ----------
  insert into events (household_id, kind, title, location, starts_at, created_by)
       values (hh, 'school', 'אסיפת הורים', 'בית הספר',
               ((current_date + 4)::timestamp + time '19:00') at time zone 'Asia/Jerusalem', m_first)
    returning id into ev;
  insert into event_participants (event_id, member_id) values (ev, m_shani);

  raise notice 'נזרעו נתוני בדיקה. ימי הולדת ותזכורות נוצרו על ידי הטריגרים.';
end
$$;
