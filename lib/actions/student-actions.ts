"use server";

import { requireUser, requireRole, assertInstitutionOwnsStudent } from "@/lib/security";
import { prisma } from "@/lib/prisma";
import { Role, StudentStatus, NotificationType, AuditAction } from "@prisma/client";
import { revalidatePath } from "next/cache";
import {
  studentApplicationSchema,
  committeeSchema,
  type StudentApplicationInput,
  type CommitteeInput,
  type ReviewDecision,
} from "@/lib/validations/student";
import { getCurrentSeason } from "./season-actions";

/**
 * تسجيل حدث في Audit Log
 * (تتبع الشفافية — كل قرار موثّق)
 */
async function recordAudit(userId: string, action: AuditAction, details: unknown) {
  await prisma.auditLog.create({
    data: {
      userId,
      action,
      details: JSON.stringify(details),
    },
  });
}

/**
 * 1) ترشيح طالب جديد — خاص بالجهة التعليمية
 * - يقبل الطالب تلقائياً بربط institutionId بالجهة المرتبطة بحساب المستخدم
 * - الحالة PENDING + إشعار لأخصائي الاختبارات
 */
export async function createStudentApplication(input: StudentApplicationInput) {
  const user = await requireUser();

  // عزل الصلاحيات: الجهة التعليمية فقط
  requireRole(user, [Role.INSTITUTION]);
  if (!user.institutionId) {
    throw new Error("حساب الجهة غير مرتبط بمؤسسة تعليمية");
  }

  // التحقق من صحة البيانات
  const parsed = studentApplicationSchema.safeParse(input);
  if (!parsed.success) {
    throw new Error(parsed.error.issues[0]?.message ?? "بيانات غير صحيحة");
  }
  const data = parsed.data;

  const student = await prisma.student.create({
    data: {
      name: data.name,
      age: data.age,
      branch: data.branch,
      teacherName: data.teacherName,
      parentPhone: data.parentPhone,
      address: data.address ?? null,
      phone: data.phone ?? null,
      status: StudentStatus.PENDING,
      institutionId: user.institutionId,
    },
  });

  // إشعار بالأخصائي (قد يكون أكثر من أخصائي)
  const specialists = await prisma.user.findMany({
    where: { role: Role.TEST_SPECIALIST },
    select: { id: true },
  });

  if (specialists.length > 0) {
    await prisma.notification.createMany({
      data: specialists.map((s) => ({
        userId: s.id,
        message: `طلب ترشيح جديد للطالب «${student.name}» بانتظار المراجعة`,
        type: NotificationType.RECRUITMENT,
      })),
    });
  }

  await recordAudit(user.id, AuditAction.CREATE, {
    entity: "Student",
    studentId: student.id,
    name: student.name,
  });

  revalidatePath("/dashboard/test-specialist/requests");

  return { success: true, studentId: student.id };
}

/**
 * 2) مراجعة طلب الترشيح (قبول/رفض) — خاص بأخصائي الاختبارات
 * - تحدث حالة الطالب + إشعار للجهة بالنتيجة
 */
export async function reviewStudentApplication(studentId: string, decision: ReviewDecision) {
  const user = await requireUser();

  // عزل الصلاحيات: الأخصائي فقط
  requireRole(user, [Role.TEST_SPECIALIST]);

  const student = await prisma.student.findUnique({
    where: { id: studentId },
    select: { id: true, name: true, institutionId: true },
  });

  if (!student) {
    throw new Error("الطالب غير موجود");
  }

  // نص السبب الثابت (حالياً)
  const reason =
    decision === "APPROVED"
      ? "تم قبول الترشيح من قبل أخصائي الاختبارات"
      : "تم رفض الترشيح لعدم اكتمال البيانات المطلوبة";

  const status = decision === "APPROVED" ? StudentStatus.APPROVED : StudentStatus.REJECTED;

  await prisma.student.update({
    where: { id: studentId },
    data: { status },
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
      })),
    });
  }

  await recordAudit(user.id, AuditAction.APPROVE, {
    studentId,
    decision,
    reason,
  });

  revalidatePath("/dashboard/test-specialist/requests");
  revalidatePath("/dashboard/test-specialist/committees");

  return { success: true, status };
}

/**
 * 3) تشكيل لجنة (جلسة اختبار) وتوزيع الطالب — خاص بأخصائي الاختبارات
 * - ينشئ ExamSession + تغيير حالة الطالب إلى ASSIGNED + إشعارات للمعلمين والجهة
 */
export async function assignCommittee(input: CommitteeInput) {
  const user = await requireUser();

  // عزل الصلاحيات: الأخصائي فقط
  requireRole(user, [Role.TEST_SPECIALIST]);

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
    where: { id: { in: [data.teacher1Id, data.teacher2Id] } },
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
    select: { id: true, name: true, status: true, institutionId: true },
  });

  if (!student) {
    throw new Error("الطالب غير موجود");
  }
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
  const seasonId = season?.id ?? null;

  // منع التوزيع المزدوج لنفس الطالب
  const existingSession = await prisma.examSession.findFirst({
    where: { studentId: data.studentId },
  });
  if (existingSession) {
    throw new Error("هذا الطالب موزع على لجنة مسبقاً");
  }

  const session = await prisma.examSession.create({
    data: {
      studentId: data.studentId,
      teacher1Id: data.teacher1Id,
      teacher2Id: data.teacher2Id,
      examDate,
      period: data.period,
      status: "SCHEDULED",
      seasonId,
    },
  });

  await prisma.student.update({
    where: { id: data.studentId },
    data: { status: StudentStatus.ASSIGNED },
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
    data: [...new Set(recipients)].map((userId) => ({
      userId,
      message,
      type: NotificationType.SCHEDULE,
      examSessionId: session.id,
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

  revalidatePath("/dashboard/test-specialist/committees");
  revalidatePath("/dashboard/test-specialist/requests");
  revalidatePath("/dashboard/examiner");

  return { success: true, sessionId: session.id };
}