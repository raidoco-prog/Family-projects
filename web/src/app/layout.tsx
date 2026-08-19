import type { Metadata, Viewport } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "הבית שלנו",
  description: "יומן, משימות, תורים, קניות ומלאי — לכל המשפחה במקום אחד",
  manifest: "/manifest.webmanifest",
  // iOS picks the home-screen icon from apple-touch-icon. Recent Safari
  // will fall back to the manifest, but that is the loose path and gives
  // it no 180×180 to work from — it rescales whatever it finds. Naming
  // one explicitly is what makes the installed icon predictable.
  icons: {
    icon: [{ url: "/icon-192.png", sizes: "192x192", type: "image/png" }],
    apple: [{ url: "/apple-touch-icon.png", sizes: "180x180", type: "image/png" }],
  },
  appleWebApp: {
    capable: true,
    title: "הבית שלנו",
    statusBarStyle: "default",
  },
  // `appleWebApp.capable` emits only the standardised
  // `mobile-web-app-capable`. iOS does not read that one — it reads the
  // apple-prefixed name, and Next has no way to ask for it — so the app
  // opened from the home screen with Safari's chrome around it, and the
  // two apple-prefixed tags Next *does* emit made it look configured.
  //
  // Not cosmetic. iOS delivers web push only to a home-screen app running
  // as a web app, so without this the subscription is accepted, Apple
  // accepts the push, and nothing is ever shown.
  other: {
    "apple-mobile-web-app-capable": "yes",
  },
};

/**
 * Run the server code beside the database.
 *
 * Supabase is in eu-central-1 (Frankfurt) — chosen because it is the
 * closest region to Israel. Vercel, told nothing, places functions in its
 * own default region, which is nowhere near it. Every page render makes
 * several *serial* Supabase calls, so a misplaced function pays that
 * crossing once per call, not once per page.
 *
 * fra1 is Vercel's Frankfurt region: the same city as the database. The
 * user is a little further from the function and the function is much
 * closer to the data, which is the trade that wins when one page is
 * several queries deep.
 */
export const preferredRegion = "fra1";

export const viewport: Viewport = {
  width: "device-width",
  initialScale: 1,
  viewportFit: "cover",
  themeColor: "#F2F5FA",
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="he" dir="rtl">
      <body className="min-h-dvh">{children}</body>
    </html>
  );
}
