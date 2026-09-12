"use server";

import { requireUser, requireRole, requireTenantId } from "@/lib/security";
import { requireTenant } from "@/lib/tenancy";
import { prisma } from "@/lib/prisma";
import { AuditAction, Role } from "@prisma/client";
import { revalidatePath } from "next/cache";

// ============================================================
// المهمة 6: إعدادات التقييم (Singleton لكل مستأجر)
// يضبطها الأخصائي فقط — تحكم خصومات الأخطاء والشك والتجويد
// ============================================================

export async function getAssessmentSettings() {
  const user = await requireUser();
  const tenantId = requireTenant(user);

  const settings = await prisma.assessmentSettings.findUnique({
    where: { tenantId },
  });
  // القيم الافتراضية
  return {
    errorDeduction: settings?.errorDeduction ?? 2.0,
    doubtDeduction: settings?.doubtDeduction ?? 1.0,
    tajweedDeduction: settings?.tajweedDeduction ?? 0.5,
  };
}

export async function updateAssessmentSettings(input: {
  errorDeduction: number;
  doubtDeduction: number;
  tajweedDeduction: number;
}) {
  const user = await requireUser();
  requireRole(user, [Role.TEST_SPECIALIST, Role.ADMIN]);

  if (input.errorDeduction < 0 || input.errorDeduction > 10) {
    throw new Error("خصم الخطأ يجب أن يكون بين 0 و 10");
  }
  if (input.doubtDeduction < 0 || input.doubtDeduction > 10) {
    throw new Error("خصم الشك يجب أن يكون بين 0 و 10");
  }
  if (input.tajweedDeduction < 0 || input.tajweedDeduction > 10) {
    throw new Error("خصم التجويد يجب أن يكون بين 0 و 10");
  }

  await prisma.$transaction(async (tx) => {
    await tx.assessmentSettings.upsert({
      where: { tenantId: requireTenantId(user) },
      update: {
        errorDeduction: input.errorDeduction,
        doubtDeduction: input.doubtDeduction,
        tajweedDeduction: input.tajweedDeduction,
      },
      create: {
        id: "singleton",
        errorDeduction: input.errorDeduction,
        doubtDeduction: input.doubtDeduction,
        tajweedDeduction: input.tajweedDeduction,
        tenantId: requireTenantId(user),
      },
    });

    await tx.auditLog.create({
      data: {
        userId: user.id,
        tenantId: requireTenantId(user),
        action: AuditAction.UPDATE,
        details: JSON.stringify({
          entity: "AssessmentSettings",
          ...input,
        }),
      },
    });
  });

  revalidatePath("/test-specialist/assessment-settings");
  return { success: true };
}
