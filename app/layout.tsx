import type { Metadata } from "next";
import { Cairo } from "next/font/google";
import "./globals.css";

const cairo = Cairo({
  subsets: ["arabic"],
  variable: "--font-cairo",
});

export const metadata: Metadata = {
  title: {
    default: "منصة مدير الاختبارات الذكي الشامل",
    template: "%s | منصة مدير الاختبارات",
  },
  description:
    "منصة رقمية متكاملة لاختبارات جمعية تعليم القرآن وعلومه — فرع المدينة المنورة",
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="ar" dir="rtl">
      <body className={`${cairo.variable} font-sans antialiased`}>{children}</body>
    </html>
  );
}