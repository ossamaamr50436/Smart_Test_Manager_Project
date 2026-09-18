"use server";

import { cache } from "react";
import { prisma } from "@/lib/prisma";
import { requireUser, requireRole } from "@/lib/security";
import { Role, AuditAction } from "@prisma/client";
import { revalidatePath, revalidateTag } from "next/cache";
import {
  deleteFile,
  isTrustedStoredUrl,
  isValidFileKey,
} from "@/lib/file-storage";
import { checkRateLimit } from "@/lib/rate-limit";

// ============================================================
// إعدادات المنصة الديناميكية (الاسم + الشعار)
// - getPlatformSettings(): دالة عامة (لا تحتاج مصادقة)
// - updatePlatformSettings(): عزل صلاحيات — ADMIN فقط
// ============================================================

export type PlatformSettings = {
  platformName: string;
  logoUrl: string | null;
  logoFileId: string | null;
  useTemplateMode: boolean;
  templateFileId: string | null;
  primaryColor: string;
  secondaryColor: string;
  whatsappNumber: string | null;
  darkModeEnabled: boolean;
  requireStudentApplicationFile: boolean;
  showTutorialSection: boolean;
};

/**
 * جلب إعدادات المنصة (دالة عامة)
 * استعلام/إنشاء ذري عبر upsert — يمنع سباق الإنشاء أثناء توليد الصفحات المسبق
 *
 * تحسين الأداء: React.cache يضمن تنفيذ استعلام واحد فقط لكل طلب
 * (تُستدعى هذه الدالة من اللوحة، صفحة الدخول، وزر الإصدار في آن واحد)
 */
export const getPlatformSettings = cache(
  async (): Promise<PlatformSettings> => {
    const settings = await prisma.appSettings.upsert({
      where: { id: "singleton" },
      update: {},
      create: { id: "singleton" },
    });

    return {
      platformName: settings.platformName,
      logoUrl: settings.logoUrl,
      logoFileId: settings.logoFileId,
      useTemplateMode: settings.useTemplateMode,
      templateFileId: settings.templateFileId,
      primaryColor: settings.primaryColor,
      secondaryColor: settings.secondaryColor,
      whatsappNumber: settings.whatsappNumber,
      darkModeEnabled: settings.darkModeEnabled,
      requireStudentApplicationFile: settings.requireStudentApplicationFile,
      showTutorialSection: settings.showTutorialSection,
    };
  }
);

/**
 * تحديث إعدادات المنصة (SUPER_ADMIN فقط)
 * - يسمح بتغيير الاسم والشعار (إعدادات عامة على مستوى المنصة)
 * - الشعار يُرفع من الواجهة عبر UploadThing (client-side) ويمرر للدالة URL فقط
 * - يسجّل العملية في AuditLog
 */
export async function updatePlatformSettings(
  platformName: string,
  logo?: { url: string; fileId: string }
): Promise<{ success: boolean }> {
  const user = await requireUser();
  requireRole(user, [Role.SUPER_ADMIN]);

  if (!platformName || platformName.trim().length === 0) {
    throw new Error("اسم المنصة مطلوب");
  }
  if (platformName.trim().length > 100) {
    throw new Error("اسم المنصة طويل جداً (الحد الأقصى 100 حرف)");
  }
  // منع حقن HTML كطبقة دفاع إضافية
  if (/<[^>]*>/.test(platformName)) {
    throw new Error("اسم المنصة لا يسمح بوسوم HTML");
  }
  if (logo) {
    // الشعار وصل من العميل — التحقق من أنه رابط UploadThing موثوق ومعرّف ملف صالح
    if (!isTrustedStoredUrl(logo.url) || !isValidFileKey(logo.fileId)) {
      throw new Error("الرابط المرفوع غير موثوق — أعد رفع الشعار");
    }
  }

  // منع إساءة الاستخدام (رفع ملفات متكررة)
  await checkRateLimit(`settings-update:${user.id}`, 10);

  const data: {
    platformName: string;
    logoUrl?: string;
    logoFileId?: string;
  } = { platformName: platformName.trim() };

  if (logo) {
    // حذف الشعار القديم من وحدة التخزين قبل ربط الجديد (منع تراكم الملفات)
    const prev = await prisma.appSettings.findUnique({
      where: { id: "singleton" },
      select: { logoFileId: true },
    });
    data.logoUrl = logo.url;
    data.logoFileId = logo.fileId;
    if (prev?.logoFileId && prev.logoFileId !== logo.fileId) {
      try {
        await deleteFile(prev.logoFileId);
      } catch {
        // الشعار الجديد رُبط بنجاح — فشل حذف القديم لا يمنع التحديث
      }
    }
  }

  await prisma.appSettings.upsert({
    where: { id: "singleton" },
    update: data,
    create: { id: "singleton", ...data },
  });

  // تسجيل في AuditLog (المادة 8 — Admin)
  await prisma.auditLog.create({
    data: {
      userId: user.id,
      tenantId: user.tenantId,
      action: AuditAction.UPDATE,
      details: JSON.stringify({
        entity: "AppSettings",
        platformName: data.platformName,
        logoUpdated: !!logo,
      }),
    },
  });

  revalidateTag("platform-settings");
  revalidatePath("/super-admin/settings");
  revalidatePath("/admin");
  revalidatePath("/");
  revalidatePath("/login");

  return { success: true };
}

