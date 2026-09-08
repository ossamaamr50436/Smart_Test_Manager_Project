import { NextResponse } from "next/server";
import { requireUser, requireRole } from "@/lib/security";
import { prisma } from "@/lib/prisma";
import { Role, CertificateStatus } from "@prisma/client";
import {
  downloadFileFromDrive,
  extractDriveFileId,
  getDriveFileMimeType,
} from "@/lib/google-drive";

/**
 * تنزيل شهادة PDF بخصوصية تامة (المادة 8/5 + المادة 3):
 *  - الشهادة مخزّنة على Google Drive بصلاحيات خاصة (لا "anyone").
 *  - لا يعرف المتصفح معرّف Drive إطلاقاً — يُحمَّل عبر هذا الوسيط.
 *  - عزل الصلاحيات:
 *      * مصدر الشهادات يمكنه تحميل أي شهادة.
 *      * الجهة التعليمية (INSTITUTION) تُحمّل شهادات طلاب جهتِها فقط.
 *      * المسؤول (ADMIN) يتحمّل أي شهادة (تدقيق/إشراف).
 */
export async function GET(
  req: Request,
  { params }: { params: { id: string } }
) {
  const certificateId = params.id;
  if (!certificateId || certificateId.length < 5) {
    return NextResponse.json({ error: "معرّف غير صالح" }, { status: 400 });
  }

  try {
    const user = await requireUser();
    requireRole(user, [Role.CERTIFICATE_SOURCE, Role.INSTITUTION, Role.ADMIN]);

    const certificate = await prisma.certificate.findUnique({
      where: { id: certificateId },
      select: {
        id: true,
        serialNumber: true,
        fileUrl: true,
        status: true,
        student: { select: { name: true, institutionId: true } },
      },
    });

    if (!certificate || !certificate.student) {
      return NextResponse.json({ error: "الشهادة غير موجودة" }, { status: 404 });
    }

    if (certificate.status === CertificateStatus.PENDING) {
      return NextResponse.json(
        { error: "الشهادة لم تُرفع بعد على Google Drive" },
        { status: 404 }
      );
    }

    // عزل الجهة التعليمية: تُحمّل فقط شهادات طلاب جهتِها (المادة 8/7)
    if (
      user.role === Role.INSTITUTION &&
      certificate.student.institutionId !== user.institutionId
    ) {
      return NextResponse.json(
        { error: "غير مصرح: هذه الشهادة ليست لجهتك التعليمية" },
        { status: 403 }
      );
    }

    // تحديد معرّف الملف على Drive (استخراجه من رابط Google Drive المخزّن)
    const fileId = extractDriveFileId(certificate.fileUrl ?? "");
    if (!fileId) {
      return NextResponse.json(
        { error: "ملف الشهادة غير متوفر في Drive" },
        { status: 404 }
      );
    }

    const [buffer, mimeType] = await Promise.all([
      downloadFileFromDrive(fileId),
      getDriveFileMimeType(fileId),
    ]);

    // قائمة بيضاء صارمة لأنواع المحتوى المسموح تسليمها (المادة 8/5)
    // يمنع تسليم ملف بمحتوى غير متوقع (Content Sniffing / MIME spoofing)
    const unsafeMime = ["text/html", "application/xhtml+xml", "image/svg+xml"].includes(
      mimeType ?? ""
    );
    if (!mimeType || unsafeMime) {
      return NextResponse.json(
        { error: "نوع ملف الشهادة غير مدعوم" },
        { status: 415 }
      );
    }

    const safeName = `${certificate.serialNumber}-${certificate.student.name.replace(
      /[^\p{L}\p{N}\s-]/gu,
      ""
    )}.pdf`;

    return new NextResponse(new Uint8Array(buffer), {
      status: 200,
      headers: {
        "Content-Type": mimeType ?? "application/pdf",
        "Content-Disposition": `attachment; filename="${safeName}"`,
        "Cache-Control": "private, no-store, max-age=0",
        "X-Content-Type-Options": "nosniff",
      },
    });
  } catch (e) {
    // عدم كشف تفاصيل داخلية (OWASP — Security Misconfiguration)
    return NextResponse.json({ error: "غير مصرح" }, { status: 403 });
  }
}