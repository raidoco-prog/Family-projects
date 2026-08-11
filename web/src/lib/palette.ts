/**
 * Identity colours for family members.
 *
 * Every value is a pastel that carries dark text (--on-pastel) in both
 * themes, and the set is chosen so the hues stay distinguishable at the
 * 5px dot size used in the calendar — not only on a large card.
 */
export const MEMBER_COLORS = [
  { name: "אפרסק", value: "#F7D6B9" },
  { name: "תכלת", value: "#BFD8EC" },
  { name: "ירוק", value: "#C4E0BE" },
  { name: "סגול", value: "#CE9FDF" },
  { name: "ורוד", value: "#F2C4D2" },
  { name: "צהוב", value: "#F3E3B3" },
  { name: "טורקיז", value: "#B6E0DC" },
  { name: "אפור", value: "#D5DAE3" },
] as const;

export const DEFAULT_COLOR = MEMBER_COLORS[1].value;

/** First letter, used as the avatar glyph. */
export function initial(name: string): string {
  return name.trim().charAt(0) || "?";
}
