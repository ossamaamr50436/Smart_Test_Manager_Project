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
import {
  validateRejectionReason,
  rejectionReasonError,
} from "@/lib/validations/rejection-reason";

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
 * قائمة الطلاب المرفوضين من رئيس الشؤون التعليمية (REJECTED_BY_HEAD)
 * مع سبب الرفض ومُصدِره — مغلفة بعزل الصلاحيات لكل دور.
 * عزل الصلاحيات: رئيس الشؤون (كل ما يخص جهته) أو الأخصائي/المسؤول (للمعالجة).
 */
export async function getStudentsRejectedByHead() {
  const user = await requireUser();

  const allowed: Role[] = [Role.HEAD_OF_AFFAIRS, Role.TEST_SPECIALIST, Role.ADMIN];
  requireRole(user, allowed);

  return prisma.student.findMany({
    where: { ...getTenantFilter(user), status: StudentStatus.REJECTED_BY_HEAD },
    include: {
      institution: { select: { name: true } },
      rejectedBy: { select: { id: true, name: true } },
      examSessions: {
        include: {
          assessments: {
            where: { status: AssessmentStatus.REJECTED_BY_HEAD },
            select: { finalScore: true, status: true },
          },
        },
      },
    },
    orderBy: { rejectedAt: "desc" },
  });
}

/**
 * رفض رئيس الشؤون التعليمية لطلب تم اعتماده إدارياً من الأخصائي
 *
 * الرفض: يثبّت الطالب في حالة REJECTED_BY_HEAD (لا يختفي من النظام)،
 * ويُسجّل سبب الرفض + التوقيت + المُصدِر على الطالب نفسه،
 * ويحوّل تقييم الأخصائي (ACCEPTED) إلى REJECTED_BY_HEAD،
 * مع إشعار الأخصائيين والجهة التعليمية بالنتيجة.
 *
 * السبب إلزامي — لا يُرفض الطلب بسطر فارغ/مسافات فقط (Server-side validation).
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

  // السبب إلزامي — لا يمكن الرفض بدون سبب صالح
  const reasonError = rejectionReasonError(reason);
  if (reasonError) {
    throw new Error(reasonError);
  }
  const rejectionReason = validateRejectionReason(reason) as string;

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

  const rejectedAt = new Date();

  // تثبيت الطالب في REJECTED_BY_HEAD مع أسباب الرفض (لا يحذف ولا يعيده للقائمة)
  await prisma.student.update({
    where: { id: studentId },
    data: {
      status: StudentStatus.REJECTED_BY_HEAD,
      rejectionReason,
      rejectedAt,
      rejectedById: user.id,
    },
  });

  // تحويل تقييم الأخصائي (ACCEPTED) إلى REJECTED_BY_HEAD ليُعكس القرار في سلسلة التقييم
  const session = await prisma.examSession.findFirst({
    where: { studentId, assessments: { some: { status: AssessmentStatus.ACCEPTED } } },
    select: { id: true },
  });
  if (session) {
    await prisma.assessment.updateMany({
      where: { examSessionId: session.id, status: AssessmentStatus.ACCEPTED },
      data: { status: AssessmentStatus.REJECTED_BY_HEAD },
    });
  }

  // إشعار لأخصائيي الاختبارات (المسؤولين عن هذه المرحلة)
  const specialists = await prisma.user.findMany({
    where: { ...getTenantFilter(user), role: Role.TEST_SPECIALIST },
    select: { id: true },
  });
  if (specialists.length > 0) {
    await prisma.notification.createMany({
      data: specialists.map((s) => ({
        userId: s.id,
        message: `رُفض اعتماد الطالب «${student.name}» من رئيس الشؤون التعليمية. السبب: ${rejectionReason}`,
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
          message: `رُفض اعتماد الطالب «${student.name}» من رئيس الشؤون التعليمية. السبب: ${rejectionReason}`,
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
    reason: rejectionReason,
    newStatus: StudentStatus.REJECTED_BY_HEAD,
    rejectedBy: user.id,
  });

  revalidatePath("/head-of-affairs");
  revalidatePath("/head-of-affairs/rejected");
  revalidatePath("/test-specialist/final-review");
  revalidatePath("/test-specialist/rejected-students");
  revalidatePath("/certificate-source");
  revalidatePath("/admin");

  return { studentId, rejected: true, newStatus: StudentStatus.REJECTED_BY_HEAD };
}