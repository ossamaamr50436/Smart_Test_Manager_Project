"use server";

import { prisma } from "@/lib/prisma";
import { requireUser, requireRole } from "@/lib/security";
import { Role, AuditAction } from "@prisma/client";

// ============================================================
// نظام مواسم الاختبارات (المادة 6)
// - الموسم النشط يحدد النماذج والجلسات المستخدمة
// - منع تكرار النموذج على طالبين في نفس الموسم
// ============================================================

/**
 * جلب الموسم النشط حالياً
 * (يُستخدم لتحديد seasonId عند إنشاء جلسة أو اختيار نموذج)
 */
export async function getCurrentSeason() {
  const season = await prisma.examSeason.findFirst({
    where: { isActive: true },
    orderBy: { startDate: "desc" },
  });
  return season;
}

/**
 * إنشاء موسم اختبارات جديد (ADMIN / TEST_SPECIALIST)
 */
export async function createExamSeason(input: {
  name: string;
  startDate: string;
  endDate: string;
  isActive?: boolean;
}) {
  const user = await requireUser();
  requireRole(user, [Role.ADMIN, Role.TEST_SPECIALIST]);

  if (!input.name || input.name.trim().length < 2) {
    throw new Error("اسم الموسم مطلوب");
  }

  const startDate = new Date(input.startDate);
  const endDate = new Date(input.endDate);
  if (Number.isNaN(startDate.getTime()) || Number.isNaN(endDate.getTime())) {
    throw new Error("تواريخ الموسم غير صحيحة");
  }
  if (endDate <= startDate) {
    throw new Error("تاريخ نهاية الموسم يجب أن يكون بعد تاريخ بدايته");
  }

  const season = await prisma.examSeason.create({
    data: {
      name: input.name.trim(),
      startDate,
      endDate,
      isActive: input.isActive ?? false,
    },
  });

  await prisma.auditLog.create({
    data: {
      userId: user.id,
      action: AuditAction.CREATE,
      details: JSON.stringify({ entity: "ExamSeason", seasonId: season.id, name: season.name }),
    },
  });

  return { success: true, seasonId: season.id };
}

/**
 * تفعيل/إلغاء موسم (ADMIN / TEST_SPECIALIST)
 * عند التفعيل، يُلغى تفعيل باقي المواسم
 */
export async function setSeasonActive(seasonId: string, isActive: boolean) {
  const user = await requireUser();
  requireRole(user, [Role.ADMIN, Role.TEST_SPECIALIST]);

  const season = await prisma.examSeason.findUnique({
    where: { id: seasonId },
    select: { id: true, name: true },
  });
  if (!season) {
    throw new Error("الموسم غير موجود");
  }

  if (isActive) {
    await prisma.examSeason.updateMany({
      where: { isActive: true },
      data: { isActive: false },
    });
  }

  await prisma.examSeason.update({
    where: { id: seasonId },
    data: { isActive },
  });

  await prisma.auditLog.create({
    data: {
      userId: user.id,
      action: AuditAction.UPDATE,
      details: JSON.stringify({ entity: "ExamSeason", seasonId, isActive, name: season.name }),
    },
  });

  return { success: true };
}

/**
 * جلب جميع المواسم
 */
export async function getExamSeasons() {
  return prisma.examSeason.findMany({
    orderBy: { startDate: "desc" },
  });
}
