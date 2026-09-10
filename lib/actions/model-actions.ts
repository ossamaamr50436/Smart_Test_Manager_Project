"use server";

import { requireUser, requireRole } from "@/lib/security";
import { prisma } from "@/lib/prisma";
import { AuditAction, Role } from "@prisma/client";
import { revalidatePath } from "next/cache";
import {
  examModelSchema,
  type ExamModelInput,
} from "@/lib/validations/assessment";
import {
  isUniqueConstraintError,
  friendlyUniqueMessage,
} from "@/lib/actions/unique-guard";

/**
 * إنشاء نموذج اختباري جديد — خاص بأخصائي الاختبارات
 * وفق لائحة اختيار فرع كامل القرآن (حتى 100 نموذج لكل فرع)
 * النماذج عامة للفرع والموسم (المرحلة 8) — لا تُسند لجهة أثناء الإنشاء
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

  // التحقق من وجود الموسم
  const season = await prisma.examSeason.findUnique({
    where: { id: data.seasonId },
    select: { id: true },
  });
  if (!season) throw new Error("الموسم غير موجود");

  // منع تكرار (رقم النموذج، الموسم، الفرع)
  const existing = await prisma.examModel.findFirst({
    where: {
      modelNumber: data.modelNumber,
      seasonId: data.seasonId,
      branch: data.branch,
    },
    select: { id: true },
  });
  if (existing) {
    throw new Error(
      `يوجد نموذج برقم ${data.modelNumber} لفرع ${data.branch} أجزاء في هذا الموسم`
    );
  }

  const segments = [...data.segments].sort((a, b) => a.number - b.number);

  // التحقق من ترقيم المقاطع المتسلسل حتى عدد المقاطع المختار
  const segmentsCount = data.segmentsCount ?? segments.length;
  if (segments.length !== segmentsCount) {
    throw new Error(
      `عدد المقاطع المحدد (${segmentsCount}) لا يطابق المقاطع المُدخلة (${segments.length})`
    );
  }
  segments.forEach((seg, idx) => {
    if (seg.number !== idx + 1) {
      throw new Error(`يجب ترقيم المقاطع تسلسلياً من 1 إلى ${segmentsCount}`);
    }
  });

  const model = await prisma.$transaction(async (tx) => {
    let created;
    try {
      created = await tx.examModel.create({
        data: {
          modelNumber: data.modelNumber,
          branch: data.branch,
          detailsJSON: { segments },
          segmentsCount,
          institutionId: null,
          seasonId: data.seasonId,
        },
      });
    } catch (error) {
      if (isUniqueConstraintError(error)) throw new Error(friendlyUniqueMessage(error));
      throw error;
    }
    await tx.auditLog.create({
      data: {
        userId: user.id,
        action: AuditAction.CREATE,
        details: JSON.stringify({
          entity: "ExamModel",
          modelId: created.id,
          modelNumber: data.modelNumber,
          branch: data.branch,
          segmentsCount,
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
  const segmentsCount = data.segmentsCount ?? segments.length;
  if (segments.length !== segmentsCount) {
    throw new Error(
      `عدد المقاطع المحدد (${segmentsCount}) لا يطابق المقاطع المُدخلة (${segments.length})`
    );
  }
  segments.forEach((seg, idx) => {
    if (seg.number !== idx + 1) {
      throw new Error(`يجب ترقيم المقاطع تسلسلياً من 1 إلى ${segmentsCount}`);
    }
  });

  await prisma.$transaction(async (tx) => {
    await tx.examModel.update({
      where: { id: modelId },
      data: {
        modelNumber: data.modelNumber,
        branch: data.branch,
        detailsJSON: { segments },
        segmentsCount,
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
          segmentsCount,
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

// ============================================================
// المهمة 3: توزيع النماذج على اللجان (نطاق محدد لكل لجنة)
// اللجنة = لجنة اختبار (Committee)
// ============================================================

export async function allocateCommitteeModelRange(input: {
  committeeId: string;
  branch: string;
  startModelNumber: number;
  endModelNumber: number;
}) {
  const user = await requireUser();

  // عزل الصلاحيات: الأخصائي فقط
  requireRole(user, [Role.TEST_SPECIALIST, Role.ADMIN]);

  if (!input.committeeId || typeof input.committeeId !== "string" || input.committeeId.length > 64) {
    throw new Error("معرّف اللجنة غير صالح");
  }

  const validBranches = ["5", "10", "15", "20", "25", "30"];
  if (!validBranches.includes(input.branch)) {
    throw new Error("الفرع غير صالح");
  }

  const start = Number(input.startModelNumber);
  const end = Number(input.endModelNumber);
  if (!Number.isInteger(start) || !Number.isInteger(end)) {
    throw new Error("أرقام النماذج يجب أن تكون أعداداً صحيحة");
  }
  if (start < 1 || end > 100 || start > end) {
    throw new Error("نطاق النماذج يجب أن يكون بين 1 و 100 مع بداية أصغر من النهاية");
  }

  // التحقق من وجود اللجنة وجلب موسمها
  const committee = await prisma.committee.findUnique({
    where: { id: input.committeeId },
    select: { id: true, seasonId: true },
  });
  if (!committee) throw new Error("اللجنة غير موجودة");

  // التحقق من عدم تكرار نطاق متداخل لنفس الفرع على لجان أخرى
  const overlapping = await prisma.committeeModelAllocation.findFirst({
    where: {
      branch: input.branch,
      seasonId: committee.seasonId,
      committeeId: { not: input.committeeId },
      startModelNumber: { lte: end },
      endModelNumber: { gte: start },
    },
    select: { id: true },
  });
  if (overlapping) {
    throw new Error("يوجد توزيع سابق يتداخل مع هذا النطاق على لجنة أخرى لنفس الفرع");
  }

  const allocation = await prisma.$transaction(async (tx) => {
    const result = await tx.committeeModelAllocation.upsert({
      where: {
        committeeId_branch: {
          committeeId: input.committeeId,
          branch: input.branch,
        },
      },
      update: { startModelNumber: start, endModelNumber: end },
      create: {
        committeeId: input.committeeId,
        branch: input.branch,
        startModelNumber: start,
        endModelNumber: end,
        seasonId: committee.seasonId,
      },
    });
    await tx.auditLog.create({
      data: {
        userId: user.id,
        action: AuditAction.UPDATE,
        details: JSON.stringify({
          entity: "CommitteeModelAllocation",
          committeeId: input.committeeId,
          branch: input.branch,
          startModelNumber: start,
          endModelNumber: end,
          seasonId: committee.seasonId,
        }),
      },
    });
    return result;
  });

  revalidatePath("/test-specialist/committees");
  revalidatePath("/test-specialist/models");

  return { success: true, allocationId: allocation.id };
}

/**
 * جلب توزيعات النماذج على اللجان
 */
export async function getCommitteeModelAllocations(seasonId?: string) {
  const user = await requireUser();
  requireRole(user, [Role.TEST_SPECIALIST, Role.ADMIN]);

  return prisma.committeeModelAllocation.findMany({
    where: seasonId ? { seasonId } : undefined,
    include: {
      committee: {
        select: {
          id: true,
          name: true,
          branch: true,
          teacher1: { select: { id: true, name: true } },
          teacher2: { select: { id: true, name: true } },
          season: { select: { id: true, name: true } },
        },
      },
    },
    orderBy: { createdAt: "desc" },
  });
}