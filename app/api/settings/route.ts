import { NextResponse } from "next/server";
import { getPlatformSettings } from "@/lib/actions/settings-actions";

export async function GET() {
  try {
    // الإعدادات العامة متاحة لجميع المستخدمين (بما فيهم صفحة تسجيل الدخول)
    // لأن الشعار واسم المنصة مطلوبان للعرض العام
    const settings = await getPlatformSettings();
    return NextResponse.json(settings);
  } catch {
    return NextResponse.json(
      {
        platformName: "تطبيق الاختبارات",
        logoUrl: null,
        logoFileId: null,
        useTemplateMode: false,
        templateFileId: null,
        primaryColor: "#015e63",
        secondaryColor: "#d3bb8b",
        whatsappNumber: null,
        darkModeEnabled: false,
      },
      { status: 200 }
    );
  }
}
