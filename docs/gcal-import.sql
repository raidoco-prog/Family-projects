-- ============================================================
--  ייבוא יומן גוגל של מאשה אל האפליקציה
--
--  להרצה ב-SQL Editor של Supabase, אחרי שהוקם משק הבית ונוספו
--  בני המשפחה. אפשר להריץ שוב ושוב: כל אירוע נושא מפתח יציב
--  מגוגל, והרצה חוזרת מעדכנת את השורה הקיימת במקום לשכפל.
--
--  הטווח: 17.08.2026 עד סוף 2026, מהיומן הראשי (raido.co@gmail.com).
--  היומן «למשפחה» ריק ולכן לא יובא ממנו דבר.
--
--  אירועים חוזרים בגוגל מוחזרים כרשימת מופעים — «יונתן מתמטיקה»
--  לבדו הופיע 20 פעם. כאן הם מכווצים לשורה אחת עם rrule, שזה
--  המודל של האפליקציה.
-- ============================================================

-- ---------- 0. מפתח חיצוני ----------
-- עמודה אחת שהופכת את הייבוא לחזרתי. NULL אינו מתנגש עם NULL
-- בפוסטגרס, ולכן אירועים שנוצרו ידנית באפליקציה אינם מושפעים.
alter table events add column if not exists external_key text;
create unique index if not exists events_household_external_key
  on events (household_id, external_key);


-- ============================================================
--  1. אירועים משפחתיים
-- ============================================================
insert into events (household_id, created_by, external_key, kind, title,
                    starts_at, ends_at, all_day, location, rrule)
select
  (select id from households),
  (select id from members where role = 'parent' order by created_at limit 1),
  v.key, v.kind::event_kind, v.title,
  v.starts::timestamp at time zone 'Asia/Jerusalem',
  v.ends::timestamp   at time zone 'Asia/Jerusalem',
  v.all_day, v.loc, v.rrule
from (values
  -- שיעור שבועי. בגוגל זה 20 מופעים נפרדים; כאן שורה אחת.
  ('gcal:2voanm3qgrbng0dulkkv70tam4', 'school', 'יונתן מתמטיקה',
   '2026-08-17 17:00', '2026-08-17 18:30', false, null, 'FREQ=WEEKLY'),

  ('gcal:8posnr3mfintndqdnqsh84ek48', 'general', 'לירון ארבל',
   '2026-08-25 08:30', '2026-08-25 13:00', false, null, null),

  ('gcal:_6l136c1o8p23eba3711k2b9k', 'general', 'יום נישואין',
   '2026-09-07 20:30', '2026-09-07 21:30', false, null, 'FREQ=YEARLY'),

  -- הנסיעה ללונדון
  ('gcal:0k8pqsfq18ue2o3eimdmb4hdlo', 'general', 'טיסה ללונדון (LY 317)',
   '2026-09-17 17:00', '2026-09-17 22:20', false, 'נמל התעופה בן גוריון', null),
  ('gcal:s6crlsm1jtrmk4kkpdmrcr7oj8', 'general', 'לינה בלונדון — Numa Bloomsbury',
   '2026-09-17 00:00', '2026-09-23 00:00', true,
   '11-13 Bayley Street, Bedford Square, Camden, London, WC1B 3HD', null),
  ('gcal:h8jdj21r1tmod17bcbgjlgntck', 'general', 'טיסה חזרה לתל אביב (LY 316)',
   '2026-09-22 17:15', '2026-09-22 22:00', false, 'London Heathrow', null),

  -- ימי הולדת. כולם שנתיים, וכולם מקבלים תזכורת אחת ב-10:30 ביום עצמו.
  ('gcal:_6kokcchm69342b9g6533ab9k890jiba26523gba56d0j2ga484o4adpg64',
   'birthday', 'יום הולדת — אמא של סטס',
   '2026-10-24 19:00', '2026-10-24 20:00', false, null, 'FREQ=YEARLY'),
  ('gcal:rv4pca4ru6plk0sk2jqg1i1ilc', 'birthday', 'יום הולדת ליעל כפרות',
   '2026-10-27 00:00', null, true, null, 'FREQ=YEARLY'),
  ('gcal:_752j8ha18cojeb9h74r4cb9k85246b9p6ooj2b9i88sk4e23650jaga574',
   'birthday', 'יום הולדת — בוריס',
   '2026-11-13 18:00', '2026-11-13 19:00', false, null, 'FREQ=YEARLY'),
  ('gcal:1vjo17hqe3gvakm87op7p1nko8', 'birthday', 'יום הולדת — יניר',
   '2026-11-21 11:00', '2026-11-21 12:00', false, null, 'FREQ=YEARLY'),
  ('gcal:_6kp3cc2470r36ba360rk6b9k68q44ba16p1k6b9k6h0k8c226523igho60',
   'birthday', 'יום הולדת — דנקה',
   '2026-11-30 18:00', '2026-11-30 19:00', false, null, 'FREQ=YEARLY'),
  ('gcal:_70q36gpl84pk8b9o74rk6b9k691j0b9p6ks42ba6891k4h1k8gpjiea16o',
   'birthday', 'יום הולדת — סבא',
   '2026-12-01 18:00', '2026-12-01 19:00', false, null, 'FREQ=YEARLY'),
  ('gcal:fik8vpq0m9lalml77iubcc0s48', 'birthday', 'שיר יום הולדת',
   '2026-12-03 00:00', null, true, null, 'FREQ=YEARLY'),
  ('gcal:onf6uid4111cq2d377kij1hoik', 'birthday', 'יום הולדת — רומה',
   '2026-12-04 00:00', null, true, null, 'FREQ=YEARLY'),
  ('gcal:02jq8mgksilt362ohbkln3i8ik', 'birthday', 'יום הולדת — ברסיק',
   '2026-12-06 00:00', null, true, null, 'FREQ=YEARLY'),
  ('gcal:t6pjs7net0h97l6136icdkt1q0', 'birthday', 'יום הולדת — ליאון',
   '2026-12-07 00:00', null, true, null, 'FREQ=YEARLY'),
  ('gcal:_6so3cgq18d134b9m60s3ab9k6ooj6b9p6cok6b9o75344h268523cd9g68',
   'birthday', 'יום הולדת לשון',
   '2026-12-27 00:00', null, true, null, 'FREQ=YEARLY')
) as v(key, kind, title, starts, ends, all_day, loc, rrule)
on conflict (household_id, external_key) do update set
  title = excluded.title, kind = excluded.kind,
  starts_at = excluded.starts_at, ends_at = excluded.ends_at,
  all_day = excluded.all_day, location = excluded.location,
  rrule = excluded.rrule, updated_at = now();


