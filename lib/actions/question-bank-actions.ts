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

const VALID_ROLES: Role[] = [Role.ADMIN, Role.TEST_SPECIALIST];

export type NextModelNumbers = Record<string, number>;

// M7: حساب رقم النموذج التالي تلقائياً (MAX + 1) لكل فرع — معزول عزل tenants
export async function getNextModelNumbers(): Promise<NextModelNumbers> {
  const user = await requireUser();
  requireRole(user, VALID_ROLES);

  const grouped = await prisma.questionBankModel.groupBy({
    by: ["branch"],
    where: getTenantFilter(user),
    _max: { modelNumber: true },
  });

  const next: NextModelNumbers = {};
  for (const g of grouped) {
    next[g.branch] = (g._max.modelNumber ?? 0) + 1;
  }
  return next;
}

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

export async function getQuestionBankModels() {
  const user = await requireUser();
  requireRole(user, VALID_ROLES);

  return prisma.questionBankModel.findMany({
    where: getTenantFilter(user),
    orderBy: [{ branch: "asc" }, { modelNumber: "asc" }],
    take: 200,
  });
}

export async function createQuestionBankModel(input: QuestionBankInput) {
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

  revalidatePath("/admin/question-bank");
  return { success: true, modelId: model.id };
}

export async function updateQuestionBankModel(
  modelId: string,
  input: QuestionBankInput
) {
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

  // تحقق من عدم التكرار مع نموذج آخر
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
    throw new Error(
      `يوجد نموذج آخر برقم ${data.modelNumber} لفرع ${data.branch} أجزاء`
    );
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

  revalidatePath("/admin/question-bank");
  return { success: true };
}

export async function deleteQuestionBankModel(modelId: string) {
  const user = await requireUser();
  requireRole(user, VALID_ROLES);

  if (!modelId || typeof modelId !== "string" || modelId.length > 64) {
    throw new Error("معرّف النموذج غير صالح");
  }

  const model = await prisma.questionBankModel.findUnique({
    where: { id: modelId },
    select: { id: true, modelNumber: true, branch: true, tenantId: true },
  });
  if (!model) throw new Error("النموذج غير موجود");
  assertSameTenant(user, model);

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

  revalidatePath("/admin/question-bank");
  return { success: true };
}