/**
 * שהמנוי לדחיפה יציב.
 *
 * הבדיקה הזו נכתבה אחרי שהאפליקציה נתקעה. `currentSubscriptionForKey`
 * השווה את המפתח שהמנוי נוצר איתו למפתח הנוכחי, וקרא היעדר מידע
 * כאי-התאמה. לא כל דפדפן ממלא את `options.applicationServerKey`, ולכן
 * בדפדפנים כאלה כל קריאה זרקה מנוי תקין ויצרה אחד חדש — עם endpoint
 * חדש שהשרת לא מכיר. במסך ההגדרות, שבו endpoint לא מוכר גורם לשמירה
 * ולרענון, זה נסגר ללולאה שלא נרגעת: הדף נטען מחדש בלי סוף והאפליקציה
 * הפסיקה להגיב ללחיצות.
 *
 * מה שנבדק כאן הוא התכונה שנשברה: קריאות חוזרות חייבות להחזיר את אותו
 * endpoint. אי-התאמה מוכחת עדיין מחליפה את המנוי — זה מה שמונע רישום
 * שאי אפשר לשלוח אליו.
 *
 * שימוש:  node docs/tests/push-subscription.mjs
 */

import { execFileSync } from "node:child_process";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";

const here = dirname(fileURLToPath(import.meta.url));
const web = join(here, "../../web");

// הקובץ נבדק כפי שהוא, מתורגם מהמקור — לא כהעתק שיכול להתיישן.
const out = mkdtempSync(join(tmpdir(), "push-test-"));
try {
  execFileSync(
    "npx",
    ["tsc", "src/lib/push.ts", "--outDir", out, "--module", "esnext",
     "--target", "es2022", "--moduleResolution", "bundler",
     "--skipLibCheck", "--lib", "es2022,dom"],
    { cwd: web, stdio: "pipe" },
  );
} catch (err) {
  console.log("SKIP  לא ניתן לתרגם את push.ts —", err.message.split("\n")[0]);
  process.exit(0);
}

const { currentSubscriptionForKey } = await import(
  pathToFileURL(join(out, "push.js")).href
);

const setNavigator = (v) =>
  Object.defineProperty(globalThis, "navigator", { configurable: true, value: v });
globalThis.atob = (s) => Buffer.from(s, "base64").toString("binary");

const KEY_A =
  "BEl62iUYgUivxIkv69yViEuiBIa-Ib9-SkvMeAtA3LFgDzkrxZJjSgSnfckjBJuBkr3qBUYIHBQFLXYp5Nksh8U";
const KEY_B =
  "BAcMH0LcbUrhpMLNlkVeI3-6yjnLXCbsPZOaGLlqSPB7-oR-yjxHOZ_YEgPtVBnZMLTFC-8lNJUKtY3vBnpLLGM";

const toBytes = (b64) => {
  const pad = "=".repeat((4 - (b64.length % 4)) % 4);
  const raw = atob((b64 + pad).replace(/-/g, "+").replace(/_/g, "/"));
  return Uint8Array.from([...raw].map((c) => c.charCodeAt(0)));
};

/** `reports:false` הוא דפדפן שאינו חושף באיזה מפתח המנוי נוצר. */
function device({ subscribedWith, reports = true }) {
  let n = 0;
  const make = (endpoint, key) => ({
    endpoint,
    options: { applicationServerKey: reports && key ? toBytes(key).buffer : undefined },
    async unsubscribe() {
      return true;
    },
    toJSON: () => ({ endpoint, keys: { p256dh: "p", auth: "a" } }),
  });

  let current = subscribedWith ? make("https://push.example/old", subscribedWith) : null;
  const reg = {
    pushManager: {
      async getSubscription() {
        return current;
      },
      async subscribe() {
        n += 1;
        current = make(`https://push.example/new-${n}`, KEY_A);
        return current;
      },
    },
  };
  setNavigator({ userAgent: "t", serviceWorker: { getRegistration: async () => reg } });
  return { subscribes: () => n };
}

let bad = 0;
const T = (name, cond) => {
  console.log(`${cond ? "PASS" : "FAIL"}  ${name}`);
  if (!cond) bad++;
};

try {
  // ---- הרגרסיה עצמה ----
  {
    const d = device({ subscribedWith: KEY_A, reports: false });
    const first = await currentSubscriptionForKey(KEY_A);
    T("מפתח שלא דווח — המנוי נשאר", first.subscription?.endpoint === "https://push.example/old");
    T("שום דבר לא הוחלף", first.replaced === null);
    T("ולא נוצר מנוי חדש", d.subscribes() === 0);

    // כמו מסך שנטען מחדש. כל סטייה כאן היא הלולאה.
    const seen = new Set();
    for (let i = 0; i < 5; i++) {
      seen.add((await currentSubscriptionForKey(KEY_A)).subscription?.endpoint);
    }
    T("קריאות חוזרות יציבות", seen.size === 1);
    T("וגם אחרי חמש — בלי הרשמה מחדש", d.subscribes() === 0);
  }

  // ---- אי-התאמה מוכחת עדיין מטופלת ----
  {
    const d = device({ subscribedWith: KEY_B, reports: true });
    const r = await currentSubscriptionForKey(KEY_A);
    T("אי-התאמה מוכחת מוחלפת", r.replaced === "https://push.example/old");
    T("ונוצר מנוי חדש", r.subscription?.endpoint === "https://push.example/new-1");
    T("בדיוק פעם אחת", d.subscribes() === 1);
  }

  // ---- מפתח תואם שדווח ----
  {
    const d = device({ subscribedWith: KEY_A, reports: true });
    const r = await currentSubscriptionForKey(KEY_A);
    T("מפתח תואם נשאר", r.subscription?.endpoint === "https://push.example/old");
    T("בלי הרשמה מחדש", d.subscribes() === 0);
  }
} finally {
  rmSync(out, { recursive: true, force: true });
}

console.log(bad ? `\n${bad} נכשלו` : "\nהמנוי יציב");
process.exit(bad ? 1 : 0);
