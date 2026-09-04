import type { Metadata } from "next";
import { Cairo } from "next/font/google";
import "./globals.css";
import { getPlatformSettings } from "@/lib/actions/settings-actions";

const cairo = Cairo({
  subsets: ["arabic"],
  variable: "--font-cairo",
});

export async function generateMetadata(): Promise<Metadata> {
  const settings = await getPlatformSettings();
  return {
    title: {
      default: settings.platformName,
      template: `%s | ${settings.platformName}`,
    },
    description:
      "منصة رقمية متكاملة لاختبارات جمعية تعليم القرآن وعلومه — فرع المدينة المنورة",
  };
}

export default async function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const settings = await getPlatformSettings();

  return (
    <html lang="ar" dir="rtl">
      <head>
        <link rel="icon" href={settings.logoUrl || "/icon.png"} />
      </head>
      <body className={`${cairo.variable} font-sans antialiased`}>{children}</body>
    </html>
  );
}
