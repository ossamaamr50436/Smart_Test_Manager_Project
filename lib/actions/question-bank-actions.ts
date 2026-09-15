"use server";

import { requireUser, requireRole, requireTenantId } from "@/lib/security";
import { prisma } from "@/lib/prisma";
import { getTenantFilter, assertSameTenant } from "@/lib/tenancy";
import { AuditAction, Role } from "@prisma/client";
import { revalidatePath } from "next/cache";
import {
  examSegmentSchema,
  BRANCHES,
} from "@/lib/validations/assessment";
import { z } from "zod";

const VALID_ROLES: Role[] = [Role.ADMIN, Role.TEST_SPECIALIST];

const questionBankSchema = z.object({
  modelNumber: z.coerce
    .number()
    .int("رقم النموذج يجب أن يكون عدداً صحيحاً")
    .min(1, "رقم النموذج يبدأ من 1")
    .max(100, "عدد النماذج لكل فرع هو 100"),
  branch: z.enum(BRANCHES, { message: "الفرع غير صالح" }),
  segmentsCount: z.coerce
    .number({ invalid_type_error: "عدد المقاطع يجب أن يكون رقماً" })
    .int("عدد المقاطع يجب أن يكون عدداً صحيحاً")
    .min(1, "عدد المقاطع لا يقل عن 1")
    .max(30, "عدد المقاطع لا يتجاوز 30"),
  segments: z
    .array(examSegmentSchema)
    .min(1, "يجب أن يتضمن النموذج مقطعاً واحداً على الأقل")
    .max(30, "عدد المقاطع لا يتجاوز 30"),
});

type QuestionBankInput = z.infer<typeof questionBankSchema>;

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

  // تحقق من عدم التكرار
  const existing = await prisma.questionBankModel.findFirst({
    where: {
      ...getTenantFilter(user),
      modelNumber: data.modelNumber,
      branch: data.branch,
    },
    select: { id: true },
  });
  if (existing) {
    throw new Error(
      `يوجد نموذج برقم ${data.modelNumber} لفرع ${data.branch} أجزاء في بنك الأسئلة`
    );
  }

  const model = await prisma.$transaction(async (tx) => {
    const created = await tx.questionBankModel.create({
      data: {
        modelNumber: data.modelNumber,
        branch: data.branch,
        detailsJSON: { segments },
        segmentsCount: data.segmentsCount,
        tenantId: requireTenantId(user),
      },
    });
    await tx.auditLog.create({
      data: {
        userId: user.id,
        tenantId: requireTenantId(user),
        action: AuditAction.CREATE,
        details: JSON.stringify({
          entity: "QuestionBankModel",
          modelId: created.id,
          modelNumber: data.modelNumber,
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