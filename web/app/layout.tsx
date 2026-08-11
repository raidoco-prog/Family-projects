import './globals.css';
import type { Metadata } from 'next';

export const metadata: Metadata = {
  title: 'Family Projects',
  description: 'Family management app scaffold',
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="he" dir="rtl">
      <body className="min-h-screen bg-cyan-950 text-cyan-50">{children}</body>
    </html>
  );
}
