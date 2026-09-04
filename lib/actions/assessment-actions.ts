"use server";

import { requireUser, requireRole, assertExaminerInSession } from "@/lib/security";
import { prisma } from "@/lib/prisma";
import {
  Role,
  AssessmentStatus,
  StudentStatus,
  NotificationType,
  AuditAction,
} from "@prisma/client";
import { revalidatePath } from "next/cache";
import {
  assessmentInputSchema,
  assessmentApprovalSchema,
  type AssessmentInput,
} from "@/lib/validations/assessment";

// معاملات الخصم لكل نوع من الأخطاء (الدرجة من 20)
export const SCORE_FULL = 20;
export const ERROR_PENALTY = 1; // الخطأ -1 درجة
export const DOUBT_PENALTY = 0.5; // الشك -0.5 درجة
export const TAJWEED_PENALTY = 0.25; // التجويد -0.25 درجة

/** تسجيل حدث في Audit Log */
async function recordAudit(userId: string, action: AuditAction, details: unknown) {
  await prisma.auditLog.create({
    data: { userId, action, details: JSON.stringify(details) },
  });
}

/** حساب إجمالي الخصم والدرجة النهائية (من 20) */
function computeTotals(input: AssessmentInput) {
  const totalDeduction =
    input.errorsCount * ERROR_PENALTY +
    input.doubtsCount * DOUBT_PENALTY +
    input.tajweedCount * TAJWEED_PENALTY;
  const finalScore = Math.max(0, Math.min(SCORE_FULL, SCORE_FULL - totalDeduction));
  return { totalDeduction, finalScore };
}

/**
 * إيجاد أول نموذج اختباري مرتبط بجهة الطالب (تمهيد: النماذج ستأتي من Google Drive لاحقاً)
 */
async function resolveModelId(sessionId: string): Promise<string | null> {
  const session = await prisma.examSession.findFirst({
    where: { id: sessionId },
    select: { student: { select: { institutionId: true } } },
  });
  if (!session) return null;

  const model = await prisma.examModel.findFirst({
    where: { institutionId: session.student.institutionId },
    select: { id: true },
    orderBy: { modelNumber: "asc" },
  });
  return model?.id ?? null;
}

/**
 * حفظ أو تحديث سجل تقييم — خاص بالمختبرين (المعلمين)
 *
 * عزل الصلاحيات (المادة 8): يستطيع المقيّم تعديل تقييم الطلاب الموزعين على
 * لجنته فقط (حيث يكون teacher1Id أو teacher2Id مساوياً لمعرف المستخدم).
 */
export async function saveAssessment(input: AssessmentInput) {
  const user = await requireUser();

  // عزل الصلاحيات: المقيّم فقط (المادة 8/2)
  requireRole(user, [Role.EXAMINER]);

  // التحقق من صحة المدخلات (OWASP)
  const parsed = assessmentInputSchema.safeParse(input);
  if (!parsed.success) {
    throw new Error(parsed.error.issues[0]?.message ?? "بيانات التقييم غير صحيحة");
  }
  const data = parsed.data;

  // التحقق من أن اللجنة/الجلسة موجودة وأن المقيّم جزء منها (عزل الصلاحيات)
  const session = await assertExaminerInSession(user, data.examSessionId);

  const { totalDeduction, finalScore } = computeTotals(data);

  const modelId = await resolveModelId(session.id);

  const existing = await prisma.assessment.findFirst({
    where: { examSessionId: session.id, evaluatorId: user.id },
  });

  const assessment = await prisma.assessment.upsert({
    where: { id: existing?.id ?? "no-assessment-yet" },
    create: {
      examSessionId: session.id,
      evaluatorId: user.id,
      modelId: modelId ?? "no-model-yet",
      errorsCount: data.errorsCount,
      doubtsCount: data.doubtsCount,
      tajweedCount: data.tajweedCount,
      totalDeduction,
      finalScore,
      status: AssessmentStatus.DRAFT,
    },
    update: {
      errorsCount: data.errorsCount,
      doubtsCount: data.doubtsCount,
      tajweedCount: data.tajweedCount,
      totalDeduction,
      finalScore,
    },
  });

  await recordAudit(user.id, AuditAction.ASSESS, {
    examSessionId: session.id,
    studentId: session.student.id,
    errorsCount: data.errorsCount,
    doubtsCount: data.doubtsCount,
    tajweedCount: data.tajweedCount,
    totalDeduction,
    finalScore,
  });

  revalidatePath("/dashboard/examiner");
  revalidatePath("/dashboard/examiner/assess");

  return { success: true, assessmentId: assessment.id, totalDeduction, finalScore };
}

/**
 * منطق الاعتماد حسب العمر (المادة 5):
 * - الأكبر سناً يفعّل "اعتماد" (الحالة APPROVED)، ثم يلي ذلك
 * - الأصغر سناً يفعّل "اعتماد نهائي" (الحالة FINALIZED).
 *
 * يُمنع تجاوز الترتيب: لا يستطيع الأصغر الاعتماد النهائي قبل اعتماد الأكبر.
 *
 * @param action "approve" (الأكبر) | "finalize" (الأصغر)
 */
