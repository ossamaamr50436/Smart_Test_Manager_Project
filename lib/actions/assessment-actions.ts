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
 * إيجاد نموذج اختباري للطالب في الموسم النشط
 * (المادة 6 — النماذج مرتبطة بالموسم والفرع)
 * يعمل مع الجلسات القديمة (ExamSession) واللجان الجديدة (Committee)
 */
async function resolveModelId(
  sessionId: string,
  branch: string
): Promise<string | null> {
  const season = await getCurrentSeason();

  // محاولة العثور على نموذج للفرع في الموسم الحالي
  const model = await prisma.examModel.findFirst({
    where: {
      branch,
      ...(season ? { seasonId: season.id } : {}),
    },
    select: { id: true, modelNumber: true },
    orderBy: { modelNumber: "asc" },
  });

  if (model) return model.id;

  // محاولة إنشاء من Google Drive
  try {
    const models = await getExamModelsFromDrive();
    const driveModel = models[0];
    if (driveModel && season) {
      const created = await prisma.examModel.create({
        data: {
          modelNumber: 1,
          branch,
          detailsJSON: { source: "drive", fileId: driveModel.fileId, name: driveModel.name },
          seasonId: season.id,
        },
      });
      return created.id;
    }
  } catch {
    // تجاهل
  }

  return null;
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
        tajweedErrors: data.tajweedErrors,
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
        tajweedErrors: data.tajweedErrors,
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
          tajweedErrors: data.tajweedErrors,
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
 * اعتماد التقييم — يعتمد المختبر تقييمه الخاص بشكل مستقل
 * (بدون ترتيب حسب العمر، وبدون انتظار تقييم مختبر آخر).
 * الحالة النهائية لتقييم المختبر: APPROVED.
 */
export async function approveAssessment(examSessionId: string) {
  const user = await requireUser();

  // عزل الصلاحيات: المقيّم فقط (المادة 8/2)
  requireRole(user, [Role.EXAMINER]);

  const parsed = assessmentApprovalSchema.safeParse({ examSessionId });
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
  if (assessment.status !== AssessmentStatus.DRAFT) {
    throw new Error("تم اعتماد هذا التقييم مسبقاً");
  }

  await prisma.$transaction(async (tx) => {
    // اعتماد تقييم المختبر الحالي فقط
    await tx.assessment.update({
      where: { id: assessment.id },
      data: { status: AssessmentStatus.APPROVED },
    });

    // الطالب لديه الآن تقييم معتمد — يُعرض للأخصائي للمراجعة
    await tx.student.update({
      where: { id: session.student.id },
      data: { status: StudentStatus.COMPLETED },
    });

    // إشعار الأخصائيين بمراجعة تقييم الطالب المعتمد
    const specialists = await tx.user.findMany({
      where: { role: Role.TEST_SPECIALIST },
      select: { id: true },
    });
    if (specialists.length > 0) {
      await tx.notification.createMany({
        data: specialists.map((s) => ({
          userId: s.id,
          message: `اعتمد المختبر تقييم الطالب «${session.student.name}» — بانتظار مراجعتك`,
          type: NotificationType.ASSESSMENT,
          examSessionId: session.id,
        })),
      });
    }

    await tx.auditLog.create({
      data: {
        userId: user.id,
        action: AuditAction.APPROVE,
        details: JSON.stringify({
          examSessionId: session.id,
          studentId: session.student.id,
          status: AssessmentStatus.APPROVED,
        }),
      },
    });
  });

  revalidatePath("/examiner");
  revalidatePath("/examiner/assess");

  // بعد نجاح المعاملة الذرية: توزيع الإشعارات على القنوات الخارجية (دفع/بريد/SMS)
  const specialists = await prisma.user.findMany({
    where: { role: Role.TEST_SPECIALIST },
    select: { id: true },
  });
  await dispatchNotificationChannels({
    userIds: specialists.map((s) => s.id),
    message: `اعتمد المختبر تقييم الطالب «${session.student.name}» — بانتظار مراجعتك`,
    type: NotificationType.ASSESSMENT,
    examSessionId: session.id,
  });

  await broadcastAssessmentUpdate(session.id, {
    evaluatorId: user.id,
    assessmentStatus: AssessmentStatus.APPROVED,
  });

  return { success: true, status: AssessmentStatus.APPROVED };
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
      tajweedErrors: true,
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