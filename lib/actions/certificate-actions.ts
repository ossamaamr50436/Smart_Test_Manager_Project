"use server";

import { requireUser, requireRole, getActorTenantId, requireTenantId } from "@/lib/security";
import { getTenantFilter, assertSameTenant } from "@/lib/tenancy";
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
import { uploadFile, deleteFile, isTrustedStoredUrl, isValidFileKey } from "@/lib/file-storage";
import {
  isUniqueConstraintError,
  friendlyUniqueMessage,
} from "@/lib/actions/unique-guard";
import { getPlatformSettings } from "@/lib/actions/settings-actions";
import {
  downloadTemplateBytes,
  fillPdfTemplate,
} from "@/lib/certificate-template";
import { checkRateLimit } from "@/lib/rate-limit";
import { validateFileUpload } from "@/lib/upload-security";

// ============================================================
// نظام إصدار الشهادات (القسم 8)
// - عزل الصلاحيات: مصدر الشهادات فقط (المادة 8/5)
// - الملفات: تُرفع حصراً على وحدة التخزين (UploadThing)
// ============================================================

/** تسجيل حدث في Audit Log */
async function recordAudit(userId: string, action: AuditAction, details: unknown) {
  const tenantId = await getActorTenantId(userId);
  await prisma.auditLog.create({
    data: { userId, action, details: JSON.stringify(details), tenantId },
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

// Legacy: النظام لا يُولِّد الشهادات — استخدام createCertificateFromUpload بدلاً منها.
/**
 * إصدار شهادة لطالب جاهز (READY_FOR_CERTIFICATE)
 * - يولّد PDF جديداً
 * - يرفعه على وحدة التخزين (UploadThing)
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
      tenantId: true,
      institution: { select: { name: true } },
    },
  });

  if (!student) {
    throw new Error("الطالب غير موجود");
  }
  assertSameTenant(user, student);

  // التحقق من أن هناك موسم اختبارات نشط (لا إصدار خارج الموسم)
  const { getCurrentSeason } = await import("./season-actions");
  const currentSeason = await getCurrentSeason();
  if (!currentSeason) {
    throw new Error("لا يوجد موسم اختبارات نشط — لا يمكن إصدار الشهادات");
  }

  // منع التكرار: لا يوجد سوى شهادة واحدة لكل طالب.
  // يُفحص التكرار قبل المرحلة حتى تصل رسالة دقيقة لمن يعيد الإصدار
  // (بعد الإصدار الأول تصبح حالة الطالب CERTIFICATE_ISSUED).
  const existing = await prisma.certificate.findFirst({
    where: { ...getTenantFilter(user), studentId },
    select: { id: true },
  });
  if (existing) {
    throw new Error("عُدّلت شهادة لهذا الطالب مسبقاً");
  }

  // المرحلة الصحيحة فقط: جاهز لإصدار الشهادة
  if (student.status !== StudentStatus.READY_FOR_CERTIFICATE) {
    throw new Error(
      "الطالب لم يصل لمرحلة إصدار الشهادة بعد (الحالة الحالية للمراحل السابقة)"
    );
  }

  const finalScore = await getStudentFinalScore(student.id);
  if (finalScore === null) {
    throw new Error("لا توجد درجة نهائية معتمدة لهذا الطالب");
  }

  // الرقم التسلسلي: التفرّد يضمنه قيد serialNumber الفريد في قاعدة البيانات،
  // لا الفحص المسبق (race condition بين إصدارين متزامنين). لذلك: محاولة ->
  // PDF -> رفع -> insert، وعند تعارض الترقيم يُحذف الملف المرفوع وتُعاد
  // المحاولة برقم آخر.
  const tenantFilter = getTenantFilter(user);
  const maxSerialAttempts = 5;
  let serialNumber = "";
  let fileUrl = "";
  let certificate = null;

  for (let attempt = 0; attempt < maxSerialAttempts; attempt++) {
    const issuedCount = await prisma.certificate.count({ where: tenantFilter });
    serialNumber = buildSerialNumber(issuedCount + 1 + attempt);

    // 1) توليد PDF (وضع القالب الذكي أو الافتراضي)
    const settings = await getPlatformSettings();
    let pdfBuffer: Buffer;

    if (settings.useTemplateMode && settings.templateFileId) {
      // القالب الذكي: تحميل القالب من وحدة التخزين وتعبئته
      const templateBytes = await downloadTemplateBytes(settings.templateFileId);
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
        organizationName: student.institution?.name,
      });
    }

    // 2) رفع الشهادة على وحدة تخزين المستأجر (UploadThing برمز المستأجر)
    let uploadedFileId = "";
    try {
      const tenantUpload = await prisma.tenant.findUnique({
        where: { id: requireTenantId(user) },
        select: { uploadthingToken: true },
      });
      const uploaded = await uploadFile(
        pdfBuffer,
        `${serialNumber}-${student.name}.pdf`,
        "application/pdf",
        { token: tenantUpload?.uploadthingToken }
      );
      fileUrl = uploaded.url;
      uploadedFileId = uploaded.fileId;
    } catch (uploadError) {
      // عدم توفر إعدادات التخزين يمنع إتمام الإصدار — لا نخزن الملف محلياً
      throw new Error("تعذر رفع الشهادة على وحدة التخزين — تحقق من الإعدادات");
    }

    // 3) حفظ سجل الشهادة — القيد الفريد هو الحَكَم النهائي
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
          tenantId: requireTenantId(user),
        },
      });
      break;
    } catch (error) {
      if (!isUniqueConstraintError(error)) throw error;
      // تعارض ترقيم مع إصدار متزامن: نظّف الملف المرفوع ثم أعد المحاولة
      try {
        await deleteFile(uploadedFileId);
      } catch {
        // فشل التنظيف لا يفسد المحاولة التالية
      }
      fileUrl = "";
      if (attempt === maxSerialAttempts - 1) {
        throw new Error("تعذر حجز رقم تسلسلي فريد — أعد المحاولة بعد قليل");
      }
    }
  }

  if (!certificate) {
    throw new Error("تعذر حجز رقم تسلسلي فريد — أعد المحاولة بعد قليل");
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
        message: `صدرت شهادة الطالب «${student.name}» وتم رفعها على وحدة التخزين`,
        type: NotificationType.CERTIFICATE,
        tenantId: requireTenantId(user),
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
 * إنشاء سجل شهادة من ملف PDF رُفع فعلياً من مصدر الشهادات.
 *
 * النظام وسيط إرسال: الشهادة تُصدر خارجياً عن الجمعية، فيرفعها
 * مصدر الشهادات هنا، فتُسجَّل بحالة UPLOADED مباشرة (لأن الملف موجود فوراً).
 *
 * - لا يولّد النظام أي PDF
 * - يمنع التكرار: شهادة واحدة لكل طالب
 * - يحدّث حالة الطالب إلى CERTIFICATE_ISSUED
 */
export async function createCertificateFromUpload(input: {
  studentId: string;
  url: string;
  fileId: string;
}): Promise<
  | { success: true; certificateId: string; serialNumber: string }
  | { success: false; error: string }
> {
  const user = await requireUser();

  // عزل الصلاحيات: مصدر الشهادات فقط (المادة 8/5)
  requireRole(user, [Role.CERTIFICATE_SOURCE]);

  await checkRateLimit(`create-certificate:${user.id}`, 30);

  if (!input?.studentId || input.studentId.length < 1 || input.studentId.length > 64) {
    return { success: false, error: "معرّف الطالب غير صالح" };
  }

  // الملف المرفوع يجب أن يكون على وحدة تخزين موثوقة (منع تخزين روابط خارجية)
  if (!isTrustedStoredUrl(input.url) || !isValidFileKey(input.fileId)) {
    return { success: false, error: "الرابط المرفوع غير موثوق — أعد رفع الملف" };
  }

  const student = await prisma.student.findUnique({
    where: { id: input.studentId },
    select: { id: true, name: true, status: true, tenantId: true },
  });
  if (!student) {
    return { success: false, error: "الطالب غير موجود" };
  }
  assertSameTenant(user, student);

  // المرحلة الصحيحة فقط: جاهز لإصدار الشهادة
  if (student.status !== StudentStatus.READY_FOR_CERTIFICATE) {
    return {
      success: false,
      error: "الطالب لم يصل لمرحلة إصدار الشهادة بعد (الحالة الحالية للمراحل السابقة)",
    };
  }

  // منع التكرار: شهادة واحدة فقط لكل طالب
  const existing = await prisma.certificate.findFirst({
    where: { ...getTenantFilter(user), studentId: student.id },
    select: { id: true },
  });
  if (existing) {
    return { success: false, error: "عُدّلت شهادة لهذا الطالب مسبقاً" };
  }

  const finalScore = await getStudentFinalScore(student.id);
  if (finalScore === null) {
    return { success: false, error: "لا توجد درجة نهائية معتمدة لهذا الطالب" };
  }

  // الرقم التسلسلي: قيد serialNumber الفريد في قاعدة البيانات هو الحَكَم
  // النهائي، فالمحاولة تكرّر عند التصادم بدل الفحص المسبق (race condition).
  const tenantFilter = getTenantFilter(user);
  const maxSerialAttempts = 5;
  let certificateId = "";
  let serialNumber = "";

  for (let attempt = 0; attempt < maxSerialAttempts; attempt++) {
    const issuedCount = await prisma.certificate.count({ where: tenantFilter });
    const candidate = buildSerialNumber(issuedCount + 1 + attempt);

    try {
      const created = await prisma.certificate.create({
        data: {
          serialNumber: candidate,
          studentId: student.id,
          finalScore,
          fileUrl: input.url,
          fileId: input.fileId,
          issuedDate: new Date(),
          status: CertificateStatus.UPLOADED,
          issuedById: user.id,
          tenantId: requireTenantId(user),
        },
      });
      certificateId = created.id;
      serialNumber = created.serialNumber;
      break;
    } catch (error) {
      if (!isUniqueConstraintError(error)) throw error;
      if (attempt === maxSerialAttempts - 1) {
        return { success: false, error: "تعذر حجز رقم تسلسلي فريد — أعد المحاولة بعد قليل" };
      }
    }
  }

  if (!certificateId) {
    return { success: false, error: "تعذر حجز رقم تسلسلي فريد — أعد المحاولة بعد قليل" };
  }

  // تحديث حالة الطالب
  await prisma.student.update({
    where: { id: student.id },
    data: { status: StudentStatus.CERTIFICATE_ISSUED },
  });

  // سجل التدقيق
  await recordAudit(user.id, AuditAction.CREATE, {
    entity: "Certificate",
    certificateId,
    studentId: student.id,
    serialNumber,
    source: "upload",
  });

  revalidatePath("/certificate-source");

  return { success: true, certificateId, serialNumber };
}

/**
 * فتح/مشاهدة شهادة مرفوعة سابقاً (رابط الملف)
 */
export async function getCertificateFileLink(studentId: string) {
  const user = await requireUser();
  requireRole(user, [Role.CERTIFICATE_SOURCE, Role.INSTITUTION, Role.ADMIN]);

  if (!studentId || studentId.length < 1 || studentId.length > 64) {
    throw new Error("معرّف الطالب غير صالح");
  }

  // حماية IDOR: التحقق من ملكية الطالب لجميع الأدوار
  const { assertCanAccessStudent } = await import("@/lib/security");
  await assertCanAccessStudent(user, studentId);

  const certificate = await prisma.certificate.findFirst({
    where: { ...getTenantFilter(user), studentId },
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
    where: { ...getTenantFilter(user), status: CertificateStatus.PENDING },
    orderBy: { createdAt: "desc" },
    take: 100,
    include: {
      student: { select: { name: true, branch: true } },
    },
  });
}

/**
 * توقيع الشهادة (المادة 8/6)
 *
 * يرفع صورة التوقيع الرقمي على وحدة التخزين ثم يحدّث سجل الشهادة
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
    select: { id: true, serialNumber: true, status: true, tenantId: true },
  });
  if (!certificate) {
    throw new Error("الشهادة غير موجودة");
  }
  assertSameTenant(user, certificate);
  if (certificate.status === CertificateStatus.SIGNED) {
    throw new Error("الشهادة موقّعة بالفعل");
  }

  // رفع صورة التوقيع على وحدة تخزين المستأجر (UploadThing برمز المستأجر)
  const tenantUpload = await prisma.tenant.findUnique({
    where: { id: certificate.tenantId },
    select: { uploadthingToken: true },
  });
  const uploaded = await uploadFile(
    buffer,
    `signature-${certificate.serialNumber}.png`,
    "image/png",
    { token: tenantUpload?.uploadthingToken }
  );

  await prisma.certificate.update({
    where: { id: certificateId },
    data: {
      signatureUrl: uploaded.url || uploaded.fileId,
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

  return { success: true, certificateId, signatureUrl: uploaded.url };
}

/**
 * ربط ملف شهادة مرفوع من الواجهة (UploadThing) بسجل شهادة — CERTIFICATE_SOURCE فقط
 * - مطلوب: رابط موثوق (isTrustedStoredUrl) + معرّف ملف صالح (isValidFileKey)
 * - يرفع حالة الشهادة إلى UPLOADED دون تغيير حالة التوقيع
 */
export async function attachCertificateFile(input: {
  certificateId: string;
  url: string;
  fileId: string;
}) {
  const user = await requireUser();

  // عزل الصلاحيات: مصدر الشهادات فقط (المادة 8/5)
  requireRole(user, [Role.CERTIFICATE_SOURCE]);

  await checkRateLimit(`attach-certificate:${user.id}`, 30);

  if (!input.certificateId || input.certificateId.length < 5) {
    throw new Error("معرّف الشهادة غير صالح");
  }
  if (!isTrustedStoredUrl(input.url) || !isValidFileKey(input.fileId)) {
    throw new Error("الرابط المرفوع غير موثوق — أعد رفع الملف");
  }

  const certificate = await prisma.certificate.findUnique({
    where: { id: input.certificateId },
    select: { id: true, serialNumber: true, status: true, tenantId: true, fileId: true },
  });
  if (!certificate) {
    throw new Error("الشهادة غير موجودة");
  }
  assertSameTenant(user, certificate);

  // حذف الملف القديم إن وُجد لتجنب تراكم الملفات
  if (certificate.fileId && certificate.fileId !== input.fileId) {
    try {
      await deleteFile(certificate.fileId);
    } catch {
      // استمرار في الربط حتى لو فشل حذف القديم
    }
  }

  await prisma.certificate.update({
    where: { id: input.certificateId },
    data: {
      fileUrl: input.url,
      fileId: input.fileId,
      issuedDate: new Date(),
      status: CertificateStatus.UPLOADED,
    },
  });

  await recordAudit(user.id, AuditAction.UPDATE, {
    entity: "Certificate",
    certificateId: input.certificateId,
    serialNumber: certificate.serialNumber,
    fileId: input.fileId,
    step: "CERTIFICATE_FILE_UPLOADED",
    status: CertificateStatus.UPLOADED,
  });

  revalidatePath("/certificate-source");

  return { success: true, certificateId: input.certificateId, url: input.url };
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
      tenantId: true,
      student: { select: { id: true, name: true, institutionId: true } },
    },
  });
  if (!certificate) {
    throw new Error("الشهادة غير موجودة");
  }
  assertSameTenant(user, certificate);
  if (certificate.status === CertificateStatus.SENT) {
    throw new Error("الشهادة أُرسلت للجهة من قبل");
  }
  // الإرسال مسموح بعد رفع الملف الفعلي (UPLOADED) أو بعد التوقيع (SIGNED
  // للتوافق مع المسار القديم) — قائمة سماح لا قائمة منع، حتى لا تُرسل أي
  // حالة أخرى تُضاف لاحقاً إلى التعداد بالخطأ.
  if (
    certificate.status !== CertificateStatus.UPLOADED &&
    certificate.status !== CertificateStatus.SIGNED
  ) {
    throw new Error("لا يمكن إرسال شهادة لم يُرفع ملفها — ارفع ملف الشهادة أولاً");
  }

  await prisma.certificate.update({
    where: { id: certificateId },
    data: {
      status: CertificateStatus.SENT,
      sentAt: new Date(),
    },
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
          tenantId: requireTenantId(user),
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