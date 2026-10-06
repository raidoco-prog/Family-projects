/**
 * What every server action returns, and the one message they all share.
 *
 * Both were declared separately in five files, with the Hebrew text
 * written out each time. The copies had already started to pull apart:
 * inventory had no declaration of its own and reached across to
 * shopping's, so a cleanup there would have broken a different screen.
 */

export interface ActionResult {
  error?: string;
}

/** The session is gone. Shown as-is, so it has to read as an instruction. */
export const EXPIRED = "פג תוקף החיבור. התחברו מחדש.";