/**
 * إزالة شعار المنصة والعودة إلى الشعار الافتراضي (SUPER_ADMIN فقط)
 */
export async function removePlatformLogo(): Promise<{ success: boolean }> {
  const user = await requireUser();
  requireRole(user, [Role.SUPER_ADMIN]);

  await checkRateLimit(`settings-update:${user.id}`, 10);

  const current = await prisma.appSettings.findUnique({
    where: { id: "singleton" },
    select: { logoFileId: true },
  });

  // حذف الملف القديم من وحدة التخزين إن وُجد
  try {
    await deleteFile(current?.logoFileId);
  } catch {
    // نستمر بالحذف من قاعدة البيانات حتى لو فشل الحذف من التخزين
  }

  await prisma.appSettings.upsert({
    where: { id: "singleton" },
    update: { logoUrl: null, logoFileId: null },
    create: { id: "singleton" },
  });

  await prisma.auditLog.create({
    data: {
      userId: user.id,
      tenantId: user.tenantId,
      action: AuditAction.UPDATE,
      details: JSON.stringify({
        entity: "AppSettings",
        action: "remove-logo",
        removedFileId: current?.logoFileId ?? null,
      }),
    },
  });

  revalidateTag("platform-settings");
  revalidatePath("/super-admin/settings");
  revalidatePath("/");
  revalidatePath("/login");

  return { success: true };
}

/**
 * تحديث وضع القالب الذكي للشهادات (ADMIN فقط)
 * - قالب PDF يُرفع من الواجهة عبر UploadThing (client-side) ويُمرر للدالة URL فقط
 */
export async function updateTemplateSettings(
  useTemplateMode: boolean,
  templateUrl?: string
): Promise<{ success: boolean }> {
  const user = await requireUser();
  requireRole(user, [Role.ADMIN, Role.SUPER_ADMIN]);

  if (templateUrl !== undefined && !isTrustedStoredUrl(templateUrl)) {
    throw new Error("رابط قالب الشهادة غير موثوق — أعد رفع القالب");
  }

  // منع إساءة الاستخدام (رفع قوالب متكررة)
  await checkRateLimit(`settings-update:${user.id}`, 10);

  const data: {
    useTemplateMode: boolean;
    templateFileId?: string;
  } = { useTemplateMode };

  if (templateUrl !== undefined) {
    // نخزّن الرابط المباشر بدلاً من المعرّف — وحدة التخزين لا تحتاج استرجاع عبر المعرّف
    data.templateFileId = templateUrl;
  }

  await prisma.appSettings.upsert({
    where: { id: "singleton" },
    update: data,
    create: { id: "singleton", ...data },
  });

  await prisma.auditLog.create({
    data: {
      userId: user.id,
      tenantId: user.tenantId,
      action: AuditAction.UPDATE,
      details: JSON.stringify({
        entity: "AppSettings",
        useTemplateMode,
        templateUpdated: templateUrl !== undefined,
      }),
    },
  });

  revalidateTag("platform-settings");
  revalidatePath("/super-admin/settings");
  revalidatePath("/admin");
  revalidatePath("/");

  return { success: true };
}

/**
 * تحديث إعدادات المظهر والحوكمة (ADMIN فقط)
 * - الألوان (primary/secondary)
 * - الوضع المظلم
 */
