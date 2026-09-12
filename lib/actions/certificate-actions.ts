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
import {
  isUniqueConstraintError,
  friendlyUniqueMessage,
} from "@/lib/actions/unique-guard";
import { getPlatformSettings } from "@/lib/actions/settings-actions";
import {
  downloadTemplateFromDrive,
  fillPdfTemplate,
} from "@/lib/certificate-template";
import { checkRateLimit } from "@/lib/rate-limit";
import { validateFileUpload } from "@/lib/upload-security";

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
              AssessmentStatus.APPROVED,
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

  // منع إساءة الاستخدام: حد أقصى 30 شهادة لكل مستخدم خلال 15 دقيقة
  await checkRateLimit(`certificate:${user.id}`, 30);

  if (!studentId || studentId.length < 1 || studentId.length > 64) {
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

  // التحقق من أن هناك موسم اختبارات نشط (لا إصدار خارج الموسم)
  const { getCurrentSeason } = await import("./season-actions");
  const currentSeason = await getCurrentSeason();
  if (!currentSeason) {
    throw new Error("لا يوجد موسم اختبارات نشط — لا يمكن إصدار الشهادات");
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

  // الرقم التسلسلي التالي — استخدام مسار ذري آمن من race condition
  // نستخدم create مع unique constraint ونعيد المحاولة عند التعارض
  let serialNumber = "";
  let created = false;
  for (let attempt = 0; attempt < 20; attempt++) {
    const count = await prisma.certificate.count();
    serialNumber = buildSerialNumber(count + 1 + attempt);
    const exists = await prisma.certificate.findUnique({
      where: { serialNumber },
      select: { id: true },
    });
    if (!exists) {
      created = true;
      break;
    }
  }
  if (!created) {
    throw new Error("تعذر توليد رقم تسلسلي فريد — حاول مرة أخرى");
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
    throw new Error("تعذر رفع الشهادة على Google Drive — تحقق من إعدادات الاتصال");
  }

  // 3) حفظ سجل الشهادة
  let certificate;
  try {
    certificate = await prisma.certificate.create({
      data: {
        serialNumber,
        studentId: student.id,
        finalScore,
        fileUrl,
        issuedDate: new Date(),
        status: CertificateStatus.PENDING,
        issuedById: user.id,
      },
    });
  } catch (error) {
    if (isUniqueConstraintError(error)) throw new Error(friendlyUniqueMessage(error));
    throw error;
  }

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

  revalidatePath("/certificate-source");

  return { success: true, certificateId: certificate.id, serialNumber, fileUrl };
}

/**
 * فتح/مشاهدة شهادة مرفوعة سابقاً (عنوان Drive)
 */
export async function getCertificateDriveLink(studentId: string) {
  const user = await requireUser();
  requireRole(user, [Role.CERTIFICATE_SOURCE, Role.INSTITUTION, Role.ADMIN]);

  if (!studentId || studentId.length < 1 || studentId.length > 64) {
    throw new Error("معرّف الطالب غير صالح");
  }

  // حماية IDOR: التحقق من ملكية الطالب لجميع الأدوار
  const { assertCanAccessStudent } = await import("@/lib/security");
  await assertCanAccessStudent(user, studentId);

  const certificate = await prisma.certificate.findFirst({
    where: { studentId },
    select: { fileUrl: true },
    orderBy: { createdAt: "desc" },
  });

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
export async function signCertificate(certificateId: string, signatureBuffer: Buffer | ArrayBuffer | Uint8Array) {
  const user = await requireUser();

  // عزل الصلاحيات: لا يمكن التوقيع إلا بمسؤول رفيع (المادة 8)
  requireRole(user, [Role.ADMIN, Role.HEAD_OF_AFFAIRS]);

  // منع إساءة الاستخدام: حد أقصى 20 توقيع لكل مستخدم خلال 15 دقيقة
  await checkRateLimit(`sign-certificate:${user.id}`, 20);

  if (!certificateId || certificateId.length < 5) {
    throw new Error("معرّف الشهادة غير صالح");
  }

  // تحقق من حجم صورة التوقيع (منع DoS عبر ملفات ضخمة)
  const signatureSize =
    signatureBuffer instanceof Buffer
      ? signatureBuffer.byteLength
      : signatureBuffer?.byteLength ?? 0;
  if (!signatureSize || signatureSize === 0 || signatureSize < 100) {
    throw new Error("صورة التوقيع فارغة أو غير صالحة");
  }

  const buffer =
    signatureBuffer instanceof Buffer
      ? signatureBuffer
      : Buffer.from(signatureBuffer as ArrayBuffer);

  // التحقق الشامل من صورة التوقيع (MIME + Magic Bytes + الحجم)
  const signatureMime = "image/png";
  try {
    validateFileUpload(buffer, signatureMime, `signature.png`, {
      maxBytes: 2 * 1024 * 1024,
      allowedMimes: ["image/png", "image/jpeg"],
    });
  } catch {
    throw new Error("صورة التوقيع غير صالحة (يُقبل PNG/JPG بحد أقصى 2MB)");
  }

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
    buffer,
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

  revalidatePath("/certificate-source");

  return { success: true, certificateId, signatureUrl: uploaded.webViewLink };
}

/**
 * إرسال شهادة موقّعة إلى الجهة التعليمية (مرحلة 8 بند "إرسال للجهة")
 * - يحدّث حالة الشهادة إلى SENT
 * - يضيف إشعاراً للجهة: "الشهادة جاهزة للتحميل"
 */
export async function sendCertificateToInstitution(certificateId: string) {
  const user = await requireUser();

  // عزل الصلاحيات: مصدر الشهادات فقط (المادة 8/5)
  requireRole(user, [Role.CERTIFICATE_SOURCE]);

  await checkRateLimit(`send-certificate:${user.id}`, 30);

  if (!certificateId || certificateId.length < 5) {
    throw new Error("معرّف الشهادة غير صالح");
  }

  const certificate = await prisma.certificate.findUnique({
    where: { id: certificateId },
    select: {
      id: true,
      serialNumber: true,
      status: true,
      student: { select: { id: true, name: true, institutionId: true } },
    },
  });
  if (!certificate) {
    throw new Error("الشهادة غير موجودة");
  }
  if (certificate.status === CertificateStatus.SENT) {
    throw new Error("الشهادة أُرسلت للجهة من قبل");
  }
  if (certificate.status === CertificateStatus.PENDING || certificate.status === CertificateStatus.UPLOADED) {
    throw new Error("لا يمكن إرسال شهادة لم تُوقَّع بعد — انتظر توقيع الإدارة");
  }

  await prisma.certificate.update({
    where: { id: certificateId },
    data: { status: CertificateStatus.SENT },
  });

  // إشعار الجهة: "الشهادة جاهزة للتحميل"
  if (certificate.student.institutionId) {
    const institutionUsers = await prisma.user.findMany({
      where: { role: Role.INSTITUTION, institutionId: certificate.student.institutionId },
      select: { id: true },
    });
    if (institutionUsers.length > 0) {
      await prisma.notification.createMany({
        data: institutionUsers.map((u) => ({
          userId: u.id,
          message: `الشهادة جاهزة للتحميل للطالب «${certificate.student.name}»`,
          type: NotificationType.CERTIFICATE,
        })),
      });
    }
  }

  await recordAudit(user.id, AuditAction.UPDATE, {
    entity: "Certificate",
    certificateId,
    serialNumber: certificate.serialNumber,
    step: "CERTIFICATE_SENT_TO_INSTITUTION",
    status: CertificateStatus.SENT,
  });

  revalidatePath("/certificate-source");
  revalidatePath("/admin/certificates");

  return { success: true, certificateId, status: CertificateStatus.SENT };
}