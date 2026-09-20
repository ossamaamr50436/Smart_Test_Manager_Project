import { NextResponse } from "next/server";
import { getCachedPlatformSettings } from "@/lib/cache";

export const dynamic = "force-dynamic";

export async function GET() {
  try {
    // الإعدادات العامة متاحة لجميع المستخدمين (بما فيهم صفحة تسجيل الدخول)
    // لأن الشعار واسم المنصة مطلوبان للعرض العام
    const settings = await getCachedPlatformSettings();
    return NextResponse.json(settings);
  } catch {
    return NextResponse.json(
      {
        platformName: "منصة إدارة الاختبارات الذكية",
        logoUrl: null,
        logoFileId: null,
        useTemplateMode: false,
        templateFileId: null,
        primaryColor: "#015e63",
        secondaryColor: "#d3bb8b",
        whatsappNumber: null,
        darkModeEnabled: false,
        requireStudentApplicationFile: false,
        showTutorialSection: true,
        accentColor: "#1a262e",
        backgroundColor: "#ffffff",
        textColor: "#0f172a",
        borderColor: "#e2e8f0",
        headingFont: "Cairo",
        bodyFont: "Cairo",
        borderRadius: "0.5rem",
        shadowIntensity: "md",
        buttonStyle: "rounded",
        sidebarBg: "#015e63",
        sidebarText: "#ffffff",
        sidebarActiveBg: "#014a4e",
        sidebarActiveText: "#ffffff",
        topbarBg: "#ffffff",
        topbarText: "#0f172a",
        loginBg: "#015e63",
        loginGradientFrom: "#014a4e",
        loginGradientTo: "#d3bb8b",
        loginCardBg: "#ffffff",
        buttonPrimaryBg: "#015e63",
        buttonPrimaryText: "#ffffff",
        buttonSecondaryBg: "#d3bb8b",
        buttonSecondaryText: "#0f172a",
        primaryColorDark: "#0e6e73",
        secondaryColorDark: "#e2d3ab",
        accentColorDark: "#0f1a22",
        backgroundColorDark: "#0e171b",
        textColorDark: "#eef1f4",
        borderColorDark: "#24343e",
        sidebarBgDark: "#071014",
        sidebarTextDark: "#dbe7ec",
        sidebarActiveBgDark: "#015e63",
        sidebarActiveTextDark: "#ffffff",
        topbarBgDark: "#121c22",
        topbarTextDark: "#eef1f4",
        loginBgDark: "#0a1416",
        loginGradientFromDark: "#06282b",
        loginGradientToDark: "#182830",
        loginCardBgDark: "#121c22",
        buttonPrimaryBgDark: "#0e6e73",
        buttonPrimaryTextDark: "#ffffff",
        buttonSecondaryBgDark: "#d3bb8b",
        buttonSecondaryTextDark: "#0f172a",
      },
      { status: 200 }
    );
  }
}
