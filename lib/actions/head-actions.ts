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
  type Student,
} from "@prisma/client";
import type { Prisma } from "@prisma/client";
import { revalidatePath } from "next/cache";
import { PAGE_SIZE } from "@/lib/utils";

/**
 * تسجيل حدث في Audit Log (شفافية كل قرار — المادة 8)
 */
async function recordAudit(
  userId: string,
  action: AuditAction,
  details: Prisma.InputJsonValue
) {
  const tenantId = await getActorTenantId(userId);
  await prisma.auditLog.create({
    data: { userId, action, details, tenantId },
  });
}

/**
 * قائمة الطلاب بانتظار مراجعة رئيس الشؤون التعليمية (NOTIFIED)
 * عزل الصلاحيات: رئيس الشؤون فقط.
 */
export async function getStudentsForHeadReview(
  page = 1,
  pageSize = PAGE_SIZE
): Promise<{
  students: Student[];
  total: number;
  totalPages: number;
  page: number;
}> {
  const user = await requireUser();
  requireRole(user, [Role.HEAD_OF_AFFAIRS]);

  // التحقق من قيم ترقيم الصفحات (منع DoS عبر قيم ضخمة)
  const numericPage = Number(page);
  const numericPageSize = Number(pageSize);
  if (!Number.isInteger(numericPage) || numericPage < 1 || numericPage > 10000) {
    throw new Error("رقم الصفحة غير صالح");
  }
  if (!Number.isInteger(numericPageSize) || numericPageSize < 1 || numericPageSize > 100) {
    throw new Error("حجم الصفحة غير صالح (الحد الأقصى 100)");
  }

  const where = { ...getTenantFilter(user), status: StudentStatus.NOTIFIED };
  const skip = (numericPage - 1) * numericPageSize;

  const [students, total] = await Promise.all([
    prisma.student.findMany({
      where,
      orderBy: { createdAt: "desc" },
      skip,
      take: numericPageSize,
    }),
    prisma.student.count({ where }),
  ]);

  return { students, total, totalPages: Math.ceil(total / numericPageSize), page: numericPage };
}

/**
 * رفض رئيس الشؤون التعليمية لطلب تم اعتماده إدارياً من الأخصائي
 *
 * الرفض: يعيد الطالب من NOTIFIED إلى APPROVED (بانتظار إعادة التوزيع/التقييم)
 * ويُعيد تقييمات الأخصائي (ACCEPTED) إلى APPROVED لتصحيح سير العمل،
 * مع إشعار الأخصائيين والجهة التعليمية بالنتيجة.
 *
 * الهدف: تُوجَّه الإشعارات للأخصائيين والجهة — وليس للمستخدم المتخذ للقرار.
 */
export async function rejectStudentByHead(studentId: string, reason?: string) {
  const user = await requireUser();

  // عزل الصلاحيات: رئيس الشؤون فقط (المادة 8)
  requireRole(user, [Role.HEAD_OF_AFFAIRS]);

  if (!studentId || typeof studentId !== "string" || studentId.length < 1 || studentId.length > 64) {
    throw new Error("معرّف الطالب غير صالح");
  }

  const student = await prisma.student.findUnique({
    where: { id: studentId },
    select: { id: true, name: true, status: true, institutionId: true, tenantId: true },
  });
  if (!student) {
    throw new Error("الطالب غير موجود");
  }
  assertSameTenant(user, student);
  if (student.status !== StudentStatus.NOTIFIED) {
    throw new Error("الطالب ليس بانتظار مراجعة رئيس الشؤون");
  }

  // إعادة الطالب إلى APPROVED (بانتظار إعادة التوزيع وإعادة التقييم)
  await prisma.student.update({
    where: { id: studentId },
    data: { status: StudentStatus.APPROVED },
  });

  // إعادة تقييم الأخصائي (ACCEPTED) إلى APPROVED لتظل السلسلة منطقية
  const session = await prisma.examSession.findFirst({
    where: { studentId, assessments: { some: { status: AssessmentStatus.ACCEPTED } } },
    select: { id: true },
  });
  if (session) {
    await prisma.assessment.updateMany({
      where: { examSessionId: session.id, status: AssessmentStatus.ACCEPTED },
      data: { status: AssessmentStatus.APPROVED },
    });
  }

  const reasonText = reason ? ` السبب: ${reason}` : "";

  // إشعار لأخصائيي الاختبارات (المسؤولين عن هذه المرحلة)
  const specialists = await prisma.user.findMany({
    where: { ...getTenantFilter(user), role: Role.TEST_SPECIALIST },
    select: { id: true },
  });
  if (specialists.length > 0) {
    await prisma.notification.createMany({
      data: specialists.map((s) => ({
        userId: s.id,
        message: `رُفض اعتماد الطالب «${student.name}» من رئيس الشؤون التعليمية.${reasonText}`,
        type: NotificationType.APPROVAL,
        tenantId: requireTenantId(user),
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
          tenantId: requireTenantId(user),
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

  revalidatePath("/head-of-affairs");
  revalidatePath("/test-specialist/final-review");
  revalidatePath("/certificate-source");
  revalidatePath("/admin");

  return { studentId, rejected: true, newStatus: StudentStatus.APPROVED };
}