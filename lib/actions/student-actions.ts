"use server";

import { requireUser, requireRole, assertInstitutionOwnsStudent, getActorTenantId, requireTenantId } from "@/lib/security";
import { getTenantFilter, assertSameTenant } from "@/lib/tenancy";
import { prisma } from "@/lib/prisma";
import { Role, StudentStatus, NotificationType, AuditAction } from "@prisma/client";
import { revalidatePath } from "next/cache";
import { uniq, size } from "lodash";
import {
  studentApplicationSchema,
  committeeSchema,
  type StudentApplicationInput,
  type CommitteeInput,
  type ReviewDecision,
} from "@/lib/validations/student";
import { getCurrentSeason } from "./season-actions";
import { checkRateLimit } from "@/lib/rate-limit";
import { getPlatformSettings } from "./settings-actions";
import { uploadFileToDriveFolder, ensureDriveFolder } from "@/lib/google-drive";
import { validateFileUpload } from "@/lib/upload-security";

/**
 * تسجيل حدث في Audit Log
 * (تتبع الشفافية — كل قرار موثّق)
 */
async function recordAudit(userId: string, action: AuditAction, details: unknown) {
  const tenantId = await getActorTenantId(userId);
  await prisma.auditLog.create({
    data: {
      userId,
      action,
      details: JSON.stringify(details),
      tenantId,
    },
  });
}

export type CreateStudentApplicationResult =
  | { success: true; studentId: string }
  | { success: false; error: string };

/**
 * 1) ترشيح طالب جديد — خاص بالجهة التعليمية
 * - يقبل الطالب تلقائياً بربط institutionId بالجهة المرتبطة بحساب المستخدم
 * - الحالة PENDING + إشعار لأخصائي الاختبارات
 * - يرفع نموذج الاختبار الممسوح (PDF) إلى مجلد الجهة على Google Drive
 *   عند تفعيل الإعداد العام requireStudentApplicationFile
 */
