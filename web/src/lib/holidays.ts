import { HebrewCalendar, flags } from "@hebcal/core";

/* ============================================================
   C9 — Jewish and Israeli holidays.

   The dates come from @hebcal/core rather than a typed-in list, which
   is the whole point of the requirement: a list of dates is correct for
   one year and quietly wrong afterwards. A list of *names* never goes
   stale, which is why the curation below is by name where it has to be.

   `il: true` matters. It gives the Israeli scheme — seven days of
   Pesach, one day of Shavuot, and Simchat Torah folded into Shmini
   Atzeret — rather than the diaspora one.
   ============================================================ */

/** A full year of hebcal is ~91 entries. This is what a family plans around. */
export interface Holiday {
  /** Stable across regenerations, so re-syncing updates rather than duplicates. */
  key: string;
  title: string;
  /** Civil date, yyyy-mm-dd. Holidays are all-day by nature. */
  date: string;
  /**
   * Whether it earns the 10:30 notice (R3).
   *
   * Chol hamoed does not: "סוכות ד׳" at half past ten tells nobody
   * anything they did not know on day one, and ten of those a year is
   * exactly the flood R10 exists to prevent.
   */
  remind: boolean;
}

/**
 * Israeli national days. MODERN_HOLIDAY cannot be used as a filter on its
 * own — it also carries Herzl Day, Jabotinsky Day, Hebrew Language Day and
 * Family Day, which nobody arranges their week around.
 */
const NATIONAL = new Set([
  "Yom HaShoah",
  "Yom HaZikaron",
  "Yom HaAtzma'ut",
  "Yom Yerushalayim",
]);

/**
 * Minor holidays worth keeping. Again the flag is too broad: it also
 * carries Shushan Purim, Pesach Sheni and Rosh Hashana LaBehemot.
 */
const MINOR = new Set(["Purim", "Tu BiShvat", "Lag BaOmer"]);

/**
 * Eves worth their own row — the ones where the evening *is* the event:
 * the seder, Kol Nidrei, the new-year meal. Erev Purim and Erev Tish'a
 * B'Av are left out; the day itself is enough.
 */
const EREV = new Set([
  "Erev Rosh Hashana",
  "Erev Yom Kippur",
  "Erev Pesach",
  "Erev Sukkot",
  "Erev Shavuot",
]);

/** Strips the trailing " 5787" hebcal appends to Rosh Hashana. */
function cleanTitle(hebrew: string): string {
  return hebrew.replace(/\s+\d{4}$/, "").trim();
}

export function israeliHolidays(fromYear: number, toYear: number): Holiday[] {
  const out: Holiday[] = [];
  const seen = new Set<string>();

  for (let year = fromYear; year <= toYear; year++) {
    const events = HebrewCalendar.calendar({
      year,
      isHebrewYear: false,
      il: true,
      sedrot: false,
      candlelighting: false,
      omer: false,
      molad: false,
    });

    for (const event of events) {
      const desc = event.getDesc();
      const f = event.getFlags();

      // Chanukah arrives as eight rows, one per candle. One row for the
      // whole festival is what belongs on a family calendar.
      const isChanukahStart = desc === "Chanukah: 1 Candle";

      // An eve is kept only where the evening is the event. Without this,
      // "Erev Tish'a B'Av" rides in on its MAJOR_FAST flag. Chanukah's
      // first night is flagged EREV too, hence the exception.
      if ((f & flags.EREV) !== 0 && !EREV.has(desc) && !isChanukahStart) continue;

      const keep =
        (f & flags.CHAG) !== 0 ||
        (f & flags.CHOL_HAMOED) !== 0 ||
        (f & flags.MAJOR_FAST) !== 0 ||
        NATIONAL.has(desc) ||
        MINOR.has(desc) ||
        EREV.has(desc) ||
        isChanukahStart;

      if (!keep) continue;
      // Everything else Chanukah-shaped is a duplicate of the first night.
      if ((f & flags.CHANUKAH_CANDLES) !== 0 && !isChanukahStart) continue;

      const date = event.getDate().greg();
      const iso = [
        date.getFullYear(),
        String(date.getMonth() + 1).padStart(2, "0"),
        String(date.getDate()).padStart(2, "0"),
      ].join("-");

      const title = isChanukahStart
        ? "חנוכה"
        : cleanTitle(event.render("he-x-NoNikud"));

      // Two entries can land on one day (Yom Kippur is both CHAG and a
      // major fast); the key keeps that to a single row.
      const key = `${iso}:${desc}`;
      if (seen.has(key)) continue;
      seen.add(key);

      out.push({
        key,
        title,
        date: iso,
        remind: (f & flags.CHOL_HAMOED) === 0,
      });
    }
  }

  return out.sort((a, b) => a.date.localeCompare(b.date));
}
