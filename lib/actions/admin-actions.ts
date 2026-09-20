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
} from "@prisma/client";
import { revalidatePath } from "next/cache";

/**
 * تسجيل حدث في Audit Log (شفافية كل قرار)
 */
async function recordAudit(userId: string, action: AuditAction, details: unknown) {
  const tenantId = await getActorTenantId(userId);
  await prisma.auditLog.create({
    data: { userId, action, details: JSON.stringify(details), tenantId },
  });
}

/**
 * 1) الاعتماد الإداري — أخصائي الاختبارات
 * - عزل الصلاحيات: لا ينفذها إلا مستخدم بدور TEST_SPECIALIST.
 * - يحوّل الطالب المكتمل (COMPLETED) إلى NOTIFIED.
 * - يحدّث تقييماته المعتمدة من المختبرين إلى ACCEPTED ويرسل إشعاراً لرئيس الشؤون التعليمية.
 */
export async function specialistFinalApprove(
  studentId: string,
  overrideScore?: number | null
) {
  const user = await requireUser();

  // عزل الصلاحيات: الأخصائي أو المسؤول (المهمة C)
  requireRole(user, [Role.TEST_SPECIALIST, Role.ADMIN]);

  if (!studentId || typeof studentId !== "string" || studentId.length < 1 || studentId.length > 64) {
    throw new Error("معرّف الطالب غير صالح");
  }

  // درجة نهائية معدّلة اختيارية (B5): تعديل تحت السيطرة وحفظ الأثر في سجل التدقيق
  let finalOverride: number | null = null;
  if (overrideScore !== undefined && overrideScore !== null) {
    if (typeof overrideScore !== "number" || !Number.isFinite(overrideScore)) {
      throw new Error("الدرجة المعدّلة غير صحيحة");
    }
    if (overrideScore < 0 || overrideScore > 100) {
      throw new Error("الدرجة المعدّلة يجب أن تكون بين 0 و 100");
    }
    finalOverride = Math.round(overrideScore * 10) / 10;
  }

  const student = await prisma.student.findUnique({
    where: { id: studentId },
    select: { id: true, name: true, status: true, institutionId: true, tenantId: true },
  });
  if (!student) {
    throw new Error("الطالب غير موجود");
  }
  assertSameTenant(user, student);
  if (student.status !== StudentStatus.COMPLETED) {
    throw new Error("الطالب لم يُقيَّم من قبل المختبرين بعد");
  }

  // تحديث حالة الطالب إلى NOTIFIED
  await prisma.student.update({
    where: { id: studentId },
    data: { status: StudentStatus.NOTIFIED },
  });

  // تحديث تقييمات المختبرين المعتمدة إلى ACCEPTED — مع إمكانية تعديل الدرجة النهائية
  const session = await prisma.examSession.findFirst({
    where: { studentId, assessments: { some: { status: AssessmentStatus.APPROVED } } },
    select: { id: true },
  });
  if (session) {
    const assessments = await prisma.assessment.findMany({
      where: { examSessionId: session.id, status: AssessmentStatus.APPROVED },
      select: { id: true, finalScore: true, evaluatorId: true },
    });
    await prisma.assessment.updateMany({
      where: { examSessionId: session.id, status: AssessmentStatus.APPROVED },
      data: {
        status: AssessmentStatus.ACCEPTED,
        ...(finalOverride !== null ? { finalScore: finalOverride } : {}),
      },
    });
    // أثر التعديل: لا يُحذف التقييم السابق بلا أثر — يُسجَّل في سجل التدقيق
    if (finalOverride !== null) {
      await recordAudit(user.id, AuditAction.APPROVE, {
        studentId,
        step: "SPECIALIST_SCORE_OVERRIDE",
        previousScores: assessments.map((a) => ({
          evaluatorId: a.evaluatorId,
          score: a.finalScore,
        })),
        newScore: finalOverride,
      });
    }
  }

  // إشعار لجميع مستخدمي رئاسة الشؤون التعليمية
  const heads = await prisma.user.findMany({
    where: { ...getTenantFilter(user), role: Role.HEAD_OF_AFFAIRS },
    select: { id: true },
  });
  if (heads.length > 0) {
    await prisma.notification.createMany({
      data: heads.map((h) => ({
        userId: h.id,
        message: `الطالب «${student.name}» بانتظار اعتمادك النهائي`,
        type: NotificationType.APPROVAL,
        tenantId: requireTenantId(user),
      })),
    });
  }

  await recordAudit(user.id, AuditAction.APPROVE, {
    studentId,
    step: "SPECIALIST_FINAL_APPROVE",
    newStatus: StudentStatus.NOTIFIED,
  });

  revalidatePath("/test-specialist/final-review");
  revalidatePath("/head-of-affairs");

  return { success: true, status: StudentStatus.NOTIFIED };
}