-- «יונתן מתמטיקה» הוא השיעור של יונתן. בלי השורה הזאת התזכורת
-- מגיעה רק להורים — הכלל הוא שני ההורים ועוד הילד שהאירוע נוגע לו,
-- והשיוך הזה הוא מה שמביא אותה גם אליו.
insert into event_participants (event_id, member_id)
select e.id, m.id
from events e, members m
where e.external_key = 'gcal:2voanm3qgrbng0dulkkv70tam4'
  and m.display_name = 'יונתן'
on conflict do nothing;


-- ============================================================
--  2. התורים והאירועים האישיים של מאשה
--
--  ⚠️ קרא לפני שאתה מריץ.
--
--  האפליקציה משתפת הכל בין כל בני משק הבית. אין בה הרשאות
--  לפי אדם — זו הייתה החלטה מודעת, כי כל המטרה היא שכולם
--  יראו את אותו לוח. המשמעות כאן היא שיונתן ושני יראו את
--  התורים הרפואיים והטיפולים האישיים שלך.
--
--  אם זה בסדר מבחינתך — הרץ. אם לא — מחק את כל החלק הזה
--  (עד סוף הקובץ) והשאר את החלק הראשון. הכל למעלה נשאר תקף.
-- ============================================================

-- שנה כאן אם רשמת את עצמך בשם אחר באפליקציה.
create temporary table gcal_owner as
  select id from members where display_name = 'מאשה';

-- כפילויות שביומן גוגל, שכאן הן שורה אחת. השורה הזאת מנקה אותן אם
-- הרצת גרסה מוקדמת יותר של הקובץ; על מסד נקי היא לא עושה כלום.
delete from events where external_key in (
  'gcal:ov1vn2l99a09fqu201ncje222o',  -- «רופא שיניים», מוזג לד״ר בן שטיינברג
  'gcal:_74o38cpl711k4ba288o4ab9k'    -- העתק שני של ד״ר ראמי גנאים
);

insert into events (household_id, created_by, external_key, kind, title,
                    starts_at, ends_at, location)
select
  (select id from households), (select id from gcal_owner),
  v.key, v.kind::event_kind, v.title,
  v.starts::timestamp at time zone 'Asia/Jerusalem',
  v.ends::timestamp   at time zone 'Asia/Jerusalem',
  v.loc
