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
import { getCurrentSeason } from "./season-actions";
import { getExamModelsFromDrive } from "@/lib/google-drive";
import { broadcastAssessmentUpdate } from "@/lib/realtime";
import { computeTotals } from "@/lib/score-calculation";
import { MEMORIZATION_SCORE } from "@/lib/score-config";
import { dispatchNotificationChannels } from "@/lib/notifications";

/** تسجيل حدث في Audit Log — تتم داخل prisma.$transaction عبر client المتداول */

/**
 * إيجاد نموذج اختباري لجهة الطالب في الموسم النشط
 * (المادة 6 — النماذج مرتبطة بالموسم والفرع)
 */
async function resolveModelId(
  sessionId: string,
  branch: string
): Promise<string | null> {
  const session = await prisma.examSession.findFirst({
    where: { id: sessionId },
    select: { student: { select: { institutionId: true } } },
  });
  if (!session) return null;

  const season = await getCurrentSeason();

  const usedModels = await prisma.assessment.findMany({
    where: { examSession: { student: { institutionId: session.student.institutionId } } },
    select: { modelId: true },
    distinct: ["modelId"],
  });
  const usedModelIds = usedModels.map((m) => m.modelId);

  const model = await prisma.examModel.findFirst({
    where: {
      institutionId: session.student.institutionId,
      branch,
      ...(season ? { seasonId: season.id } : {}),
      NOT: usedModelIds.length > 0 ? { id: { in: usedModelIds } } : undefined,
    },
    select: { id: true, modelNumber: true },
    orderBy: { modelNumber: "asc" },
  });

  if (!model) {
    try {
      const models = await getExamModelsFromDrive();
      const driveModel = models[0];
      if (driveModel) {
        if (!season) return null;
        const created = await prisma.examModel.create({
          data: {
            modelNumber: 1,
            branch,
            detailsJSON: { source: "drive", fileId: driveModel.fileId, name: driveModel.name },
            institutionId: session.student.institutionId,
            seasonId: season.id,
          },
        });
        return created.id;
      }
    } catch {
      return null;
    }
  }

  return model?.id ?? null;
}