export async function updateAppearanceSettings(input: {
  primaryColor: string;
  secondaryColor: string;
  darkModeEnabled: boolean;
}): Promise<{ success: boolean }> {
  const user = await requireUser();
  requireRole(user, [Role.ADMIN, Role.SUPER_ADMIN]);

  const primaryColor = (input.primaryColor || "#015e63").trim();
  const secondaryColor = (input.secondaryColor || "#d3bb8b").trim();
  const darkModeEnabled = !!input.darkModeEnabled;

  if (!/^#[0-9a-fA-F]{6}$/.test(primaryColor)) {
    throw new Error("اللون الأساسي غير صالح — استخدم صيغة HEX مثل #015e63");
  }
  if (!/^#[0-9a-fA-F]{6}$/.test(secondaryColor)) {
    throw new Error("اللون الثانوي غير صالح — استخدم صيغة HEX مثل #d3bb8b");
  }

  await prisma.appSettings.upsert({
    where: { id: "singleton" },
    update: {
      primaryColor,
      secondaryColor,
      darkModeEnabled,
    },
    create: {
      id: "singleton",
      primaryColor,
      secondaryColor,
      darkModeEnabled,
    },
  });

  await prisma.auditLog.create({
    data: {
      userId: user.id,
      tenantId: user.tenantId,
      action: AuditAction.UPDATE,
      details: JSON.stringify({
        entity: "AppSettings",
        primaryColor,
        secondaryColor,
        darkModeEnabled,
      }),
    },
  });

revalidateTag("platform-settings");
  revalidatePath("/super-admin/settings");
  revalidatePath("/admin");
  revalidatePath("/");
  revalidatePath("/login");

  return { success: true };
}

/**
 * تحديث رقم الدعم الفني (WhatsApp) — SUPER_ADMIN فقط
 */
export async function updateSupportNumber(
  whatsappNumber: string
): Promise<{ success: boolean }> {
  const user = await requireUser();
  requireRole(user, [Role.SUPER_ADMIN]);

  const normalized = whatsappNumber.trim().replace(/\D/g, "");
  if (normalized && (normalized.length < 8 || normalized.length > 15)) {
    throw new Error("رقم الواتساب غير صالح — أدخل الرقم الدولي بدون + أو أصفار بادئة");
  }

  await prisma.appSettings.upsert({
    where: { id: "singleton" },
    update: { whatsappNumber: normalized || null },
    create: { id: "singleton", whatsappNumber: normalized || null },
  });

  await prisma.auditLog.create({
    data: {
      userId: user.id,
      tenantId: user.tenantId,
      action: AuditAction.UPDATE,
      details: JSON.stringify({
        entity: "AppSettings",
        whatsappUpdated: !!normalized,
      }),
    },
  });

revalidateTag("platform-settings");
  revalidatePath("/super-admin/settings");
  revalidatePath("/admin");
  revalidatePath("/");
  revalidatePath("/login");

  return { success: true };
}

/**
 * تفعيل/تعطيل رفع نموذج اختبار الطالب (PDF) في طلب الترشيح
 */
export async function updateStudentApplicationFileSetting(
  enabled: boolean
): Promise<{ success: boolean }> {
  const user = await requireUser();
  requireRole(user, [Role.ADMIN, Role.SUPER_ADMIN]);

  await checkRateLimit(`settings-update:${user.id}`, 10);

  await prisma.appSettings.update({
    where: { id: "singleton" },
    data: { requireStudentApplicationFile: enabled },
  });

  await prisma.auditLog.create({
    data: {
      userId: user.id,
      tenantId: user.tenantId,
      action: AuditAction.UPDATE,
      details: JSON.stringify({
        entity: "AppSettings",
        requireStudentApplicationFile: enabled,
      }),
    },
  });

revalidateTag("platform-settings");
  revalidatePath("/super-admin/settings");
  revalidatePath("/admin/settings");
  revalidatePath("/");

  return { success: true };
}

/**
 * تفعيل/تعطيل قسم التعليم والدور في صفحة الإعدادات
 */
export async function updateTutorialSectionSetting(
  enabled: boolean
): Promise<{ success: boolean }> {
  const user = await requireUser();
  requireRole(user, [Role.ADMIN, Role.SUPER_ADMIN]);

  await checkRateLimit(`settings-update:${user.id}`, 10);

  await prisma.appSettings.update({
    where: { id: "singleton" },
    data: { showTutorialSection: enabled },
  });

  await prisma.auditLog.create({
    data: {
      userId: user.id,
      tenantId: user.tenantId,
      action: AuditAction.UPDATE,
      details: JSON.stringify({
        entity: "AppSettings",
        showTutorialSection: enabled,
      }),
    },
  });

  revalidateTag("platform-settings");
  revalidatePath("/super-admin/settings");
  revalidatePath("/admin/settings");
  revalidatePath("/settings");
  revalidatePath("/");

  return { success: true };
}