from (values
  ('gcal:cv0imuhc52dcb0lt2v62suf6ck', 'appointment',
   'אולטרה-סאונד דופלר — עורקי הצוואר',
   '2026-08-25 09:10', '2026-08-25 09:30',
   'רחוב יפו 216, ירושלים — בניין שערי העיר, קומת קרקע'),
  ('gcal:kel8rs72quit735fbiad4m7t1c', 'appointment', 'תור באסותא',
   '2026-08-25 09:10', '2026-08-25 10:10',
   'בניין שערי העיר, יפו 216, ירושלים — קומת הכניסה'),
  ('gcal:k3q9ls6bdmfhca48rs1a1bboog', 'appointment', 'ד״ר ישי ראובן — מרפאת מרום',
   '2026-09-02 10:50', '2026-09-02 11:50',
   'מרפאת מרום, אמנון ותמר 6 קומה 1, נתניה'),
  -- ביומן יש שתי שורות זהות לתור הזה. כאן הוא אחד.
  ('gcal:_6opj2h1g6coj2ba26cp3cb9k', 'appointment', 'ד״ר ראמי גנאים',
   '2026-09-09 20:00', '2026-09-09 21:00',
   'שד׳ טום לנטוס 60, קניון נעימי כניסה A קומה 1, נתניה'),
  ('gcal:4pvuohct6m90b89778fem0aa7k', 'appointment', 'ד״ר גולן',
   '2026-11-03 16:49', '2026-11-03 17:49', 'בקעת בית נטופה 25, כפר סבא'),
  -- ביומן זה שתי שורות באותה שעה בדיוק — «ד״ר בן שטיינברג» בלי סוג,
  -- ו«רופא שיניים» בלי מקום. שורה אחת שלוקחת מכל אחת את מה שיש בה:
  -- השם והכתובת מהראשונה, וחלון הזמן הארוך יותר מהשנייה.
  ('gcal:_6133ae236p246b9g610jab9k', 'appointment', 'רופא שיניים — ד״ר בן שטיינברג',
   '2026-11-17 17:45', '2026-11-17 18:45',
   'כצנלסון 14, קניון ערים קומה 2, כפר סבא'),

  -- טיפוח. הכותרות היו ברוסית ביומן ותורגמו לעברית.
  ('gcal:vdu20o1m3ocun1qdvq7e7951tg', 'general', 'תספורת וצבע',
   '2026-08-18 17:00', '2026-08-18 18:00', null),
  ('gcal:sabovgvqcq0fcpbcjp0pii21uo', 'general', 'לייזר — ירכיים',
   '2026-08-28 09:00', '2026-08-28 10:00', null),
  ('gcal:_651k2h2174pj2ba46p14ab9k', 'general', 'מספרה',
   '2026-09-30 16:30', '2026-09-30 17:30', null)
) as v(key, kind, title, starts, ends, loc)
on conflict (household_id, external_key) do update set
  title = excluded.title, kind = excluded.kind,
  starts_at = excluded.starts_at, ends_at = excluded.ends_at,
  location = excluded.location, updated_at = now();


-- הפרטים הרפואיים. הנחיות ההכנה הגיעו מתיאורי האירועים בגוגל —
-- זה בדיוק מה שהשדה הזה נועד לו.
insert into appointments (event_id, patient_id, doctor_name, clinic, hmo, prep_notes)
select e.id, (select id from gcal_owner), v.doctor, v.clinic, v.hmo, v.prep
from (values
  ('gcal:kel8rs72quit735fbiad4m7t1c', null, 'אסותא', null,
   'הנחיות ההכנה ופרטי התור המלאים באזור האישי: https://online.assuta.co.il/future-appointments'),
  ('gcal:cv0imuhc52dcb0lt2v62suf6ck', null, 'שערי העיר', null, null),
  ('gcal:k3q9ls6bdmfhca48rs1a1bboog', 'ד״ר ישי ראובן', 'מרפאת מרום', 'מכבי',
   'להביא בדיקות שמיעה או חומר רפואי רלוונטי. מכבי — להגיע עם כרטיס מגנטי. פרטי: ביקור ראשון 1200 ₪, חוזר 800 ₪'),
  ('gcal:_6opj2h1g6coj2ba26cp3cb9k', 'ד״ר ראמי גנאים', null, null, null),
  ('gcal:4pvuohct6m90b89778fem0aa7k', 'ד״ר גולן', null, 'מכבי',
   'ביטול תור: https://landis.maccabi4u.co.il'),
  ('gcal:_6133ae236p246b9g610jab9k', 'ד״ר בן שטיינברג', null, null, null)
) as v(key, doctor, clinic, hmo, prep)
join events e on e.external_key = v.key
on conflict (event_id) do update set
  doctor_name = excluded.doctor_name, clinic = excluded.clinic,
  hmo = excluded.hmo, prep_notes = excluded.prep_notes;


-- ---------- מה נכנס ----------
select kind, count(*) as כמה
from events where external_key like 'gcal:%'
group by kind order by count(*) desc;
