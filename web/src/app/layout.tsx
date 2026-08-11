import type { Metadata, Viewport } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "הבית שלנו",
  description: "יומן, משימות, תורים, קניות ומלאי — לכל המשפחה במקום אחד",
};

export const viewport: Viewport = {
  width: "device-width",
  initialScale: 1,
  viewportFit: "cover",
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
