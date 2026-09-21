"use server";

import { requireUser, requireRole, requireTenantId } from "@/lib/security";
import { prisma } from "@/lib/prisma";
import { getTenantFilter, assertSameTenant } from "@/lib/tenancy";
import { AuditAction, Role, Prisma } from "@prisma/client";
import { revalidatePath } from "next/cache";
import {
  questionBankSchema,
  type QuestionBankInput,
} from "@/lib/validations/question-bank";
import {
  isUniqueConstraintError,
  friendlyUniqueMessage,
} from "@/lib/actions/unique-guard";

const VALID_ROLES: Role[] = [Role.TEST_SPECIALIST, Role.ADMIN];

// M7: حساب MAX + 1 لفرع محدد داخل معاملة لضمان الترقيم التسلسلي
async function computeNextModelNumber(
  tx: Prisma.TransactionClient,
  tenantId: string,
  branch: string
): Promise<number> {
  const agg = await tx.questionBankModel.aggregate({
    where: { tenantId, branch },
    _max: { modelNumber: true },
  });
  return (agg._max.modelNumber ?? 0) + 1;
}

export async function createExamModel(input: QuestionBankInput) {
  const user = await requireUser();
  requireRole(user, VALID_ROLES);

  const parsed = questionBankSchema.safeParse(input);
  if (!parsed.success) {
    throw new Error(parsed.error.issues[0]?.message ?? "بيانات النموذج غير صحيحة");
  }
  const data = parsed.data;

  const segments = [...data.segments].sort((a, b) => a.number - b.number);
  if (segments.length !== data.segmentsCount) {
    throw new Error(
      `عدد المقاطع المحدد (${data.segmentsCount}) لا يطابق المقاطع المُدخلة (${segments.length})`
    );
  }
  segments.forEach((seg, idx) => {
    if (seg.number !== idx + 1) {
      throw new Error(`يجب ترقيم المقاطع تسلسلياً من 1 إلى ${data.segmentsCount}`);
    }
  });

  const tenantId = requireTenantId(user);

  const model = await prisma.$transaction(async (tx) => {
    // M7: رقم النموذج التالي يُحسب على الخادم (MAX + 1) — يتجاهل قيمة العميل نهائياً
    const nextModelNumber = await computeNextModelNumber(tx, tenantId, data.branch);
    let created;
    try {
      created = await tx.questionBankModel.create({
        data: {
          modelNumber: nextModelNumber,
          branch: data.branch,
          detailsJSON: { segments },
          segmentsCount: data.segmentsCount,
          tenantId,
        },
      });
    } catch (error) {
      if (isUniqueConstraintError(error)) throw new Error(friendlyUniqueMessage(error));
      throw error;
    }
    await tx.auditLog.create({
      data: {
        userId: user.id,
        tenantId,
        action: AuditAction.CREATE,
        details: JSON.stringify({
          entity: "QuestionBankModel",
          modelId: created.id,
          modelNumber: nextModelNumber,
          branch: data.branch,
        }),
      },
    });
    return created;
  });

  revalidatePath("/test-specialist/models");
  revalidatePath("/admin/models");
  revalidatePath("/admin/question-bank");

  return { success: true, modelId: model.id };
}

export async function updateExamModel(modelId: string, input: QuestionBankInput) {
  const user = await requireUser();
  requireRole(user, VALID_ROLES);

  if (!modelId || typeof modelId !== "string" || modelId.length > 64) {
    throw new Error("معرّف النموذج غير صالح");
  }

  const parsed = questionBankSchema.safeParse(input);
  if (!parsed.success) {
    throw new Error(parsed.error.issues[0]?.message ?? "بيانات النموذج غير صحيحة");
  }
  const data = parsed.data;

  const existing = await prisma.questionBankModel.findUnique({
    where: { id: modelId },
    select: { id: true, tenantId: true },
  });
  if (!existing) throw new Error("النموذج غير موجود");
  assertSameTenant(user, existing);

  const segments = [...data.segments].sort((a, b) => a.number - b.number);
  if (segments.length !== data.segmentsCount) {
    throw new Error(
      `عدد المقاطع المحدد (${data.segmentsCount}) لا يطابق المقاطع المُدخلة (${segments.length})`
    );
  }
  segments.forEach((seg, idx) => {
    if (seg.number !== idx + 1) {
      throw new Error(`يجب ترقيم المقاطع تسلسلياً من 1 إلى ${data.segmentsCount}`);
    }
  });

  const duplicate = await prisma.questionBankModel.findFirst({
    where: {
      ...getTenantFilter(user),
      modelNumber: data.modelNumber,
      branch: data.branch,
      id: { not: modelId },
    },
    select: { id: true },
  });
  if (duplicate) {
    throw new Error(`يوجد نموذج آخر برقم ${data.modelNumber} لفرع ${data.branch} أجزاء`);
  }

  await prisma.$transaction(async (tx) => {
    await tx.questionBankModel.update({
      where: { id: modelId },
      data: {
        modelNumber: data.modelNumber,
        branch: data.branch,
        detailsJSON: { segments },
        segmentsCount: data.segmentsCount,
      },
    });
    await tx.auditLog.create({
      data: {
        userId: user.id,
        tenantId: requireTenantId(user),
        action: AuditAction.UPDATE,
        details: JSON.stringify({
          entity: "QuestionBankModel",
          modelId,
          modelNumber: data.modelNumber,
          branch: data.branch,
        }),
      },
    });
  });

  revalidatePath("/test-specialist/models");
  revalidatePath("/admin/models");
  revalidatePath("/admin/question-bank");

  return { success: true };
}

