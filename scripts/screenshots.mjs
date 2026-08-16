#!/usr/bin/env node
/**
 * Regenerates every UI screenshot into Screens/.
 *
 * The images are deliberately NOT in git — binary files do not diff, so each
 * refresh would add a full copy to history forever. Run this instead; the
 * output always matches the current code.
 *
 *   node scripts/screenshots.mjs                     # prototype only
 *   node scripts/screenshots.mjs --app               # + the app on :3000
 *   node scripts/screenshots.mjs --app http://…:3100 # + the app elsewhere
 *
 * Requires Playwright's Chromium:
 *   cd web && npm i -D playwright && npx playwright install chromium
 */

import { mkdir, rm } from "node:fs/promises";
import { existsSync } from "node:fs";
import { fileURLToPath, pathToFileURL } from "node:url";
import { dirname, join, resolve } from "node:path";
import { createRequire } from "node:module";

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const OUT = join(ROOT, "Screens");
const POC = pathToFileURL(join(ROOT, "poc", "index.html")).href;
const PHONE = { width: 430, height: 940 };
const THEMES = /** @type {const} */ (["light", "dark"]);

/* ---------- Playwright can live in a few places; find it or explain. ---------- */

async function loadChromium() {
  const require = createRequire(import.meta.url);
  const candidates = [
    "playwright",
    join(ROOT, "web", "node_modules", "playwright", "index.mjs"),
    join(ROOT, "web", "node_modules", "@playwright", "test", "index.mjs"),
  ];

  for (const c of candidates) {
    try {
      const spec = c.startsWith("/") || /^[A-Za-z]:/.test(c)
        ? (existsSync(c) ? pathToFileURL(c).href : null)
        : require.resolve(c) && c;
      if (!spec) continue;
      const mod = await import(spec);
      if (mod.chromium) return mod.chromium;
    } catch {
      // try the next location
    }
  }

  console.error(
    "\nPlaywright not found.\n\n" +
      "  cd web && npm i -D playwright && npx playwright install chromium\n",
  );
  process.exit(1);
}

/* ---------- helpers ---------- */

const args = process.argv.slice(2);
const appFlag = args.indexOf("--app");
const appUrl =
  appFlag === -1
    ? null
    : (args[appFlag + 1] && !args[appFlag + 1].startsWith("--")
        ? args[appFlag + 1]
        : "http://localhost:3000"
      ).replace(/\/$/, "");

let count = 0;
async function shot(target, file) {
  await target.screenshot({ path: join(OUT, file) });
  count++;
  console.log("  " + file);
}

/**
 * The prototype only writes to localStorage on the first interaction, so a
 * plain load leaves nothing to read back. Clicking a tab settles the state.
 */
async function openPoc(browser, scheme, height = PHONE.height) {
  const page = await browser.newPage({
    viewport: { ...PHONE, height },
    colorScheme: scheme,
    deviceScaleFactor: 2,
  });
  await page.goto(POC);
  await page.evaluate(() => localStorage.clear());
  await page.reload();
  await page.waitForTimeout(400);
  await page.click('[data-tab="home"]');
  await page.waitForTimeout(150);
  return page;
}

async function gotoTab(page, tab) {
  await page.click(`[data-tab="${tab}"]`);
  await page.waitForTimeout(350);
}

/** Jumps the prototype's calendar to the first event of a given kind. */
async function openEventOfKind(page, kind) {
  await page.evaluate((k) => {
    const st = JSON.parse(localStorage.getItem("family-poc-v2"));
    const ev = st.events.find((e) => e.kind === k);
    if (!ev) return;
    const d = new Date(ev.startsAt);
    const pad = (n) => String(n).padStart(2, "0");
    st.selectedDay = `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
    st.calMonth = `${d.getFullYear()}-${d.getMonth()}`;
    st.tab = "calendar";
    localStorage.setItem("family-poc-v2", JSON.stringify(st));
  }, kind);
  await page.reload();
  await page.waitForTimeout(400);
}

/* ---------- capture passes ---------- */

async function capturePrototype(browser) {
  console.log("\nprototype/");

  const TABS = [
    ["home", "01-home"],
    ["calendar", "02-calendar"],
    ["tasks", "03-tasks"],
    ["shopping", "04-shopping"],
    ["inventory", "05-inventory"],
  ];

  for (const scheme of THEMES) {
    const page = await openPoc(browser, scheme);
    for (const [tab, name] of TABS) {
      await gotoTab(page, tab);
      await shot(page, `prototype/${name}-${scheme}.png`);
    }
    await page.close();
  }

  // Event cards, cropped to the card: the two reminder rules side by side.
  const page = await openPoc(browser, "light", 1200);
  for (const [kind, name] of [
    ["appointment", "06-reminder-appointment"],
    ["birthday", "07-reminder-birthday"],
    ["holiday", "08-reminder-holiday"],
  ]) {
    await openEventOfKind(page, kind);
    const card = page.locator(".card.appt").first();
    if (await card.count()) await shot(card, `prototype/${name}.png`);
  }
  await page.close();

  // The low-stock rule, caught mid-flow.
  const flow = await openPoc(browser, "light");
  await gotoTab(flow, "inventory");
  const eggs = flow.locator(".inv", { hasText: "ביצים" });
  for (let i = 0; i < 6; i++) {
    await eggs.locator('button[data-d="-1"]').click();
    await flow.waitForTimeout(40);
  }
  await flow.waitForTimeout(250);
  await shot(flow, "prototype/09-lowstock-triggered.png");
  await gotoTab(flow, "shopping");
  await shot(flow, "prototype/10-lowstock-in-list.png");
  await flow.close();
}

/**
 * Captures the running Next.js app.
 *
 * Only pages reachable without a session are attempted. The signed-in
 * screens need real Supabase cookies, which a script cannot mint — open
 * those in a logged-in browser and capture by hand if you need them.
 */
async function captureApp(browser, baseUrl) {
  console.log(`\napp/  (${baseUrl})`);

  const PAGES = [
    ["/login", "01-login"],
    ["/setup", "02-setup"],
  ];

  for (const scheme of THEMES) {
    const page = await browser.newPage({
      viewport: PHONE,
      colorScheme: scheme,
      deviceScaleFactor: 2,
    });

    for (const [path, name] of PAGES) {
      try {
        const res = await page.goto(baseUrl + path, { timeout: 8000 });
        await page.waitForTimeout(400);
        if (!res || res.status() >= 400) {
          console.log(`  skipped ${path} (status ${res?.status() ?? "none"})`);
          continue;
        }
        await shot(page, `app/${name}-${scheme}.png`);
      } catch {
        console.log(`  skipped ${path} (server not reachable)`);
      }
    }
    await page.close();
  }

  console.log(
    "  note: signed-in screens need a real session and are not captured here",
  );
}

/* ---------- main ---------- */

const chromium = await loadChromium();

await rm(OUT, { recursive: true, force: true });
await mkdir(join(OUT, "prototype"), { recursive: true });
if (appUrl) await mkdir(join(OUT, "app"), { recursive: true });

const browser = await chromium.launch();
try {
  await capturePrototype(browser);
  if (appUrl) await captureApp(browser, appUrl);
} finally {
  await browser.close();
}

console.log(`\n${count} screenshots written to Screens/\n`);
