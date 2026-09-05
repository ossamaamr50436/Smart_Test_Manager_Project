"use server";

import { requireUser, requireRole } from "@/lib/security";
import { prisma } from "@/lib/prisma";
import {
  Role,
  StudentStatus,
  AssessmentStatus,
  NotificationType,
  AuditAction,
  CertificateStatus,
} from "@prisma/client";
import { revalidatePath } from "next/cache";
import { generateCertificatePdfBuffer } from "@/lib/certificate-pdf";
import { uploadFileToDrive } from "@/lib/google-drive";
import { getPlatformSettings } from "@/lib/actions/settings-actions";
import {
  downloadTemplateFromDrive,
  fillPdfTemplate,
} from "@/lib/certificate-template";

// ============================================================
// نظام إصدار الشهادات (القسم 8)
// - عزل الصلاحيات: مصدر الشهادات فقط (المادة 8/5)
// - الملفات: تُرفع حصراً على Google Drive (المادة 3)
// ============================================================

/** تسجيل حدث في Audit Log */
async function recordAudit(userId: string, action: AuditAction, details: unknown) {
  await prisma.auditLog.create({
    data: { userId, action, details: JSON.stringify(details) },
  });
}

/** جلب آخر تقييم معتمد نهائياً لطالب (لحساب الدرجة) */
async function getStudentFinalScore(studentId: string): Promise<number | null> {
  const session = await prisma.examSession.findFirst({
    where: { studentId },
    select: {
      assessments: {
        where: {
          status: {
            in: [
              AssessmentStatus.FINALIZED,
              AssessmentStatus.ACCEPTED,
              AssessmentStatus.NOTIFIED,
            ],
          },
        },
        select: { finalScore: true },
        orderBy: { updatedAt: "desc" },
        take: 1,
      },
    },
  });
  return session?.assessments?.[0]?.finalScore ?? null;
}

/** توليد رقم تسلسلي فريد للشهادة (مثل CERT-2026-0001) */
function buildSerialNumber(index: number): string {
  const year = new Date().getFullYear();
  return `CERT-${year}-${String(index).padStart(4, "0")}`;
}

/**
 * إصدار شهادة لطالب جاهز (READY_FOR_CERTIFICATE)
 * - يولّد PDF جديداً
 * - يرفعه على Google Drive
 * - يحدّث حالة الطالب إلى CERTIFICATE_ISSUED
 * - يضيف إشعاراً للجهة التعليمية + سجل تدقيق
 */
export async function generateCertificate(studentId: string) {
  const user = await requireUser();

  // عزل الصلاحيات: مصدر الشهادات فقط (المادة 8/5)
  requireRole(user, [Role.CERTIFICATE_SOURCE]);

  if (!studentId || studentId.length < 1) {
    throw new Error("معرّف الطالب غير صالح");
  }

  const student = await prisma.student.findUnique({
    where: { id: studentId },
    select: {
      id: true,
      name: true,
      status: true,
      institutionId: true,
      institution: { select: { name: true } },
    },
  });

  if (!student) {
    throw new Error("الطالب غير موجود");
  }

  // المرحلة الصحيحة فقط: جاهز لإصدار الشهادة
  if (student.status !== StudentStatus.READY_FOR_CERTIFICATE) {
    throw new Error(
      "الطالب لم يصل لمرحلة إصدار الشهادة بعد (الحالة الحالية للمراحل السابقة)"
    );
  }

  // منع التكرار: لا يوجد سوى شهادة نشطة واحدة لكل طالب
  const existing = await prisma.certificate.findFirst({
    where: { studentId },
    select: { id: true },
  });
  if (existing) {
    throw new Error("عُدّلت شهادة لهذا الطالب مسبقاً");
  }

  const finalScore = await getStudentFinalScore(student.id);
  if (finalScore === null) {
    throw new Error("لا توجد درجة نهائية معتمدة لهذا الطالب");
  }

  // الرقم التسلسلي التالي (بدون race condition)
  const count = await prisma.certificate.count();
  let serialNumber = buildSerialNumber(count + 1);

  // التأكد من عدم التكرار (حماية من race condition)
  let attempts = 0;
  while (attempts < 10) {
    const existing = await prisma.certificate.findUnique({
      where: { serialNumber },
      select: { id: true },
    });
    if (!existing) break;
    attempts++;
    serialNumber = buildSerialNumber(count + 1 + attempts);
  }

  // 1) توليد PDF (وضع القالب الذكي أو الافتراضي)
  const settings = await getPlatformSettings();
  let pdfBuffer: Buffer;

  if (settings.useTemplateMode && settings.templateFileId) {
    // القالب الذكي: تحميل القالب من Drive وتعبئته
    const templateBytes = await downloadTemplateFromDrive(
      settings.templateFileId
    );
    const dateStr = new Date().toLocaleDateString("ar-SA", {
      year: "numeric",
      month: "long",
      day: "numeric",
    });
    pdfBuffer = await fillPdfTemplate(
      templateBytes,
      student.name,
      finalScore,
      dateStr
    );
  } else {
    // التوليد الكامل (افتراضي)
    pdfBuffer = await generateCertificatePdfBuffer({
      studentName: student.name,
      finalScore,
      issuedDate: new Date(),
      serialNumber,
      managerName: "مدير الاختبارات",
    });
  }

  // 2) رفع الشهادة على Google Drive (المادة 3)
  let fileUrl = "";
  try {
    const uploaded = await uploadFileToDrive(
      pdfBuffer,
      `${serialNumber}-${student.name}.pdf`,
      "application/pdf"
    );
    fileUrl = uploaded.webViewLink;
  } catch (uploadError) {
    // عدم توفر إعدادات Drive يمنع إتمام الإصدار — لا نخزن الملف محلياً (المادة 3)
    throw new Error(
      `تعذر رفع الشهادة على Google Drive: ${
        uploadError instanceof Error ? uploadError.message : "خطأ غير معروف"
      }`
    );
  }

  // 3) حفظ سجل الشهادة
  const certificate = await prisma.certificate.create({
    data: {
      serialNumber,
      studentId: student.id,
      finalScore,
      fileUrl,
      issuedDate: new Date(),
      status: CertificateStatus.UPLOADED,
      issuedById: user.id,
    },
  });

  // 4) تحديث حالة الطالب
  await prisma.student.update({
    where: { id: student.id },
    data: { status: StudentStatus.CERTIFICATE_ISSUED },
  });

  // 5) إشعار الجهة التعليمية
  const institutionUsers = await prisma.user.findMany({
    where: { role: Role.INSTITUTION, institutionId: student.institutionId },
    select: { id: true },
  });
  if (institutionUsers.length > 0) {
    await prisma.notification.createMany({
      data: institutionUsers.map((u) => ({
        userId: u.id,
        message: `صدرت شهادة الطالب «${student.name}» وتم رفعها على Google Drive`,
        type: NotificationType.CERTIFICATE,
      })),
    });
  }

  // 6) سجل التدقيق
  await recordAudit(user.id, AuditAction.CREATE, {
    entity: "Certificate",
    certificateId: certificate.id,
    serialNumber,
    studentId: student.id,
    finalScore,
    fileUrl,
    step: "CERTIFICATE_ISSUED",
  });

  revalidatePath("/dashboard/certificate-source");

  return { success: true, certificateId: certificate.id, serialNumber, fileUrl };
}