/**
 * حفظ أو تحديث سجل تقييم — خاص بالمختبرين (المعلمين)
 * وفق لائحة اختيار فرع كامل القرآن (100 درجة)
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

  const totals = computeTotals(data);

  const modelId = await resolveModelId(session.id, session.student.branch);

  if (!modelId) {
    throw new Error("لا يوجد نموذج اختباري مرتبط بهذه الجهة في الموسم الحالي");
  }

  // منع تكرار النموذج على طالبين في نفس الموسم (المادة 6)
  const duplicateModel = await prisma.assessment.findFirst({
    where: {
      modelId,
      examSession: {
        student: { institutionId: session.student.institutionId },
        NOT: { id: session.id },
      },
    },
    include: { examSession: { include: { student: { select: { name: true } } } } },
  });
  if (duplicateModel) {
    throw new Error(
      `النموذج مستخدم بالفعل مع الطالب ${duplicateModel.examSession.student.name} في هذا الموسم`
    );
  }

  const existing = await prisma.assessment.findFirst({
    where: { examSessionId: session.id, evaluatorId: user.id },
    select: { id: true, status: true },
  });

  // منع تعديل تقييم تم اعتماده بالفعل
  if (existing && existing.status !== AssessmentStatus.DRAFT) {
    throw new Error("لا يمكن تعديل تقييم تم اعتماده بالفعل");
  }

  const result = await prisma.$transaction(async (tx) => {
    const saved = await tx.assessment.upsert({
      where: { id: existing?.id ?? "no-assessment-yet" },
      create: {
        examSessionId: session.id,
        evaluatorId: user.id,
        modelId,
        wordErrors: data.wordErrors,
        letterErrors: data.letterErrors,
        diacriticErrors: data.diacriticErrors,
        seriousErrors: data.seriousErrors,
        subtleErrors: data.subtleErrors,
        promptingCount: data.promptingCount,
        doubtCount: data.doubtCount,
        recitationScore: data.recitationScore,
        tajweedScore: data.tajweedScore,
        memorizationDeduction: totals.memorizationDeduction,
        totalDeduction: totals.totalDeduction,
        finalScore: totals.finalScore,
        status: AssessmentStatus.DRAFT,
      },
      update: {
        wordErrors: data.wordErrors,
        letterErrors: data.letterErrors,
        diacriticErrors: data.diacriticErrors,
        seriousErrors: data.seriousErrors,
        subtleErrors: data.subtleErrors,
        promptingCount: data.promptingCount,
        doubtCount: data.doubtCount,
        recitationScore: data.recitationScore,
        tajweedScore: data.tajweedScore,
        memorizationDeduction: totals.memorizationDeduction,
        totalDeduction: totals.totalDeduction,
        finalScore: totals.finalScore,
      },
    });

    await tx.auditLog.create({
      data: {
        userId: user.id,
        action: AuditAction.ASSESS,
        details: JSON.stringify({
          examSessionId: session.id,
          studentId: session.student.id,
          wordErrors: data.wordErrors,
          letterErrors: data.letterErrors,
          diacriticErrors: data.diacriticErrors,
          seriousErrors: data.seriousErrors,
          subtleErrors: data.subtleErrors,
          promptingCount: data.promptingCount,
          doubtCount: data.doubtCount,
          recitationScore: data.recitationScore,
          tajweedScore: data.tajweedScore,
          memorizationDeduction: totals.memorizationDeduction,
          totalDeduction: totals.totalDeduction,
          finalScore: totals.finalScore,
        }),
      },
    });
    return saved;
  });

  revalidatePath("/examiner");
  revalidatePath("/examiner/assess");

  // المزامنة الحية: إعلام بقية اللجنة بحفظ التقييم (يبقى قابلاً للتعديل حتى الاعتماد)
  await broadcastAssessmentUpdate(session.id, {
    evaluatorId: user.id,
    finalScore: totals.finalScore,
    assessmentStatus: AssessmentStatus.DRAFT,
  });

  return {
    success: true,
    assessmentId: result.id,
    memorizationDeduction: totals.memorizationDeduction,
    totalDeduction: totals.totalDeduction,
    finalScore: totals.finalScore,
  };
}

/**
 * منطق الاعتماد حسب العمر (المادة 5):
 * - الأكبر سناً يفعّل "اعتماد" (الحالة APPROVED)، ثم يلي ذلك
 * - الأصغر سناً يفعّل "اعتماد نهائي" (الحالة FINALIZED).
 */
