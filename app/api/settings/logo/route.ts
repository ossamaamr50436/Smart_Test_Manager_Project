import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { downloadFileFromDrive, getDriveFileMimeType } from "@/lib/google-drive";

// الحد الأقصى لحجم الشعار (منع استهلاك الذاكرة عبر ملفات ضخمة)
const MAX_LOGO_SIZE = 5 * 1024 * 1024;

// أنواع الشعارات المسموحة (تتوافق مع قيود الرفع في settings-actions)
const ALLOWED_MIME_TYPES = new Set([
  "image/png",
  "image/jpeg",
  "image/webp",
]);

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

    const [buffer, mimeType] = await Promise.all([
      downloadFileFromDrive(settings.logoFileId),
      getDriveFileMimeType(settings.logoFileId),
    ]);

    // منع استهلاك الذاكرة عبر ملفات ضخمة
    if (buffer.byteLength > MAX_LOGO_SIZE) {
      return new NextResponse("Requires Size Too Large", { status: 413 });
    }

    const finalMimeType =
      mimeType && ALLOWED_MIME_TYPES.has(mimeType)
        ? mimeType
        : "image/png";

    return new NextResponse(new Uint8Array(buffer), {
      status: 200,
      headers: {
        "Content-Type": finalMimeType,
        "Cache-Control": "public, max-age=3600",
        "X-Content-Type-Options": "nosniff",
        "Content-Length": String(buffer.byteLength),
      },
    });
  } catch {
    return new NextResponse("Not Found", { status: 404 });
  }
}