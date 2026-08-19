/**
 * שההתראה באמת מגיעה — לא שהיא נשלחה.
 *
 * "נשלחה בהצלחה" אומר רק ששירות הדחיפה קיבל אותה. כל מה שאחרי זה —
 * המסירה למכשיר, ההתעוררות של ה-service worker, וההצגה בפועל — היה
 * בלתי נראה מהשרת, וכל כשל בו נראה בדיוק אותו דבר: המסך אומר שההתראה
 * יצאה והטלפון לא מראה כלום. במצב הזה אין למשתמש צעד הבא, כי כל
 * ההסברים שנותרו מתיישבים באותה מידה עם מה שהוא רואה.
 *
 * הבדיקה הזו מוסרת דחיפה אמיתית ל-worker האמיתי, בדפדפן אמיתי, דרך
 * CDP — בדיוק כפי ששירות הדחיפה היה עושה. היא מאמתת את שני החצאים
 * בנפרד: שההתראה מוצגת, ושהדף מקבל הודעה שהיא הגיעה. השני הוא מה
 * שמאפשר למסך להבחין בין "המכשיר קיבל וההרשאה כבויה" לבין "לא הגיע".
 *
 * שימוש:  node docs/tests/push-delivery.mjs
 * דורש playwright-core וכרומיום מקומי; מדלג בלעדיהם.
 */

import { createServer } from "node:http";
import { readFile } from "node:fs/promises";
import { existsSync } from "node:fs";
import { fileURLToPath, pathToFileURL } from "node:url";
import { dirname, join } from "node:path";

const here = dirname(fileURLToPath(import.meta.url));
const SW = join(here, "../../web/public/sw.js");

const CHROMIUM = [
  "/opt/pw-browsers/chromium-1194/chrome-linux/chrome",
  "/opt/pw-browsers/chromium/chrome-linux/chrome",
  process.env.CHROMIUM_PATH,
].find((p) => p && existsSync(p));

/**
 * playwright-core is not a dependency of the app, and should not become
 * one: it exists for this file alone. A bare import resolves from this
 * script's own directory, which is never where it is installed, so the
 * places it might actually be are named here — including whatever
 * PLAYWRIGHT_CORE points at, for a machine that keeps it somewhere else.
 */
async function loadPlaywright() {
  const candidates = [
    process.env.PLAYWRIGHT_CORE,
    join(here, "../../web/node_modules/playwright-core/index.mjs"),
    join(process.cwd(), "node_modules/playwright-core/index.mjs"),
  ].filter(Boolean);

  for (const path of candidates) {
    if (!existsSync(path)) continue;
    try {
      return (await import(pathToFileURL(path).href)).chromium;
    } catch {
      /* try the next one */
    }
  }
  try {
    return (await import("playwright-core")).chromium;
  } catch {
    return null;
  }
}

const chromium = await loadPlaywright();
if (!chromium) {
  console.log("SKIP  playwright-core לא מותקן");
  console.log("      npm i -D playwright-core, או PLAYWRIGHT_CORE=<נתיב>");
  process.exit(0);
}
if (!CHROMIUM) {
  console.log("SKIP  לא נמצא כרומיום מקומי");
  process.exit(0);
}


const PAGE = `<!doctype html><meta charset="utf-8"><title>push probe</title>
<script>
window.__heard = [];
navigator.serviceWorker.addEventListener("message", (e) => {
  if (e.data && e.data.type === "push-received") window.__heard.push(e.data);
});
window.__ready = navigator.serviceWorker.register("/sw.js")
  .then(() => navigator.serviceWorker.ready);
</script>`;

// The worker under test is the one the app ships, read from disk — not a
// copy that can drift away from it.
const swSource = await readFile(SW, "utf8");

const server = createServer((req, res) => {
  if (req.url === "/sw.js") {
    res.writeHead(200, { "content-type": "text/javascript" });
    res.end(swSource);
  } else {
    res.writeHead(200, { "content-type": "text/html; charset=utf-8" });
    res.end(PAGE);
  }
});
// Port 0: the operating system hands out one that is free. A fixed port
// makes the test fail when anything else happens to hold it, and worse,
// can make it pass by answering from a server somebody else started.
await new Promise((r) => server.listen(0, "127.0.0.1", r));
const ORIGIN = `http://localhost:${server.address().port}`;

let bad = 0;
const T = (name, cond) => {
  console.log(`${cond ? "PASS" : "FAIL"}  ${name}`);
  if (!cond) bad++;
};

const browser = await chromium.launch({
  executablePath: CHROMIUM,
  args: ["--no-sandbox"],
});

try {
  const context = await browser.newContext();
  await context.grantPermissions(["notifications"], { origin: ORIGIN });
  const page = await context.newPage();
  await page.goto(`${ORIGIN}/`);
  await page.evaluate(() => window.__ready);

  const cdp = await context.newCDPSession(page);
  let registrationId = null;
  cdp.on("ServiceWorker.workerRegistrationUpdated", ({ registrations }) => {
    for (const r of registrations) {
      if (r.scopeURL.startsWith(ORIGIN)) registrationId = r.registrationId;
    }
  });
  await cdp.send("ServiceWorker.enable");
  for (let i = 0; i < 40 && !registrationId; i++) {
    await new Promise((r) => setTimeout(r, 100));
  }
  T("ה-service worker נרשם", Boolean(registrationId));

  const deliver = (data) =>
    cdp.send("ServiceWorker.deliverPushMessage", { origin: ORIGIN, registrationId, data });
  const waitHeard = () =>
    page
      .waitForFunction(() => window.__heard.length > 0, null, { timeout: 8000 })
      .catch(() => {});

  await deliver(JSON.stringify({ title: "הבית שלנו", body: "בדיקה", url: "/home" }));
  await waitHeard();

  const heard = await page.evaluate(() => window.__heard);
  T("הדף מקבל הודעה שהדחיפה הגיעה", heard.length === 1);
  T("וההודעה נושאת את הכותרת", heard[0]?.title === "הבית שלנו");

  const shown = await page.evaluate(async () => {
    const reg = await navigator.serviceWorker.ready;
    return (await reg.getNotifications()).map((n) => ({ title: n.title, body: n.body }));
  });
  T("והתראה באמת מוצגת", shown.length === 1);
  T("עם הכותרת מהמטען", shown[0]?.title === "הבית שלנו");
  T("ועם הגוף", shown[0]?.body === "בדיקה");

  // דחיפה בלי מטען עדיין חייבת להציג משהו, אחרת אייפון שם במקומה
  // הודעה גנרית משלו.
  await page.evaluate(() => {
    window.__heard = [];
  });
  await deliver("");
  await waitHeard();
  T("גם דחיפה ריקה מדווחת", (await page.evaluate(() => window.__heard)).length === 1);
} finally {
  await browser.close();
  server.close();
}

console.log(bad ? `\n${bad} נכשלו` : "\nההתראה מגיעה, ומוצגת");
process.exit(bad ? 1 : 0);
