"use server";

import { requireUser, requireRole } from "@/lib/security";
import { prisma } from "@/lib/prisma";
import { AuditAction, Role } from "@prisma/client";
import { revalidatePath } from "next/cache";
import {
  examModelSchema,
  type ExamModelInput,
} from "@/lib/validations/assessment";

/**
 * إنشاء نموذج اختباري جديد (10 مقاطع) — خاص بأخصائي الاختبارات
 * وفق لائحة اختيار فرع كامل القرآن
 */
export async function createExamModel(input: ExamModelInput) {
  const user = await requireUser();

  // عزل الصلاحيات: الأخصائي فقط
  requireRole(user, [Role.TEST_SPECIALIST, Role.ADMIN]);

  const parsed = examModelSchema.safeParse(input);
  if (!parsed.success) {
    throw new Error(parsed.error.issues[0]?.message ?? "بيانات النموذج غير صحيحة");
  }
  const data = parsed.data;

  // التحقق من وجود الجهة والموسم
  const [institution, season] = await Promise.all([
    prisma.institution.findUnique({
      where: { id: data.institutionId },
      select: { id: true },
    }),
    prisma.examSeason.findUnique({
      where: { id: data.seasonId },
      select: { id: true },
    }),
  ]);

  if (!institution) throw new Error("الجهة التعليمية غير موجودة");
  if (!season) throw new Error("الموسم غير موجود");

  // منع تكرار (الجهة، رقم النموذج، الموسم، الفرع)
  const existing = await prisma.examModel.findFirst({
    where: {
      institutionId: data.institutionId,
      modelNumber: data.modelNumber,
      seasonId: data.seasonId,
      branch: data.branch,
    },
    select: { id: true },
  });
  if (existing) {
    throw new Error(
      `يوجد نموذج برقم ${data.modelNumber} لفرع ${data.branch} أجزاء لهذه الجهة في هذا الموسم`
    );
  }

  const segments = [...data.segments].sort((a, b) => a.number - b.number);

  // التحقق من ترقيم المقاطع المتسلسل 1-10
  segments.forEach((seg, idx) => {
    if (seg.number !== idx + 1) {
      throw new Error("يجب ترقيم المقاطع تسلسلياً من 1 إلى 10");
    }
  });

  const model = await prisma.$transaction(async (tx) => {
    const created = await tx.examModel.create({
      data: {
        modelNumber: data.modelNumber,
        branch: data.branch,
        detailsJSON: { segments },
        institutionId: data.institutionId,
        seasonId: data.seasonId,
      },
    });
    await tx.auditLog.create({
      data: {
        userId: user.id,
        action: AuditAction.CREATE,
        details: JSON.stringify({
          entity: "ExamModel",
          modelId: created.id,
          modelNumber: data.modelNumber,
          branch: data.branch,
          institutionId: data.institutionId,
          segmentsCount: segments.length,
        }),
      },
    });
    return created;
  });

  revalidatePath("/test-specialist/models");

  return { success: true, modelId: model.id };
}

/**
 * تعديل مقاطع نموذج اختباري — خاص بأخصائي الاختبارات
 */
export async function updateExamModel(modelId: string, input: ExamModelInput) {
  const user = await requireUser();

  // عزل الصلاحيات: الأخصائي فقط
  requireRole(user, [Role.TEST_SPECIALIST, Role.ADMIN]);

  if (!modelId || typeof modelId !== "string" || modelId.length > 64) {
    throw new Error("معرّف النموذج غير صالح");
  }

  const parsed = examModelSchema.safeParse(input);
  if (!parsed.success) {
    throw new Error(parsed.error.issues[0]?.message ?? "بيانات النموذج غير صحيحة");
  }
  const data = parsed.data;

  const existing = await prisma.examModel.findUnique({
    where: { id: modelId },
    select: { id: true },
  });
  if (!existing) throw new Error("النموذج غير موجود");

  const segments = [...data.segments].sort((a, b) => a.number - b.number);
  segments.forEach((seg, idx) => {
    if (seg.number !== idx + 1) {
      throw new Error("يجب ترقيم المقاطع تسلسلياً من 1 إلى 10");
    }
  });

  await prisma.$transaction(async (tx) => {
    await tx.examModel.update({
      where: { id: modelId },
      data: {
        modelNumber: data.modelNumber,
        branch: data.branch,
        detailsJSON: { segments },
        institutionId: data.institutionId,
        seasonId: data.seasonId,
      },
    });
    await tx.auditLog.create({
      data: {
        userId: user.id,
        action: AuditAction.UPDATE,
        details: JSON.stringify({
          entity: "ExamModel",
          modelId,
          modelNumber: data.modelNumber,
          branch: data.branch,
        }),
      },
    });
  });

  revalidatePath("/test-specialist/models");

  return { success: true };
}

/**
 * حذف نموذج اختباري — خاص بأخصائي الاختبارات (مع تأكيد)
 */
export async function deleteExamModel(modelId: string) {
  const user = await requireUser();

  // عزل الصلاحيات: الأخصائي فقط
  requireRole(user, [Role.TEST_SPECIALIST, Role.ADMIN]);

  if (!modelId || typeof modelId !== "string" || modelId.length > 64) {
    throw new Error("معرّف النموذج غير صالح");
  }

  const model = await prisma.examModel.findUnique({
    where: { id: modelId },
    select: {
      id: true,
      modelNumber: true,
      branch: true,
      _count: { select: { assessments: true, sessions: true } },
    },
  });
  if (!model) throw new Error("النموذج غير موجود");

  // منع حذف نموذج مستخدم في تقييمات أو جلسات
  if (model._count.assessments > 0 || model._count.sessions > 0) {
    throw new Error(
      "لا يمكن حذف نموذج سبق استخدامه في تقييمات أو جلسات — يمكن تعطيله فقط"
    );
  }

  await prisma.$transaction(async (tx) => {
    await tx.examModel.delete({ where: { id: modelId } });
    await tx.auditLog.create({
      data: {
        userId: user.id,
        action: AuditAction.DELETE,
        details: JSON.stringify({
          entity: "ExamModel",
          modelId,
          modelNumber: model.modelNumber,
          branch: model.branch,
        }),
      },
    });
  });

  revalidatePath("/test-specialist/models");

  return { success: true };
}