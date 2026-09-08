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
 * يتطلب مصادقة — إذ يُستدعى من إجراءات موثّقة فقط
 */
export async function getCurrentSeason() {
  await requireUser();
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
  if (input.name.length > 200) {
    throw new Error("اسم الموسم طويل جداً (الحد الأقصى 200 حرف)");
  }

  const startDate = new Date(input.startDate);
  const endDate = new Date(input.endDate);
  if (Number.isNaN(startDate.getTime()) || Number.isNaN(endDate.getTime())) {
    throw new Error("تواريخ الموسم غير صحيحة");
  }
  if (endDate <= startDate) {
    throw new Error("تاريخ نهاية الموسم يجب أن يكون بعد تاريخ بدايته");
  }

  // منع إنشاء أكثر من موسم نشط واحد (بيزنس لوجيك)
  if (input.isActive) {
    await prisma.examSeason.updateMany({
      where: { isActive: true },
      data: { isActive: false },
    });
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

  if (!seasonId || typeof seasonId !== "string" || seasonId.length < 1 || seasonId.length > 64) {
    throw new Error("معرّف الموسم غير صالح");
  }

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
 * جلب جميع المواسم — يحتاج مصادقة + صلاحيات إدارية
 */
export async function getExamSeasons() {
  const user = await requireUser();
  requireRole(user, [Role.ADMIN, Role.TEST_SPECIALIST, Role.HEAD_OF_AFFAIRS]);
  return prisma.examSeason.findMany({
    orderBy: { startDate: "desc" },
  });
}