export async function approveAssessment(examSessionId: string, action: "approve" | "finalize") {
  const user = await requireUser();

  // عزل الصلاحيات: المقيّم فقط (المادة 8/2)
  requireRole(user, [Role.EXAMINER]);

  const parsed = assessmentApprovalSchema.safeParse({ examSessionId, action });
  if (!parsed.success) {
    throw new Error(parsed.error.issues[0]?.message ?? "بيانات غير صحيحة");
  }

  const session = await assertExaminerInSession(user, examSessionId);

  if (session.status === "CANCELLED") {
    throw new Error("لا يمكن الاعتماد على جلسة ملغاة");
  }
  if (session.status === "COMPLETED") {
    throw new Error("هذه الجلسة اكتملت بالفعل");
  }

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
    if (!teacher1BD || !teacher2BD) {
      throw new Error(
        "تاريخ ميلاد أحد المعلمين غير مكتمل — لا يمكن تحديد الترتيب العمري"
      );
    }
    const teacher1IsOlder = teacher1BD <= teacher2BD;
    if (user.id === session.teacher1Id) return teacher1IsOlder;
    return !teacher1IsOlder;
  };

  const seniorIsUser = isSenior();

  await prisma.$transaction(async (tx) => {
    if (action === "approve") {
      if (!seniorIsUser) {
        throw new Error(
          "المعلم الأصغر سناً لا يقوم بالاعتماد الأول؛ الاعتماد الأول للمعلم الأكبر"
        );
      }
      await tx.assessment.update({
        where: { id: assessment.id },
        data: { status: AssessmentStatus.APPROVED },
      });
      await tx.student.update({
        where: { id: session.student.id },
        data: { status: StudentStatus.ASSIGNED },
      });

      const otherTeacherId =
        user.id === session.teacher1Id ? session.teacher2Id : session.teacher1Id;
      await tx.notification.create({
        data: {
          userId: otherTeacherId,
          message: `اعتمد المعلم الأكبر سناً تقييم الطالب «${session.student.name}» — بانتظار اعتمادك النهائي`,
          type: NotificationType.ASSESSMENT,
          examSessionId: session.id,
        },
      });
    } else {
      if (seniorIsUser) {
        throw new Error(
          "المعلم الأكبر سناً لا يقوم بالاعتماد النهائي؛ الاعتماد النهائي للمعلم الأصغر"
        );
      }
      const seniorTeacherId =
        user.id === session.teacher1Id ? session.teacher2Id : session.teacher1Id;
      const seniorAssessment = await tx.assessment.findFirst({
        where: { examSessionId: session.id, evaluatorId: seniorTeacherId },
        select: { status: true },
      });
      if (!seniorAssessment || seniorAssessment.status !== AssessmentStatus.APPROVED) {
        throw new Error("يجب أن يعتمد المعلم الأكبر التقييم قبل الاعتماد النهائي");
      }
      await tx.assessment.update({
        where: { id: assessment.id },
        data: { status: AssessmentStatus.FINALIZED },
      });
      await tx.student.update({
        where: { id: session.student.id },
        data: { status: StudentStatus.COMPLETED },
      });

      const specialists = await tx.user.findMany({
        where: { role: Role.TEST_SPECIALIST },
        select: { id: true },
      });
      if (specialists.length > 0) {
        await tx.notification.createMany({
          data: specialists.map((s) => ({
            userId: s.id,
            message: `اكتمل تقييم الطالب «${session.student.name}» واعتمده المعلمان — بانتظار اعتمادك الإداري`,
            type: NotificationType.ASSESSMENT,
            examSessionId: session.id,
          })),
        });
      }
    }

    await tx.auditLog.create({
      data: {
        userId: user.id,
        action: AuditAction.APPROVE,
        details: JSON.stringify({
          examSessionId: session.id,
          studentId: session.student.id,
          action,
          role: seniorIsUser ? "senior" : "junior",
        }),
      },
    });
  });

  revalidatePath("/examiner");
  revalidatePath("/examiner/assess");

  // بعد نجاح المعاملة الذرية: توزيع الإشعارات على القنوات الخارجية (دفع/بريد/SMS)
  const channelRecipients =
    action === "approve"
      ? [user.id === session.teacher1Id ? session.teacher2Id : session.teacher1Id]
      : (
          await prisma.user.findMany({
            where: { role: Role.TEST_SPECIALIST },
            select: { id: true },
          })
        ).map((s) => s.id);
  await dispatchNotificationChannels({
    userIds: channelRecipients,
    message:
      action === "approve"
        ? `اعتمد المعلم الأكبر سناً تقييم الطالب «${session.student.name}» — بانتظار اعتمادك النهائي`
        : `اكتمل تقييم الطالب «${session.student.name}» واعتمده المعلمان — بانتظار اعتمادك الإداري`,
    type: NotificationType.ASSESSMENT,
    examSessionId: session.id,
  });

  await broadcastAssessmentUpdate(session.id, {
    evaluatorId: user.id,
    assessmentStatus:
      action === "approve" ? AssessmentStatus.APPROVED : AssessmentStatus.FINALIZED,
  });

  return { success: true, status: action === "approve" ? AssessmentStatus.APPROVED : AssessmentStatus.FINALIZED };
}

/**
 * جلب بيانات التقييم الحالية لجلسة ولجنة (لعرض حالة السجل)
 */
export async function getAssessmentState(examSessionId: string) {
  const user = await requireUser();

  const isAdminOrSpecialist = isAdminRole(user.role);
  if (!isAdminOrSpecialist) {
    await assertExaminerInSession(user, examSessionId);
  }

  return prisma.assessment.findMany({
    where: { examSessionId },
    select: {
      id: true,
      evaluatorId: true,
      wordErrors: true,
      letterErrors: true,
      diacriticErrors: true,
      seriousErrors: true,
      subtleErrors: true,
      promptingCount: true,
      doubtCount: true,
      recitationScore: true,
      tajweedScore: true,
      memorizationDeduction: true,
      totalDeduction: true,
      finalScore: true,
      status: true,
    },
  });
}

/** هل الدور من الأدوار الإدارية العليا؟ */
function isAdminRole(role: Role): boolean {
  const adminRoles = [Role.ADMIN, Role.TEST_SPECIALIST];
  return (adminRoles as Role[]).includes(role);
}