export async function approveAssessment(examSessionId: string, action: "approve" | "finalize") {
  const user = await requireUser();

  // عزل الصلاحيات: المقيّم فقط (المادة 8/2)
  requireRole(user, [Role.EXAMINER]);

  // التحقق من صحة المدخلات (OWASP)
  const parsed = assessmentApprovalSchema.safeParse({ examSessionId, action });
  if (!parsed.success) {
    throw new Error(parsed.error.issues[0]?.message ?? "بيانات غير صحيحة");
  }

  // عزل الصلاحيات: يجب أن يكون المقيّم ضمن لجنة الطالب
  const session = await assertExaminerInSession(user, examSessionId);

  // استرجاع تقييم هذا المقيّم (يجب أن يكون حفظه أولاً)
  const assessment = await prisma.assessment.findFirst({
    where: { examSessionId: session.id, evaluatorId: user.id },
  });
  if (!assessment) {
    throw new Error("احفظ التقييم أولاً قبل الاعتماد");
  }

  // جلب المعلمين مع تواريخ الميلاد للمقارنة (المادة 5)
  const teachers = await prisma.user.findMany({
    where: { id: { in: [session.teacher1Id, session.teacher2Id] } },
    select: { id: true, birthDate: true },
  });

  const birthDateOf = (id: string) =>
    teachers.find((t) => t.id === id)?.birthDate ?? null;

  // الأكبر سناً هو صاحب تاريخ الميلاد الأقدم (الأصغر قيمةً)
  const teacher1BD = birthDateOf(session.teacher1Id);
  const teacher2BD = birthDateOf(session.teacher2Id);

  const isSenior = (): boolean => {
    // إذا توفر تاريخا الميلاد للمعلمين نقارنهما فعلياً
    if (teacher1BD && teacher2BD) {
      const teacher1IsOlder = teacher1BD <= teacher2BD;
      if (user.id === session.teacher1Id) return teacher1IsOlder;
      return !teacher1IsOlder;
    }
    // الاحتياط عند غياب التواريخ: teacher1 يُعتبر الأكبر سناً
    return user.id === session.teacher1Id;
  };

  const seniorIsUser = isSenior();

  if (action === "approve") {
    // لا يقبل الاعتماد النهائي: الأكبر فقط يضغط "اعتماد" (المادة 5)
    if (!seniorIsUser) {
      throw new Error(
        "المعلم الأصغر سناً لا يقوم بالاعتماد الأول؛ الاعتماد الأول للمعلم الأكبر"
      );
    }
    await prisma.assessment.update({
      where: { id: assessment.id },
      data: { status: AssessmentStatus.APPROVED },
    });
    await prisma.student.update({
      where: { id: session.student.id },
      data: { status: StudentStatus.ASSIGNED },
    });

    // إشعار للمعلم الآخر بأن التقييم اعتمد
    const otherTeacherId =
      user.id === session.teacher1Id ? session.teacher2Id : session.teacher1Id;
    await prisma.notification.create({
      data: {
        userId: otherTeacherId,
        message: `اعتمد المعلم الأكبر سناً تقييم الطالب «${session.student.name}» — بانتظار اعتمادك النهائي`,
        type: NotificationType.ASSESSMENT,
        examSessionId: session.id,
      },
    });
  } else {
    // "اعتماد نهائي": الأصغر فقط، وفقط بعد اعتماد الأكبر (الحالة APPROVED)
    if (seniorIsUser) {
      throw new Error(
        "المعلم الأكبر سناً لا يقوم بالاعتماد النهائي؛ الاعتماد النهائي للمعلم الأصغر"
      );
    }
    if (assessment.status !== AssessmentStatus.APPROVED) {
      throw new Error("يجب أن يعتمد المعلم الأكبر التقييم قبل الاعتماد النهائي");
    }
    await prisma.assessment.update({
      where: { id: assessment.id },
      data: { status: AssessmentStatus.FINALIZED },
    });
    await prisma.student.update({
      where: { id: session.student.id },
      data: { status: StudentStatus.COMPLETED },
    });

    // إشعار لأخصائي الاختبارات بأن الطالب اكتمل تقييمه
    const specialists = await prisma.user.findMany({
      where: { role: Role.TEST_SPECIALIST },
      select: { id: true },
    });
    if (specialists.length > 0) {
      await prisma.notification.createMany({
        data: specialists.map((s) => ({
          userId: s.id,
          message: `اكتمل تقييم الطالب «${session.student.name}» واعتمده المعلمان — بانتظار اعتمادك الإداري`,
          type: NotificationType.ASSESSMENT,
          examSessionId: session.id,
        })),
      });
    }
  }

  await recordAudit(user.id, AuditAction.APPROVE, {
    examSessionId: session.id,
    studentId: session.student.id,
    action,
    role: seniorIsUser ? "senior" : "junior",
  });

  revalidatePath("/dashboard/examiner");
  revalidatePath("/dashboard/examiner/assess");

  return { success: true, status: action === "approve" ? AssessmentStatus.APPROVED : AssessmentStatus.FINALIZED };
}

/**
 * جلب بيانات التقييم الحالية لجلسة ولجنة (لعرض حالة السجل)
 * عزل الصلاحيات (OWASP): المقيّم يقرأ فقط جلسات لجنته؛ الأدوار الإدارية تقرأ أي جلسة.
 */
export async function getAssessmentState(examSessionId: string) {
  const user = await requireUser();

  const isAdminOrSpecialist = isAdminRole(user.role);
  if (!isAdminOrSpecialist) {
    // المقيّم يجب أن يكون ضمن لجنة هذه الجلسة
    await assertExaminerInSession(user, examSessionId);
  }

  return prisma.assessment.findMany({
    where: { examSessionId },
    select: {
      id: true,
      evaluatorId: true,
      errorsCount: true,
      doubtsCount: true,
      tajweedCount: true,
      totalDeduction: true,
      finalScore: true,
      status: true,
    },
  });
}

/** هل الدور من الأدوار الإدارية العليا؟ */
function isAdminRole(role: Role): boolean {
  const adminRoles = [Role.ADMIN, Role.TEST_SPECIALIST, Role.HEAD_OF_AFFAIRS];
  return (adminRoles as Role[]).includes(role);
}
