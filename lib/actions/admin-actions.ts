"use server";

import { requireUser, requireRole } from "@/lib/security";
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
  await prisma.auditLog.create({
    data: { userId, action, details: JSON.stringify(details) },
  });
}

/**
 * 1) الاعتماد الإداري النهائي — أخصائي الاختبارات
 * - عزل الصلاحيات: لا ينفذها إلا مستخدم بدور TEST_SPECIALIST.
 * - يحوّل الطالب المكتمل (COMPLETED) إلى NOTIFIED.
 * - يحدّث تقييمه إلى ACCEPTED ويرسل إشعاراً لرئيس الشؤون التعليمية.
 */
export async function specialistFinalApprove(studentId: string) {
  const user = await requireUser();

  // عزل الصلاحيات: الأخصائي فقط
  requireRole(user, [Role.TEST_SPECIALIST]);

  const student = await prisma.student.findUnique({
    where: { id: studentId },
    select: { id: true, name: true, status: true, institutionId: true },
  });
  if (!student) {
    throw new Error("الطالب غير موجود");
  }
  if (student.status !== StudentStatus.COMPLETED) {
    throw new Error("الطالب لم يكمل التقييم والاعتماد المتسلسل بعد");
  }

  // تحديث حالة الطالب إلى NOTIFIED
  await prisma.student.update({
    where: { id: studentId },
    data: { status: StudentStatus.NOTIFIED },
  });

  // تحديث سجل التقييم المعتمد إلى ACCEPTED
  const session = await prisma.examSession.findFirst({
    where: { studentId, assessments: { some: { status: AssessmentStatus.FINALIZED } } },
    select: { id: true },
  });
  if (session) {
    await prisma.assessment.updateMany({
      where: { examSessionId: session.id, status: AssessmentStatus.FINALIZED },
      data: { status: AssessmentStatus.ACCEPTED },
    });
  }

  // إشعار لجميع مستخدمي رئاسة الشؤون التعليمية
  const heads = await prisma.user.findMany({
    where: { role: Role.HEAD_OF_AFFAIRS },
    select: { id: true },
  });
  if (heads.length > 0) {
    await prisma.notification.createMany({
      data: heads.map((h) => ({
        userId: h.id,
        message: `الطالب «${student.name}» بانتظار اعتمادك النهائي`,
        type: NotificationType.APPROVAL,
      })),
    });
  }

  await recordAudit(user.id, AuditAction.APPROVE, {
    studentId,
    step: "SPECIALIST_FINAL_APPROVE",
    newStatus: StudentStatus.NOTIFIED,
  });

  revalidatePath("/dashboard/test-specialist/final-review");
  revalidatePath("/dashboard/head-of-affairs");

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

  const student = await prisma.student.findUnique({
    where: { id: studentId },
    select: { id: true, name: true, status: true },
  });
  if (!student) {
    throw new Error("الطالب غير موجود");
  }
  if (student.status !== StudentStatus.NOTIFIED) {
    throw new Error("الطالب لم يعتمد من قبل أخصائي الاختبارات بعد");
  }

  // تحديث حالة الطالب إلى READY_FOR_CERTIFICATE
  await prisma.student.update({
    where: { id: studentId },
    data: { status: StudentStatus.READY_FOR_CERTIFICATE },
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
    where: { role: Role.CERTIFICATE_SOURCE },
    select: { id: true },
  });
  if (sources.length > 0) {
    await prisma.notification.createMany({
      data: sources.map((s) => ({
        userId: s.id,
        message: `الطالب «${student.name}» جاهز لإصدار الشهادة`,
        type: NotificationType.CERTIFICATE,
      })),
    });
  }

  await recordAudit(user.id, AuditAction.APPROVE, {
    studentId,
    step: "HEAD_OF_AFFAIRS_FINAL_APPROVE",
    newStatus: StudentStatus.READY_FOR_CERTIFICATE,
  });

  revalidatePath("/dashboard/head-of-affairs");
  revalidatePath("/dashboard/test-specialist/final-review");
  revalidatePath("/dashboard/certificate-source");

  return { success: true, status: StudentStatus.READY_FOR_CERTIFICATE };
}
