import type { Metadata, Viewport } from "next";
import { headers } from "next/headers";
import { Cairo } from "next/font/google";
import "./globals.css";
import { SpeedInsights } from "@vercel/speed-insights/next";
import { getCachedPlatformSettings } from "@/lib/cache";
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
  const settings = await getCachedPlatformSettings();
  return {
    themeColor: settings.primaryColor || "#015e63",
    width: "device-width",
    initialScale: 1,
    maximumScale: 5,
    viewportFit: "cover",
  };
}

export async function generateMetadata(): Promise<Metadata> {
  const settings = await getCachedPlatformSettings();
  return {
    title: {
      default: settings.platformName,
      template: `%s | ${settings.platformName}`,
    },
    description:
      "منصة رقمية متعددة المستأجرين لإدارة الاختبارات، وتنظيم اللجان، وتقييم الطلاب، وإصدار الشهادات.",
    keywords: [
      "منصة إدارة الاختبارات",
      "اختبارات",
      "تقييم الطلاب",
      "لجان اختبار",
      "إصدار شهادات",
    ],
    metadataBase: new URL(SITE_URL),
    openGraph: {
      type: "website",
      locale: "ar_SA",
      url: SITE_URL,
      siteName: settings.platformName,
      title: settings.platformName,
      description:
        "إدارة اختبارات الطلاب، تشكيل اللجان، التقييم، ومتابعة إصدار الشهادات لمؤسسات تعليمية متعددة.",
      images: [
        {
          url: settings.logoUrl || "/logo.svg",
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

// هيكل بيانات مُنشأ دينامياً من إعدادات المنصة — محايد ولا يرتبط بجمعية معيّنة
function buildOrganizationSchema(platformName: string) {
  return {
    "@context": "https://schema.org",
    "@type": "EducationalOrganization",
    name: platformName,
    alternateName: "منصة إدارة الاختبارات الذكية",
    url: SITE_URL,
    description:
      "منصة رقمية متعددة المستأجرين لإدارة الاختبارات وتنظيم اللجان وتقييم الطلاب.",
    inLanguage: "ar-SA",
  };
}

export default async function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const settings = await getCachedPlatformSettings();
  const primaryColor = settings.primaryColor || "#015e63";
  const secondaryColor = settings.secondaryColor || "#d3bb8b";
  const accentColor = settings.accentColor ?? "#1a262e";
  const backgroundColor = settings.backgroundColor ?? "#ffffff";
  const textColor = settings.textColor ?? "#0f172a";
  const borderColor = settings.borderColor ?? "#e2e8f0";
  const headingFont = settings.headingFont ?? "Cairo";
  const bodyFont = settings.bodyFont ?? "Cairo";
  const borderRadius = settings.borderRadius ?? "0.5rem";
  const shadowIntensity = settings.shadowIntensity ?? "md";
  const buttonStyle = settings.buttonStyle ?? "rounded";
  const defaultTheme = settings.darkModeEnabled ? "dark" : "light";
  const nonce = (await headers()).get("x-nonce") ?? undefined;

  return (
    <html lang="ar" dir="rtl" suppressHydrationWarning>
      <head nonce={nonce}>
        <style nonce={nonce}>{`
          :root {
            --primary: ${primaryColor};
            --secondary: ${secondaryColor};
            --accent: ${accentColor};
            --background: ${backgroundColor};
            --foreground: ${textColor};
            --border: ${borderColor};
            --font-heading: ${headingFont};
            --font-body: ${bodyFont};
            --radius: ${borderRadius};
            --shadow-intensity: ${shadowIntensity};
            --button-style: ${buttonStyle};
          }
        `}</style>
        <link rel="icon" href={settings.logoUrl || "/logo.svg"} />
        <link rel="manifest" href="/manifest.json" />
        <meta name="application-name" content={settings.platformName} />
        <meta name="mobile-web-app-capable" content="yes" />
        <meta name="apple-mobile-web-app-capable" content="yes" />
        <meta name="apple-mobile-web-app-status-bar-style" content="default" />
        <meta name="apple-mobile-web-app-title" content={settings.platformName} />
        <script
          nonce={nonce}
          type="application/ld+json"
          dangerouslySetInnerHTML={{
            __html: JSON.stringify(buildOrganizationSchema(settings.platformName)),
          }}
        />
      </head>
      <body className={`${cairo.variable} font-sans antialiased`}>
        <ThemeProvider defaultTheme={defaultTheme} nonce={nonce}>
          <ServiceWorkerRegister />
          <SpeedInsights />
          {children}
        </ThemeProvider>
      </body>
    </html>
  );
}
