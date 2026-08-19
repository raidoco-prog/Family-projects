#!/bin/bash
# ============================================================
#  שהאפליקציה נפתחת כאפליקציה
#
#  התגים שקובעים אם האייפון פותח את הסמל במסך הבית כאפליקציה או
#  כלשונית ספארי. זה נשבר פעם אחת בלי שאיש שינה שורה: Next מייצר
#  את `appleWebApp.capable` בתור `mobile-web-app-capable` בלבד,
#  ואייפון קורא דווקא את השם עם הקידומת apple. משדרגים גרסה,
#  והאפליקציה מפסיקה להיות אפליקציה.
#
#  זה לא קוסמטי: אייפון מציג התראות רק לאפליקציה שנפתחה מהסמל.
#  כלומר אותה תקלה בדיוק גם מפסיקה את ההתראות, בשקט — הדחיפה
#  נשלחת, אפל מקבלת אותה, ושום דבר לא מופיע.
#
#  שימוש:  bash docs/tests/pwa-shell.sh
# ============================================================
set -u
cd "$(dirname "$0")/../../web" || exit 1

PORT=${PORT:-3141}
while curl -sf -o /dev/null "http://localhost:$PORT/" 2>/dev/null; do
  echo "יציאה $PORT תפוסה — עוברים ל-$((PORT + 1))"
  PORT=$((PORT + 1))
done
fail=0
T() { if [ "$2" = "$3" ]; then echo "PASS  $1"; else echo "FAIL  $1 — expected [$2] got [$3]"; fail=1; fi; }

if [ ! -d .next ]; then
  echo "בונים קודם…"
  npx next build >/dev/null 2>&1 || { echo "הבנייה נכשלה"; exit 1; }
fi

NEXT_PUBLIC_SUPABASE_URL=https://example.supabase.co \
NEXT_PUBLIC_SUPABASE_ANON_KEY=test \
  npx next start -p "$PORT" >/tmp/pwa-shell.log 2>&1 &
server=$!
trap 'kill $server 2>/dev/null' EXIT

for _ in $(seq 1 30); do
  curl -sf "http://localhost:$PORT/login" >/dev/null 2>&1 && break
  sleep 1
done

HTML=$(curl -s "http://localhost:$PORT/login")

echo "=== התגים שהאייפון קורא ==="
has() { echo "$HTML" | grep -qF "$1" && echo yes || echo no; }

T "apple-mobile-web-app-capable — בלעדיו זו לשונית ספארי" \
  yes "$(has 'name="apple-mobile-web-app-capable" content="yes"')"
T "mobile-web-app-capable — התקן, לאנדרואיד" \
  yes "$(has 'name="mobile-web-app-capable" content="yes"')"
T "הכותרת של הסמל" yes "$(has 'name="apple-mobile-web-app-title"')"
T "קישור למניפסט"  yes "$(has 'rel="manifest"')"

echo
echo "=== המניפסט ==="
M=$(curl -s "http://localhost:$PORT/manifest.webmanifest")
mhas() { echo "$M" | tr -d ' \n' | grep -qF "$1" && echo yes || echo no; }

T "display: standalone" yes "$(mhas '"display":"standalone"')"
T "scope פותח את כל האפליקציה" yes "$(mhas '"scope":"/"')"
T "start_url הוא מסך הבית"     yes "$(mhas '"start_url":"/home"')"

echo
echo "=== ה-service worker מגיש ומטפל בדחיפה ==="
SW=$(curl -s "http://localhost:$PORT/sw.js")
swhas() { echo "$SW" | grep -qF "$1" && echo yes || echo no; }

T "sw.js מוגש"                    yes "$(swhas 'addEventListener')"
T "מאזין לאירוע push"             yes "$(swhas '"push"')"
T "ומציג התראה בפועל"             yes "$(swhas 'showNotification')"
T "ומטפל בלחיצה עליה"             yes "$(swhas '"notificationclick"')"

echo
if [ $fail -eq 0 ]; then echo "האפליקציה נפתחת כאפליקציה"; else echo "FAILURES"; fi
exit $fail
