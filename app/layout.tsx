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
  // D3: metadata = line1 + " " + line2 (بدون <br>)
  const line1 = settings.platformNameLine1?.trim();
  const line2 = settings.platformNameLine2?.trim();
  const metaName =
    line1 && line2 ? `${line1} ${line2}` : line1 || line2 || settings.platformName;
  return {
    title: {
      default: metaName,
      template: `%s | ${metaName}`,
    },
    description: metaName,
    keywords: [
      "منصة مجتاز",
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
      siteName: metaName,
      title: metaName,
      description: metaName,
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
    applicationName: metaName,
  };
}

// هيكل بيانات مُنشأ دينامياً من إعدادات المنصة — محايد ولا يرتبط بجمعية معيّنة
function buildOrganizationSchema(platformName: string) {
  return {
    "@context": "https://schema.org",
    "@type": "EducationalOrganization",
    name: platformName,
    alternateName: platformName,
    url: SITE_URL,
    description: platformName,
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
  const sidebarBg = settings.sidebarBg ?? "#015e63";
  const sidebarText = settings.sidebarText ?? "#ffffff";
  const sidebarActiveBg = settings.sidebarActiveBg ?? "#014a4e";
  const sidebarActiveText = settings.sidebarActiveText ?? "#ffffff";
  const topbarBg = settings.topbarBg ?? "#ffffff";
  const topbarText = settings.topbarText ?? "#0f172a";
  const loginBg = settings.loginBg ?? "#015e63";
  const loginGradientFrom = settings.loginGradientFrom ?? "#014a4e";
  const loginGradientTo = settings.loginGradientTo ?? "#d3bb8b";
  const loginCardBg = settings.loginCardBg ?? "#ffffff";
  const buttonPrimaryBg = settings.buttonPrimaryBg ?? "#015e63";
  const buttonPrimaryText = settings.buttonPrimaryText ?? "#ffffff";
  const buttonSecondaryBg = settings.buttonSecondaryBg ?? "#d3bb8b";
  const buttonSecondaryText = settings.buttonSecondaryText ?? "#0f172a";
  // Dark Mode Tokens (D1) — قيم الوضع الداكن لكل عنصر
  const primaryColorDark = settings.primaryColorDark ?? "#0e6e73";
  const secondaryColorDark = settings.secondaryColorDark ?? "#e2d3ab";
  const accentColorDark = settings.accentColorDark ?? "#0f1a22";
  const backgroundColorDark = settings.backgroundColorDark ?? "#0e171b";
  const textColorDark = settings.textColorDark ?? "#eef1f4";
  const borderColorDark = settings.borderColorDark ?? "#24343e";
  const sidebarBgDark = settings.sidebarBgDark ?? "#071014";
  const sidebarTextDark = settings.sidebarTextDark ?? "#dbe7ec";
  const sidebarActiveBgDark = settings.sidebarActiveBgDark ?? "#015e63";
  const sidebarActiveTextDark = settings.sidebarActiveTextDark ?? "#ffffff";
  const topbarBgDark = settings.topbarBgDark ?? "#121c22";
  const topbarTextDark = settings.topbarTextDark ?? "#eef1f4";
  const loginBgDark = settings.loginBgDark ?? "#0a1416";
  const loginGradientFromDark = settings.loginGradientFromDark ?? "#06282b";
  const loginGradientToDark = settings.loginGradientToDark ?? "#182830";
  const loginCardBgDark = settings.loginCardBgDark ?? "#121c22";
  const buttonPrimaryBgDark = settings.buttonPrimaryBgDark ?? "#0e6e73";
  const buttonPrimaryTextDark = settings.buttonPrimaryTextDark ?? "#ffffff";
  const buttonSecondaryBgDark = settings.buttonSecondaryBgDark ?? "#d3bb8b";
  const buttonSecondaryTextDark = settings.buttonSecondaryTextDark ?? "#0f172a";
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

            --sidebar-bg: ${sidebarBg};
            --sidebar-text: ${sidebarText};
            --sidebar-active-bg: ${sidebarActiveBg};
            --sidebar-active-text: ${sidebarActiveText};

            --topbar-bg: ${topbarBg};
            --topbar-text: ${topbarText};

            --login-bg: ${loginBg};
            --login-gradient-from: ${loginGradientFrom};
            --login-gradient-to: ${loginGradientTo};
            --login-card-bg: ${loginCardBg};

            --button-primary-bg: ${buttonPrimaryBg};
            --button-primary-text: ${buttonPrimaryText};
            --button-secondary-bg: ${buttonSecondaryBg};
            --button-secondary-text: ${buttonSecondaryText};
          }

          /* نظام الألوان المتكامل للوضع الداكن (D1) — يتم تفعيله عبر next-themes (.dark) */
          .dark {
            --primary: ${primaryColorDark};
            --secondary: ${secondaryColorDark};
            --accent: ${accentColorDark};
            --background: ${backgroundColorDark};
            --foreground: ${textColorDark};
            --border: ${borderColorDark};

            --sidebar-bg: ${sidebarBgDark};
            --sidebar-text: ${sidebarTextDark};
            --sidebar-active-bg: ${sidebarActiveBgDark};
            --sidebar-active-text: ${sidebarActiveTextDark};

            --topbar-bg: ${topbarBgDark};
            --topbar-text: ${topbarTextDark};

            --login-bg: ${loginBgDark};
            --login-gradient-from: ${loginGradientFromDark};
            --login-gradient-to: ${loginGradientToDark};
            --login-card-bg: ${loginCardBgDark};

            --button-primary-bg: ${buttonPrimaryBgDark};
            --button-primary-text: ${buttonPrimaryTextDark};
            --button-secondary-bg: ${buttonSecondaryBgDark};
            --button-secondary-text: ${buttonSecondaryTextDark};
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
