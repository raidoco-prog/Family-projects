/**
 * Supabase's auth errors, said in Hebrew and with a way out.
 *
 * Showing the raw text was the right call when the alternative was a login
 * button that appeared to do nothing — it is what made those failures
 * fixable. But the raw text is written for whoever deployed the app, and
 * the people hitting it are a family. "email rate limit exceeded" tells a
 * fifteen-year-old nothing, least of all that the other button on the same
 * screen would have worked.
 *
 * So: a sentence they can act on, and the original kept underneath in
 * small type, because that is what makes the next report diagnosable.
 */
export interface ExplainedError {
  /** What happened, in a sentence. */
  message: string;
  /** What to do instead. Absent when there is nothing useful to say. */
  hint?: string;
  /** True when signing in with Google would sidestep this entirely. */
  suggestGoogle?: boolean;
}

const RULES: { match: RegExp; explain: ExplainedError }[] = [
  {
    // The built-in Supabase mailer allows only a handful of messages an
    // hour. Nothing about the account is wrong and waiting does fix it.
    match: /rate limit|too many requests|429/i,
    explain: {
      message: "נשלחו יותר מדי קישורי כניסה בזמן קצר.",
      hint: "אפשר לנסות שוב בעוד כשעה — או להיכנס עם גוגל, וזה עובד מיד.",
      suggestGoogle: true,
    },
  },
  {
    // Supabase asks for a pause between two requests for the same address.
    match: /you can only request this after|security purposes/i,
    explain: {
      message: "בקשת קישור נוספת מוקדם מדי.",
      hint: "המתינו כדקה ונסו שוב, או היכנסו עם גוגל.",
      suggestGoogle: true,
    },
  },
  {
    match: /signups not allowed|signup is disabled|email logins are disabled/i,
    explain: {
      message: "הכניסה באמצעות אימייל אינה פעילה בבית הזה.",
      hint: "היכנסו עם גוגל.",
      suggestGoogle: true,
    },
  },
  {
    // The default mailer in a new project will only deliver to the
    // project's own members, and refuses everyone else outright.
    match: /invalid.*email|email address.*invalid|is invalid/i,
    explain: {
      message: "כתובת האימייל לא התקבלה.",
      hint: "בדקו את הכתובת, או היכנסו עם גוגל.",
      suggestGoogle: true,
    },
  },
  {
    match: /provider is not enabled|unsupported provider/i,
    explain: {
      message: "שיטת הכניסה הזאת לא הופעלה עדיין.",
      hint: "בקשו ממי שהקים את האפליקציה להפעיל אותה.",
    },
  },
  {
    match: /code verifier|pkce/i,
    explain: {
      message: "ההתחברות התחילה בדפדפן אחד והסתיימה באחר.",
      hint: "פתחו את הקישור שוב באותו דפדפן, ונסו מההתחלה.",
    },
  },
  {
    match: /expired|invalid.*token|token has expired/i,
    explain: {
      message: "הקישור פג או שכבר נעשה בו שימוש.",
      hint: "בקשו קישור חדש.",
    },
  },
  {
    match: /failed to fetch|network|timeout/i,
    explain: {
      message: "אין חיבור לרשת כרגע.",
      hint: "בדקו את החיבור ונסו שוב.",
    },
  },
];

export function explainAuthError(raw: string): ExplainedError {
  for (const rule of RULES) {
    if (rule.match.test(raw)) return rule.explain;
  }
  return { message: "ההתחברות נכשלה." };
}
