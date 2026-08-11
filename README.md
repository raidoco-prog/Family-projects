# Family-projects

Repo for family projects and apps

## אפליקציית ניהול משפחתית

יומן משותף, משימות עם אחראי, תורים לרופאים, רשימת קניות ומלאי הבית —
כאשר המלאי מזין את רשימת הקניות אוטומטית.

| קובץ | תוכן |
|---|---|
| [`web/`](web/) | **קוד הייצור.** Next.js + Supabase. שלב 0 הושלם |
| [`poc/index.html`](poc/index.html) | **אב טיפוס עובד.** קובץ בודד, בלי התקנה — פותחים בדפדפן |
| [`docs/REQUIREMENTS.md`](docs/REQUIREMENTS.md) | מסמך דרישות: מה המערכת עושה וקריטריוני קבלה |
| [`docs/PLAN.md`](docs/PLAN.md) | ארכיטקטורה, מודל נתונים, חלוקה לשלבים ומלכודות |
| [`docs/schema.sql`](docs/schema.sql) | סכימת Postgres מלאה עם טריגרים ו-RLS, מוכנה להרצה |
| [`docs/DEPLOYMENT.md`](docs/DEPLOYMENT.md) | השוואת אפשרויות דיפלוימנט והעלאה צעד-אחר-צעד |

### הרצת אב הטיפוס

פשוט לפתוח את `poc/index.html` בדפדפן — אין תלויות ואין שלב בנייה.
הנתונים נשמרים ב-`localStorage` של המכשיר; כפתור «איפוס» במסך הבית מחזיר
את נתוני ההדגמה.

**סטאק מוצע:** Next.js + TypeScript + Tailwind (PWA) מעל Supabase,
בדיפלוימנט ל-Vercel. עלות: 0 ₪ לחודש.
