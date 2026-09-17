import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { isStoredUrl } from "@/lib/file-storage";

/**
 * شعار المنصة — يُدرِجه مباشرة من وحدة التخزين (Redirect إلى rابط مباشر).
 * واجهة عامة (تظهر قبل تسجيل الدخول في صفحة الدخول)، آمنة لأنها
 * تُقدّم الملف الوحيد المخصص في AppSettings فقط.
 */
export async function GET() {
  try {
    const settings = await prisma.appSettings.findUnique({
      where: { id: "singleton" },
      select: { logoUrl: true, logoFileId: true },
    });

    // نحتاج على الأقل المعرّف أو الرابط لتحديد الموقع
    if (!settings?.logoUrl && !settings?.logoFileId) {
      return new NextResponse("Not Found", { status: 404 });
    }

    const url = settings.logoUrl;

    // التأكد من أن الرابط هو رابط عام صالح (ufsUrl)
    if (!isStoredUrl(url)) {
      return new NextResponse("Not Found", { status: 404 });
    }

    return NextResponse.redirect(url, {
      status: 302,
      headers: { "Cache-Control": "public, max-age=3600" },
    });
  } catch {
    return new NextResponse("Not Found", { status: 404 });
  }
}
