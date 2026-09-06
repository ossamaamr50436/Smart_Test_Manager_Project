import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { downloadFileFromDrive } from "@/lib/google-drive";

/**
 * شعار المنصة — يُخزَّن خاصاً على Drive ويُقدَّم عبر الخادم.
 * واجهة عامة (تظهر قبل تسجيل الدخول في صفحة الدخول)، آمنة لأنها
 * تُقدّم الملف الوحيد المخصص في AppSettings فقط.
 */
export async function GET() {
  try {
    const settings = await prisma.appSettings.findUnique({
      where: { id: "singleton" },
      select: { logoFileId: true },
    });

    if (!settings?.logoFileId) {
      return new NextResponse("Not Found", { status: 404 });
    }

    const buffer = await downloadFileFromDrive(settings.logoFileId);

    return new NextResponse(new Uint8Array(buffer), {
      status: 200,
      headers: {
        "Content-Type": "image",
        "Cache-Control": "public, max-age=3600",
        "X-Content-Type-Options": "nosniff",
      },
    });
  } catch {
    return new NextResponse("Not Found", { status: 404 });
  }
}