/**
 * 2) الاعتماد الإداري النهائي — رئيس الشؤون التعليمية
 * - عزل الصلاحيات: لا ينفذها إلا مستخدم بدور HEAD_OF_AFFAIRS.
 * - يحوّل الطالب (NOTIFIED) إلى READY_FOR_CERTIFICATE (جاهز للشهادة).
 * - يحدّث تقييمه إلى NOTIFIED ويرسل إشعاراً لمصدر الشهادات.
 */
export async function headOfAffairsFinalApprove(studentId: string) {
  const user = await requireUser();

  // عزل الصلاحيات: رئيس الشؤون فقط
  requireRole(user, [Role.HEAD_OF_AFFAIRS]);

  if (!studentId || typeof studentId !== "string" || studentId.length < 1 || studentId.length > 64) {
    throw new Error("معرّف الطالب غير صالح");
  }

  const student = await prisma.student.findUnique({
    where: { id: studentId },
    select: { id: true, name: true, status: true, tenantId: true },
  });
  if (!student) {
    throw new Error("الطالب غير موجود");
  }
  assertSameTenant(user, student);
  if (student.status !== StudentStatus.NOTIFIED) {
    throw new Error("الطالب لم يعتمد من قبل أخصائي الاختبارات بعد");
  }

  // تحديث حالة الطالب إلى READY_FOR_CERTIFICATE
  await prisma.student.update({
    where: { id: studentId },
    data: { status: StudentStatus.READY_FOR_CERTIFICATE, finalizedAt: new Date() },
  });

  // تحديث سجل التقييم المعتمد إلى NOTIFIED
  const session = await prisma.examSession.findFirst({
    where: { studentId, assessments: { some: { status: AssessmentStatus.ACCEPTED } } },
    select: { id: true },
  });
  if (session) {
    await prisma.assessment.updateMany({
      where: { examSessionId: session.id, status: AssessmentStatus.ACCEPTED },
      data: { status: AssessmentStatus.NOTIFIED },
    });
  }

  // إشعار لمصدر الشهادات
  const sources = await prisma.user.findMany({
    where: { ...getTenantFilter(user), role: Role.CERTIFICATE_SOURCE },
    select: { id: true },
  });
  if (sources.length > 0) {
    await prisma.notification.createMany({
      data: sources.map((s) => ({
        userId: s.id,
        message: `الطالب «${student.name}» جاهز لإصدار الشهادة`,
        type: NotificationType.CERTIFICATE,
        tenantId: requireTenantId(user),
      })),
    });
  }

  await recordAudit(user.id, AuditAction.APPROVE, {
    studentId,
    step: "HEAD_OF_AFFAIRS_FINAL_APPROVE",
    newStatus: StudentStatus.READY_FOR_CERTIFICATE,
  });

  revalidatePath("/head-of-affairs");
  revalidatePath("/test-specialist/final-review");
  revalidatePath("/certificate-source");

  return { success: true, status: StudentStatus.READY_FOR_CERTIFICATE };
}
