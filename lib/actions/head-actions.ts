"use server";

import { requireUser, requireRole } from "@/lib/security";
import { prisma } from "@/lib/prisma";
import {
  Role,
  StudentStatus,
  AssessmentStatus,
  NotificationType,
  AuditAction,
  type Student,
} from "@prisma/client";
import type { Prisma } from "@prisma/client";
import { revalidatePath } from "next/cache";

/**
 * تسجيل حدث في Audit Log (شفافية كل قرار — المادة 8)
 */
async function recordAudit(
  userId: string,
  action: AuditAction,
  details: Prisma.InputJsonValue
) {
  await prisma.auditLog.create({
    data: { userId, action, details },
  });
}

/**
 * قائمة الطلاب بانتظار مراجعة رئيس الشؤون التعليمية (NOTIFIED)
 * عزل الصلاحيات: رئيس الشؤون فقط.
 */
export async function getStudentsForHeadReview(
  page = 1,
  pageSize = 20
): Promise<{
  students: Student[];
  total: number;
  totalPages: number;
  page: number;
}> {
  const user = await requireUser();
  requireRole(user, [Role.HEAD_OF_AFFAIRS]);

  const where = { status: StudentStatus.NOTIFIED };
  const skip = (page - 1) * pageSize;

  const [students, total] = await Promise.all([
    prisma.student.findMany({
      where,
      orderBy: { createdAt: "desc" },
      skip,
      take: pageSize,
    }),
    prisma.student.count({ where }),
  ]);

  return { students, total, totalPages: Math.ceil(total / pageSize), page };
}

/**
 * رفض رئيس الشؤون التعليمية لطلب تم اعتماده إدارياً من الأخصائي
 *
 * الرفض: يعيد الطالب من NOTIFIED إلى APPROVED (بانتظار إعادة التوزيع/التقييم)
 * ويُعيد تقييمات الأخصائي (ACCEPTED) إلى FINALIZED لتصحيح سير العمل،
 * مع إشعار الأخصائيين والجهة التعليمية بالنتيجة.
 *
 * الهدف: تُوجَّه الإشعارات للأخصائيين والجهة — وليس للمستخدم المتخذ للقرار.
 */
export async function rejectStudentByHead(studentId: string, reason?: string) {
  const user = await requireUser();

  // عزل الصلاحيات: رئيس الشؤون فقط (المادة 8)
  requireRole(user, [Role.HEAD_OF_AFFAIRS]);

  const student = await prisma.student.findUnique({
    where: { id: studentId },
    select: { id: true, name: true, status: true, institutionId: true },
  });
  if (!student) {
    throw new Error("الطالب غير موجود");
  }
  if (student.status !== StudentStatus.NOTIFIED) {
    throw new Error("الطالب ليس بانتظار مراجعة رئيس الشؤون");
  }

  // إعادة الطالب إلى APPROVED (بانتظار إعادة التوزيع وإعادة التقييم)
  await prisma.student.update({
    where: { id: studentId },
    data: { status: StudentStatus.APPROVED },
  });

  // إعادة تقييم الأخصائي (ACCEPTED) إلى FINALIZED لتظل السلسلة منطقية
  const session = await prisma.examSession.findFirst({
    where: { studentId, assessments: { some: { status: AssessmentStatus.ACCEPTED } } },
    select: { id: true },
  });
  if (session) {
    await prisma.assessment.updateMany({
      where: { examSessionId: session.id, status: AssessmentStatus.ACCEPTED },
      data: { status: AssessmentStatus.FINALIZED },
    });
  }

  const reasonText = reason ? ` السبب: ${reason}` : "";

  // إشعار لأخصائيي الاختبارات (المسؤولين عن هذه المرحلة)
  const specialists = await prisma.user.findMany({
    where: { role: Role.TEST_SPECIALIST },
    select: { id: true },
  });
  if (specialists.length > 0) {
    await prisma.notification.createMany({
      data: specialists.map((s) => ({
        userId: s.id,
        message: `رُفض اعتماد الطالب «${student.name}» من رئيس الشؤون التعليمية.${reasonText}`,
        type: NotificationType.APPROVAL,
      })),
    });
  }

  // إشعار للجهة التعليمية المرشِّحة
  if (student.institutionId) {
    const institutionUsers = await prisma.user.findMany({
      where: { role: Role.INSTITUTION, institutionId: student.institutionId },
      select: { id: true },
    });
    if (institutionUsers.length > 0) {
      await prisma.notification.createMany({
        data: institutionUsers.map((u) => ({
          userId: u.id,
          message: `رُفض اعتماد الطالب «${student.name}» من رئيس الشؤون التعليمية.${reasonText}`,
          type: NotificationType.APPROVAL,
        })),
      });
    }
  }

  await recordAudit(user.id, AuditAction.REJECT, {
    entity: "Student",
    studentId,
    step: "HEAD_OF_AFFAIRS_REJECT",
    reason: reason ?? null,
    newStatus: StudentStatus.APPROVED,
  });

  revalidatePath("/dashboard/head-of-affairs");
  revalidatePath("/dashboard/test-specialist/final-review");
  revalidatePath("/dashboard/certificate-source");
  revalidatePath("/dashboard/admin");

  return { studentId, rejected: true, newStatus: StudentStatus.APPROVED };
}