export async function createStudentApplication(
  input: StudentApplicationInput,
  applicationFile?: {
    buffer: ArrayBuffer;
    fileName: string;
    mimeType: string;
  }
): Promise<CreateStudentApplicationResult> {
  let user;
  try {
    user = await requireUser();

    // عزل الصلاحيات: الجهة التعليمية فقط
    requireRole(user, [Role.INSTITUTION]);
  } catch {
    return { success: false, error: "غير مصرح — يجب تسجيل الدخول بحساب جهة تعليمية" };
  }
  if (!user.institutionId) {
    return { success: false, error: "حساب الجهة غير مرتبط بمؤسسة تعليمية" };
  }

  // منع إساءة الاستخدام: حد أقصى 20 طالب لكل جهة خلال 15 دقيقة
  try {
    await checkRateLimit(`student-create:${user.id}`, 20);
  } catch (e) {
    return {
      success: false,
      error: e instanceof Error ? e.message : "تم تجاوز حد الطلبات المسموح، حاول لاحقاً",
    };
  }

  // التحقق من صحة البيانات
  const parsed = studentApplicationSchema.safeParse(input);
  if (!parsed.success) {
    return { success: false, error: parsed.error.issues[0]?.message ?? "بيانات غير صحيحة" };
  }
  const data = parsed.data;

  // إعدادات المنصة: هل رفع نموذج اختبار الطالب إجباري؟
  let settings;
  try {
    settings = await getPlatformSettings();
  } catch {
    return { success: false, error: "تعذر تحميل إعدادات المنصة — حاول مرة أخرى" };
  }
  const requireFile = settings.requireStudentApplicationFile;

  let applicationFileId: string | null = null;
  let applicationFileUrl: string | null = null;

  if (requireFile || applicationFile) {
    if (!applicationFile) {
      return { success: false, error: "يجب رفع نموذج اختبار الطالب (PDF) لإكمال الترشيح" };
    }

    // التحقق من أن الملف PDF فعلياً وبحد أقصى للحجم (OWASP — منع DoS)
    const buffer = Buffer.from(applicationFile.buffer);
    try {
      validateFileUpload(buffer, applicationFile.mimeType, applicationFile.fileName, {
        maxBytes: 20 * 1024 * 1024,
        allowedMimes: ["application/pdf"],
      });
    } catch {
      return { success: false, error: "نموذج الاختبار يجب أن يكون ملف PDF (الحد الأقصى 20MB)" };
    }

    // مجلد خاص بالجهة داخل مجلد الجذر (يُنشأ عند الحاجة)
    let institution;
    try {
      institution = await prisma.institution.findUnique({
        where: { id: user.institutionId },
        select: { name: true },
      });
    } catch {
      return { success: false, error: "تعذر قراءة بيانات الجهة — حاول مرة أخرى" };
    }
    if (!institution) {
      return { success: false, error: "الجهة التعليمية غير موجودة" };
    }

    try {
      const folderId = await ensureDriveFolder(institution.name);
      const uploaded = await uploadFileToDriveFolder(
        buffer,
        `نموذج اختبار الطالب (${data.name}).pdf`,
        "application/pdf",
        folderId
      );
      applicationFileId = uploaded.fileId;
      applicationFileUrl = uploaded.webViewLink;
    } catch (error) {
      return {
        success: false,
        error:
          error instanceof Error
            ? error.message
            : "تعذر رفع نموذج الاختبار على Google Drive — حاول مرة أخرى",
      };
    }
  }

  let student;
  try {
    student = await prisma.student.create({
      data: {
        name: data.name,
        age: data.age,
        branch: data.branch,
        nationality: data.nationality,
        teacherName: data.teacherName,
        parentPhone: data.parentPhone,
        address: data.address ?? null,
        phone: data.phone ?? null,
        status: StudentStatus.PENDING,
        institutionId: user.institutionId,
        applicationFileId,
        applicationFileUrl,
        tenantId: requireTenantId(user),
      },
    });
  } catch {
    return { success: false, error: "حدث خطأ غير متوقع أثناء حفظ الطلب — أعد المحاولة" };
  }

  // إشعار بالأخصائي (قد يكون أكثر من أخصائي) — فشل الإشعار لا يمنع حفظ الطلب
  try {
    const specialists = await prisma.user.findMany({
      where: { ...getTenantFilter(user), role: Role.TEST_SPECIALIST },
      select: { id: true },
    });

    if (size(specialists) > 0) {
      await prisma.notification.createMany({
        data: specialists.map((s) => ({
          userId: s.id,
          message: `طلب ترشيح جديد للطالب «${student.name}» بانتظار المراجعة`,
          type: NotificationType.RECRUITMENT,
          tenantId: requireTenantId(user),
        })),
      });
    }
  } catch {
    // غير حاسم — الطلب محفوظ بالفعل
  }

  try {
    await recordAudit(user.id, AuditAction.CREATE, {
      entity: "Student",
      studentId: student.id,
      name: student.name,
    });
  } catch {
    // فشل سجل التدقيق لا يمنع النجاح
  }

  revalidatePath("/test-specialist/requests");

  return { success: true, studentId: student.id };
}

/**
 * 2) مراجعة طلب الترشيح (قبول/رفض) — خاص بأخصائي الاختبارات
 * - تحدث حالة الطالب + إشعار للجهة بالنتيجة
 */
