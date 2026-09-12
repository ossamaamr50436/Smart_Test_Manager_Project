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
  display: "swap",
});

const SITE_URL = "https://smart-test-manager-project.vercel.app";

export const metadataBase: Metadata["metadataBase"] = new URL(SITE_URL);

export async function generateViewport(): Promise<Viewport> {
  const settings = await getPlatformSettings();
  return {
    themeColor: settings.primaryColor || "#015e63",
    width: "device-width",
    initialScale: 1,
    maximumScale: 5,
    viewportFit: "cover",
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
      "منصة رقمية شاملة لإدارة اختبارات حفظ القرآن الكريم وفق لائحة الجمعية — فرع المدينة المنورة.",
    keywords: [
      "اختبارات القرآن",
      "حفظ القرآن",
      "المدينة المنورة",
      "جمعية تعليم القرآن",
      "منصة اختبارات",
    ],
    metadataBase: new URL(SITE_URL),
    openGraph: {
      type: "website",
      locale: "ar_SA",
      url: SITE_URL,
      siteName: settings.platformName,
      title: settings.platformName,
      description:
        "إدارة اختبارات حفظ القرآن الكريم ومتابعة تقييم الطلاب واللجان.",
      images: [
        {
          url: settings.logoUrl || "/logo.png",
          width: 512,
          height: 512,
          alt: settings.platformName,
        },
      ],
    },
    robots: { index: true, follow: true },
    alternates: { canonical: SITE_URL },
    applicationName: settings.platformName,
  };
}

const organizationSchema = {
  "@context": "https://schema.org",
  "@type": "EducationalOrganization",
  name: "جمعية تعليم القرآن وعلومه — فرع المدينة المنورة",
  alternateName: "منصة مدير الاختبارات الذكي",
  url: SITE_URL,
  description:
    "منصة رقمية شاملة لإدارة اختبارات حفظ القرآن الكريم وفق لائحة الجمعية — فرع المدينة المنورة.",
  areaServed: "المدينة المنورة",
  inLanguage: "ar-SA",
};

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
        <script
          nonce={nonce}
          type="application/ld+json"
          dangerouslySetInnerHTML={{ __html: JSON.stringify(organizationSchema) }}
        />
      </head>
      <body className={`${cairo.variable} font-sans antialiased`}>
        <ThemeProvider defaultTheme={defaultTheme} nonce={nonce}>
          <ServiceWorkerRegister />
          {children}
        </ThemeProvider>
      </body>
    </html>
  );
}
