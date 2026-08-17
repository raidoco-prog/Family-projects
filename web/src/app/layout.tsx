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
};

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