export async function reviewStudentApplication(studentId: string, decision: ReviewDecision) {
  const user = await requireUser();

  // عزل الصلاحيات: الأخصائي أو المسؤول (المهمة C)
  requireRole(user, [Role.TEST_SPECIALIST, Role.ADMIN]);

  const student = await prisma.student.findUnique({
    where: { id: studentId },
    select: { id: true, name: true, institutionId: true, status: true, tenantId: true },
  });

  if (!student) {
    throw new Error("الطالب غير موجود");
  }
  assertSameTenant(user, student);

  // منع مراجعة طالب تم مراجعته مسبقاً (يجب أن يكون بحالة PENDING فقط)
  if (student.status !== StudentStatus.PENDING) {
    throw new Error("لا يمكن مراجعة طلب تم معالجته مسبقاً");
  }

  // نص السبب الثابت (حالياً)
  const reason =
    decision === "APPROVED"
      ? "تم قبول الترشيح من قبل أخصائي الاختبارات"
      : "تم رفض الترشيح لعدم اكتمال البيانات المطلوبة";

  const status = decision === "APPROVED" ? StudentStatus.APPROVED : StudentStatus.REJECTED;

  await prisma.student.update({
    where: { id: studentId },
    data: {
      status,
      approvedAt: decision === "APPROVED" ? new Date() : undefined,
    },
  });

  // إشعار الجهة بالنتيجة
  const institutionUsers = await prisma.user.findMany({
    where: { role: Role.INSTITUTION, institutionId: student.institutionId },
    select: { id: true },
  });

  if (institutionUsers.length > 0) {
    await prisma.notification.createMany({
      data: institutionUsers.map((u) => ({
        userId: u.id,
        message:
          decision === "APPROVED"
            ? `تم قبول ترشيح الطالب «${student.name}»`
            : `تم رفض ترشيح الطالب «${student.name}». السبب: ${reason}`,
        type: NotificationType.APPROVAL,
        tenantId: requireTenantId(user),
      })),
    });
  }

  await recordAudit(user.id, AuditAction.APPROVE, {
    studentId,
    decision,
    reason,
  });

  revalidatePath("/test-specialist/requests");
  revalidatePath("/test-specialist/committees");

  return { success: true, status };
}

/**
 * 3) تشكيل لجنة (جلسة اختبار) وتوزيع الطالب — خاص بأخصائي الاختبارات
 * - ينشئ ExamSession + تغيير حالة الطالب إلى ASSIGNED + إشعارات للمعلمين والجهة
 */