/**
 * فتح/مشاهدة شهادة مرفوعة سابقاً (عنوان Drive)
 */
export async function getCertificateDriveLink(studentId: string) {
  const user = await requireUser();
  requireRole(user, [Role.CERTIFICATE_SOURCE, Role.INSTITUTION, Role.ADMIN]);

  const certificate = await prisma.certificate.findFirst({
    where: { studentId },
    select: { fileUrl: true },
    orderBy: { createdAt: "desc" },
  });

  if (user.role === Role.INSTITUTION) {
    const student = await prisma.student.findUnique({
      where: { id: studentId },
      select: { institutionId: true },
    });
    if (!student || student.institutionId !== user.institutionId) {
      throw new Error("غير مصرح: هذا الطالب ليس من جهتك التعليمية");
    }
  }

  return certificate?.fileUrl ?? null;
}

/**
 * قائمة الشهادات بانتظار التوقيع (PENDING) — لمصدر الشهادات
 */
export async function getPendingCertificatesForSignature() {
  const user = await requireUser();
  requireRole(user, [Role.CERTIFICATE_SOURCE]);

  return prisma.certificate.findMany({
    where: { status: CertificateStatus.PENDING },
    orderBy: { createdAt: "desc" },
    include: {
      student: { select: { name: true, branch: true } },
    },
  });
}

/**
 * توقيع الشهادة (المادة 8/6)
 *
 * يرفع صورة التوقيع الرقمي على Google Drive ثم يحدّث سجل الشهادة
 * على أن يوقّع مسؤول رفيع المستوى (Admin / HeadOfAffairs).
 */
export async function signCertificate(certificateId: string, signatureBuffer: Buffer) {
  const user = await requireUser();

  // عزل الصلاحيات: لا يمكن التوقيع إلا بمسؤول رفيع (المادة 8)
  requireRole(user, [Role.ADMIN, Role.HEAD_OF_AFFAIRS]);

  const certificate = await prisma.certificate.findUnique({
    where: { id: certificateId },
    select: { id: true, serialNumber: true, status: true },
  });
  if (!certificate) {
    throw new Error("الشهادة غير موجودة");
  }
  if (certificate.status === CertificateStatus.SIGNED) {
    throw new Error("الشهادة موقّعة بالفعل");
  }

  // رفع صورة التوقيع على Google Drive (المادة 3)
  const uploaded = await uploadFileToDrive(
    signatureBuffer,
    `signature-${certificate.serialNumber}.png`,
    "image/png"
  );

  await prisma.certificate.update({
    where: { id: certificateId },
    data: {
      signatureUrl: uploaded.webViewLink || uploaded.fileId,
      signedById: user.id,
      signedAt: new Date(),
      status: CertificateStatus.SIGNED,
    },
  });

  await recordAudit(user.id, AuditAction.APPROVE, {
    entity: "Certificate",
    certificateId,
    serialNumber: certificate.serialNumber,
    step: "CERTIFICATE_SIGNED",
    signatureFileId: uploaded.fileId,
  });

  revalidatePath("/dashboard/certificate-source");

  return { success: true, certificateId, signatureUrl: uploaded.webViewLink };
}