"use server";

import { requireUser, requireRole } from "@/lib/security";
import { prisma } from "@/lib/prisma";
import { AuditAction, Role } from "@prisma/client";
import { revalidatePath } from "next/cache";

// ============================================================
// المهمة 6: إعدادات التقييم (Singleton)
// يضبطها الأخصائي فقط — تحكم خصومات الأخطاء والشك والتجويد
// ============================================================

export async function getAssessmentSettings() {
  const settings = await prisma.assessmentSettings.findUnique({
    where: { id: "singleton" },
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
      where: { id: "singleton" },
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
      },
    });

    await tx.auditLog.create({
      data: {
        userId: user.id,
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