export async function assignCommittee(input: CommitteeInput) {
  const user = await requireUser();

  // عزل الصلاحيات: الأخصائي أو المسؤول (المهمة C)
  requireRole(user, [Role.TEST_SPECIALIST, Role.ADMIN]);

  const parsed = committeeSchema.safeParse(input);
  if (!parsed.success) {
    throw new Error(parsed.error.issues[0]?.message ?? "بيانات غير صحيحة");
  }
  const data = parsed.data;

  if (data.teacher1Id === data.teacher2Id) {
    throw new Error("لا يمكن اختيار المعلم نفسه في المعلمين الأول والثاني");
  }

  // التحقق من أن المعلمين موجودان
  const teachers = await prisma.user.findMany({
    where: { ...getTenantFilter(user), id: { in: [data.teacher1Id, data.teacher2Id] } },
    select: { id: true, role: true },
  });

  if (teachers.length !== 2) {
    throw new Error("أحد المعلمين غير موجود");
  }

  for (const t of teachers) {
    if (t.role !== Role.EXAMINER) {
      throw new Error("يجب أن يكون كل من المعلمين بدور EXAMINER");
    }
  }

  const student = await prisma.student.findUnique({
    where: { id: data.studentId },
    select: { id: true, name: true, status: true, institutionId: true, tenantId: true },
  });

  if (!student) {
    throw new Error("الطالب غير موجود");
  }
  assertSameTenant(user, student);
  if (student.status !== StudentStatus.APPROVED) {
    throw new Error("يجب أن يكون الطالب بحالة APPROVED قبل توزيعه على لجنة");
  }

  const examDate = new Date(data.examDate);
  if (Number.isNaN(examDate.getTime())) {
    throw new Error("تاريخ الاختبار غير صحيح");
  }

  // التحقق أن تاريخ الاختبار في المستقبل
  const now = new Date();
  if (examDate <= now) {
    throw new Error("تاريخ الاختبار يجب أن يكون في المستقبل");
  }

  // التحقق من عدم تضارب مواعيد المعلمين (نفس المعلم في لجنتين بنفس الوقت)
  const conflicting = await prisma.examSession.findFirst({
    where: {
      ...getTenantFilter(user),
      examDate,
      OR: [
        { teacher1Id: data.teacher1Id },
        { teacher2Id: data.teacher1Id },
        { teacher1Id: data.teacher2Id },
        { teacher2Id: data.teacher2Id },
      ],
    },
  });
  if (conflicting) {
    throw new Error("تضارب في مواعيد أحد المعلمين في نفس التاريخ");
  }

  // الموسم النشط الحالي (المادة 6)
  const season = await getCurrentSeason();
  if (!season) {
    throw new Error("لا يوجد موسم اختبارات نشط حالياً — يجب تفعيل موسم أولاً");
  }
  const seasonId = season.id;

  // منع التوزيع المزدوج لنفس الطالب (حماية ذرّية ضد Race Condition)
  // نستخدم updateMany بشرط الحالة APPROVED داخل معاملة — إن لم يحدّث أي صف
  // فهذا يعني أن الطالب لم يعد APPROVED (مُوزّع أو غيّرت حالته) → نرفض.
  const session = await prisma.$transaction(async (tx) => {
    const updated = await tx.student.updateMany({
      where: { id: data.studentId, status: StudentStatus.APPROVED },
      data: { status: StudentStatus.ASSIGNED, assignedAt: new Date() },
    });

    if (updated.count !== 1) {
      throw new Error("تعذر توزيع الطالب: يجب أن يكون بحالة APPROVED ولم يُوزَّع مسبقاً");
    }

    return tx.examSession.create({
      data: {
        studentId: data.studentId,
        teacher1Id: data.teacher1Id,
        teacher2Id: data.teacher2Id,
        examDate,
        period: data.period,
        status: "SCHEDULED",
        seasonId,
        tenantId: requireTenantId(user),
      },
    });
  });

  // إشعارات للمعلمين والجهة
  const institutionUsers = await prisma.user.findMany({
    where: { role: Role.INSTITUTION, institutionId: student.institutionId },
    select: { id: true },
  });

  const recipients = [
    data.teacher1Id,
    data.teacher2Id,
    ...institutionUsers.map((u) => u.id),
  ];

  const message =
    `تم تحديد جلسة اختبار للطالب «${student.name}» بتاريخ ${examDate.toLocaleDateString(
      "ar-SA"
    )} — الفترة ${data.period}`;

  await prisma.notification.createMany({
    data: uniq(recipients).map((userId) => ({
      userId,
      message,
      type: NotificationType.SCHEDULE,
      examSessionId: session.id,
      tenantId: requireTenantId(user),
    })),
  });

  await recordAudit(user.id, AuditAction.CREATE, {
    entity: "ExamSession",
    sessionId: session.id,
    studentId: data.studentId,
    teacher1Id: data.teacher1Id,
    teacher2Id: data.teacher2Id,
    examDate: data.examDate,
    seasonId,
  });

  revalidatePath("/test-specialist/committees");
  revalidatePath("/test-specialist/requests");
  revalidatePath("/examiner");

  return { success: true, sessionId: session.id };
}

/**
 * ترشيح طالب من قبل أخصائي الاختبارات — يختار الجهة المرجعية
 * الحالة تبدأ PENDING ثم تُعتمد مباشرة (الأخصائي هو المُراجع الأصلي)
 */
