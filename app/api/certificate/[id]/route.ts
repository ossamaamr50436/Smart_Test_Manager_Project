import { NextResponse } from "next/server";
import { requireUser, requireRole } from "@/lib/security";
import { prisma } from "@/lib/prisma";
import { Role, CertificateStatus } from "@prisma/client";
import {
  downloadFileByUrl,
  isStoredUrl,
} from "@/lib/file-storage";

/**
 * تنزيل شهادة PDF بخصوصية تامة (المادة 8/5):
 *  - الشهادة مخزّنة على وحدة التخزين من خلال رابط عام.
 *  - لا يعرف المتصفح المعرّف الأصلي — يُحمَّل عبر هذا الوسيط ويُخصم اسم الملف.
 *  - عزل الصلاحيات:
 *      * مصدر الشهادات يمكنه تحميل أي شهادة.
 *      * الجهة التعليمية (INSTITUTION) تُحمّل شهادات طلاب جهتِها فقط.
 *      * المسؤول (ADMIN) يتحمّل أي شهادة (تدقيق/إشراف).
 */
export async function GET(
  req: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id: certificateId } = await params;
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
        student: {
          select: {
            name: true,
            institutionId: true,
            institution: { select: { tenantId: true } },
          },
        },
      },
    });

    if (!certificate || !certificate.student) {
      return NextResponse.json({ error: "الشهادة غير موجودة" }, { status: 404 });
    }

    // عزل المستأجرين: ممنوع لأي دور (غير المالك) الوصول لشهادة من مؤسسة أخرى
    if (
      user.role !== Role.SUPER_ADMIN &&
      certificate.student.institution.tenantId !== user.tenantId
    ) {
      return NextResponse.json(
        { error: "غير مصرح: هذه الشهادة تنتمي لمؤسسة أخرى" },
        { status: 403 }
      );
    }

    if (certificate.status === CertificateStatus.PENDING) {
      return NextResponse.json(
        { error: "الشهادة لم تُصدر بعد" },
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

    const fileUrl = certificate.fileUrl;

    if (!isStoredUrl(fileUrl)) {
      return NextResponse.json(
        { error: "ملف الشهادة غير متوفر في وحدة التخزين" },
        { status: 404 }
      );
    }

    const buffer = await downloadFileByUrl(fileUrl);

    const safeName = `${certificate.serialNumber}-${certificate.student.name.replace(
      /[^\p{L}\p{N}\s-]/gu,
      ""
    )}.pdf`;

    return new NextResponse(new Uint8Array(buffer), {
      status: 200,
      headers: {
        "Content-Type": "application/pdf",
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