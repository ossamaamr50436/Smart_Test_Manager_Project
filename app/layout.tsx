import type { Metadata, Viewport } from "next";
import { headers } from "next/headers";
import { Cairo } from "next/font/google";
import "./globals.css";
import { getPlatformSettings } from "@/lib/actions/settings-actions";
import { ThemeProvider } from "@/components/providers/theme-provider";
import { ServiceWorkerRegister } from "@/components/providers/service-worker-register";

const cairo = Cairo({
  subsets: ["arabic"],
  variable: "--font-cairo",
});

export async function generateViewport(): Promise<Viewport> {
  const settings = await getPlatformSettings();
  return {
    themeColor: settings.primaryColor || "#015e63",
    width: "device-width",
    initialScale: 1,
  };
}

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
  const primaryColor = settings.primaryColor || "#015e63";
  const secondaryColor = settings.secondaryColor || "#d3bb8b";
  const defaultTheme = settings.darkModeEnabled ? "dark" : "light";
  const nonce = headers().get("x-nonce") ?? undefined;

  return (
    <html lang="ar" dir="rtl" suppressHydrationWarning>
      <head nonce={nonce}>
        <style nonce={nonce}>{`
          :root {
            --primary: ${primaryColor};
            --secondary: ${secondaryColor};
          }
        `}</style>
        <link rel="icon" href={settings.logoUrl || "/icon.png"} />
        <link rel="manifest" href="/manifest.json" />
        <link rel="apple-touch-icon" href="/icons/icon-192x192.png" />
        <meta name="application-name" content={settings.platformName} />
        <meta name="mobile-web-app-capable" content="yes" />
        <meta name="apple-mobile-web-app-capable" content="yes" />
        <meta name="apple-mobile-web-app-status-bar-style" content="default" />
        <meta name="apple-mobile-web-app-title" content={settings.platformName} />
      </head>
      <body className={`${cairo.variable} font-sans antialiased`}>
        <ThemeProvider defaultTheme={defaultTheme}>
          <ServiceWorkerRegister />
          {children}
        </ThemeProvider>
      </body>
    </html>
  );
}