export async function createStudentApplicationBySpecialist(
  input: StudentApplicationInput & { institutionId: string },
  applicationFile?: {
    buffer: ArrayBuffer;
    fileName: string;
    mimeType: string;
  }
): Promise<CreateStudentApplicationResult> {
  let user;
  try {
    user = await requireUser();
    requireRole(user, [Role.TEST_SPECIALIST, Role.ADMIN]);
  } catch {
    return { success: false, error: "غير مصرح — يجب أن تكون أخصائي اختبارات أو أدمن" };
  }

  try {
    await checkRateLimit(`specialist-nominate:${user.id}`, 20);
  } catch (e) {
    return {
      success: false,
      error: e instanceof Error ? e.message : "تم تجاوز حد الطلبات المسموح، حاول لاحقاً",
    };
  }

  const parsed = studentApplicationSchema.safeParse(input);
  if (!parsed.success) {
    return { success: false, error: parsed.error.issues[0]?.message ?? "بيانات غير صحيحة" };
  }
  const data = parsed.data;

  if (!input.institutionId) {
    return { success: false, error: "اختر الجهة التعليمية" };
  }

  const institution = await prisma.institution.findUnique({
    where: { id: input.institutionId },
    select: { id: true, name: true, tenantId: true },
  });
  if (!institution || institution.tenantId !== requireTenantId(user)) {
    return { success: false, error: "الجهة التعليمية غير موجودة أو لا تنتمي لمؤسستك" };
  }

  const settings = await getPlatformSettings();
  const requireFile = settings.requireStudentApplicationFile;

  let applicationFileId: string | null = null;
  let applicationFileUrl: string | null = null;

  if (requireFile || applicationFile) {
    if (!applicationFile) {
      return { success: false, error: "يجب رفع نموذج اختبار الطالب (PDF) لإكمال الترشيح" };
    }
    const buffer = Buffer.from(applicationFile.buffer);
    try {
      validateFileUpload(buffer, applicationFile.mimeType, applicationFile.fileName, {
        maxBytes: 20 * 1024 * 1024,
        allowedMimes: ["application/pdf"],
      });
    } catch {
      return { success: false, error: "نموذج الاختبار يجب أن يكون ملف PDF (الحد الأقصى 20MB)" };
    }
    try {
      const folderId = await ensureDriveFolder(institution.name);
      const uploaded = await uploadFileToDriveFolder(
        buffer,
        `نموذج اختبار الطالب (${data.name}).pdf`,
        "application/pdf",
        folderId
      );
      applicationFileId = uploaded.fileId;
      applicationFileUrl = uploaded.webViewLink;
    } catch (error) {
      return {
        success: false,
        error:
          error instanceof Error
            ? error.message
            : "تعذر رفع نموذج الاختبار على Google Drive — حاول مرة أخرى",
      };
    }
  }

  let student;
  try {
    student = await prisma.$transaction(async (tx) => {
      const created = await tx.student.create({
        data: {
          name: data.name,
          age: data.age,
          branch: data.branch,
          nationality: data.nationality,
          teacherName: data.teacherName,
          parentPhone: data.parentPhone,
          address: data.address ?? null,
          phone: data.phone ?? null,
          status: StudentStatus.APPROVED,
          approvedAt: new Date(),
          institutionId: input.institutionId,
          submittedById: user.id,
          applicationFileId,
          applicationFileUrl,
          tenantId: requireTenantId(user),
        },
      });
      return created;
    });
  } catch {
    return { success: false, error: "حدث خطأ غير متوقع أثناء حفظ الطلب — أعد المحاولة" };
  }

  try {
    const institutionUsers = await prisma.user.findMany({
      where: { role: Role.INSTITUTION, institutionId: input.institutionId },
      select: { id: true },
    });
    if (size(institutionUsers) > 0) {
      await prisma.notification.createMany({
        data: institutionUsers.map((u) => ({
          userId: u.id,
          message: `تم ترشيح الطالب «${student.name}» من قبل أخصائي الاختبارات — جاهز للتوزيع على لجنة`,
          type: NotificationType.RECRUITMENT,
          tenantId: requireTenantId(user),
        })),
      });
    }
  } catch {
    // غير حاسم
  }

  try {
    await recordAudit(user.id, AuditAction.CREATE, {
      entity: "Student",
      studentId: student.id,
      name: student.name,
      source: "specialist_nomination",
      institutionId: input.institutionId,
    });
  } catch {
    // فشل سجل التدقيق لا يمنع النجاح
  }

  revalidatePath("/test-specialist/requests");
  revalidatePath("/test-specialist/committees");
  revalidatePath("/institution");
  revalidatePath("/admin/students");

  return { success: true, studentId: student.id };
}