export async function deleteExamModel(modelId: string) {
  const user = await requireUser();
  requireRole(user, VALID_ROLES);

  if (!modelId || typeof modelId !== "string" || modelId.length > 64) {
    throw new Error("معرّف النموذج غير صالح");
  }

  const model = await prisma.questionBankModel.findUnique({
    where: { id: modelId },
    select: {
      id: true,
      modelNumber: true,
      branch: true,
      tenantId: true,
      _count: { select: { assessments: true, sessions: true } },
    },
  });
  if (!model) throw new Error("النموذج غير موجود");
  assertSameTenant(user, model);

  if (model._count.assessments > 0 || model._count.sessions > 0) {
    throw new Error(
      "لا يمكن حذف نموذج سبق استخدامه في تقييمات أو جلسات — يمكن تعطيله فقط"
    );
  }

  await prisma.$transaction(async (tx) => {
    await tx.questionBankModel.delete({ where: { id: modelId } });
    await tx.auditLog.create({
      data: {
        userId: user.id,
        tenantId: requireTenantId(user),
        action: AuditAction.DELETE,
        details: JSON.stringify({
          entity: "QuestionBankModel",
          modelId,
          modelNumber: model.modelNumber,
          branch: model.branch,
        }),
      },
    });
  });

  revalidatePath("/test-specialist/models");
  revalidatePath("/admin/models");
  revalidatePath("/admin/question-bank");

  return { success: true };
}

// ============================================================
// اختيار يدوي للنماذج من بنك الأسئلة لكل لجنة
// بدل النطاق الرقمي السابق — بلا ترتيب
// ============================================================

export async function setCommitteeSelectedModels(input: {
  committeeId: string;
  modelIds: string[];
}) {
  const user = await requireUser();
  requireRole(user, VALID_ROLES);

  if (!input.committeeId || typeof input.committeeId !== "string" || input.committeeId.length > 64) {
    throw new Error("معرّف اللجنة غير صالح");
  }

  const committee = await prisma.committee.findUnique({
    where: { id: input.committeeId },
    select: { id: true, branch: true, seasonId: true, tenantId: true },
  });
  if (!committee) throw new Error("اللجنة غير موجودة");
  assertSameTenant(user, committee);

  const validModels = await prisma.questionBankModel.findMany({
    where: {
      ...getTenantFilter(user),
      branch: committee.branch,
      id: { in: input.modelIds },
    },
    select: { id: true },
  });
  if (validModels.length !== input.modelIds.length) {
    throw new Error("بعض النماذج المحددة غير موجودة أو لا تتطابق مع فرع اللجنة");
  }

  await prisma.$transaction(async (tx) => {
    await tx.committeeModelSelection.deleteMany({ where: { committeeId: input.committeeId } });
    if (validModels.length > 0) {
      await tx.committeeModelSelection.createMany({
        data: validModels.map((m) => ({ committeeId: input.committeeId, modelId: m.id })),
      });
    }
    await tx.auditLog.create({
      data: {
        userId: user.id,
        tenantId: requireTenantId(user),
        action: AuditAction.UPDATE,
        details: JSON.stringify({
          entity: "CommitteeModelSelection",
          committeeId: input.committeeId,
          selectedCount: validModels.length,
        }),
      },
    });
  });

  revalidatePath("/test-specialist/committees");
  revalidatePath("/test-specialist/models");

  return { success: true };
}

export async function getCommitteeSelectedModelIds(committeeId: string) {
  const user = await requireUser();
  requireRole(user, VALID_ROLES);

  const selections = await prisma.committeeModelSelection.findMany({
    where: { committeeId },
    select: { modelId: true },
  });
  return selections.map((s) => s.modelId);
}
