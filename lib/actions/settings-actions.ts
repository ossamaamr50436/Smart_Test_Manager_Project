"use server";

import { cache } from "react";
import { prisma } from "@/lib/prisma";
import { requireUser, requireRole, requireTenantId } from "@/lib/security";
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
  platformNameLine1: string | null;
  platformNameLine2: string | null;
  logoUrl: string | null;
  logoFileId: string | null;
  useTemplateMode: boolean;
  templateFileId: string | null;
  primaryColor: string;
  secondaryColor: string;
  accentColor: string;
  backgroundColor: string;
  textColor: string;
  borderColor: string;
  headingFont: string;
  bodyFont: string;
  borderRadius: string;
  shadowIntensity: string;
  buttonStyle: string;
  sidebarBg: string;
  sidebarText: string;
  sidebarActiveBg: string;
  sidebarActiveText: string;
  topbarBg: string;
  topbarText: string;
  loginBg: string;
  loginGradientFrom: string;
  loginGradientTo: string;
  loginCardBg: string;
  buttonPrimaryBg: string;
  buttonPrimaryText: string;
  buttonSecondaryBg: string;
  buttonSecondaryText: string;
  // Dark Mode Tokens (D1) — نظام ألوان متكامل للوضع الداكن
  primaryColorDark: string;
  secondaryColorDark: string;
  accentColorDark: string;
  backgroundColorDark: string;
  textColorDark: string;
  borderColorDark: string;
  sidebarBgDark: string;
  sidebarTextDark: string;
  sidebarActiveBgDark: string;
  sidebarActiveTextDark: string;
  topbarBgDark: string;
  topbarTextDark: string;
  loginBgDark: string;
  loginGradientFromDark: string;
  loginGradientToDark: string;
  loginCardBgDark: string;
  buttonPrimaryBgDark: string;
  buttonPrimaryTextDark: string;
  buttonSecondaryBgDark: string;
  buttonSecondaryTextDark: string;
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
      platformNameLine1: settings.platformNameLine1,
      platformNameLine2: settings.platformNameLine2,
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
      accentColor: settings.accentColor,
      backgroundColor: settings.backgroundColor,
      textColor: settings.textColor,
      borderColor: settings.borderColor,
      headingFont: settings.headingFont,
      bodyFont: settings.bodyFont,
      borderRadius: settings.borderRadius,
      shadowIntensity: settings.shadowIntensity,
      buttonStyle: settings.buttonStyle,
      sidebarBg: settings.sidebarBg,
      sidebarText: settings.sidebarText,
      sidebarActiveBg: settings.sidebarActiveBg,
      sidebarActiveText: settings.sidebarActiveText,
      topbarBg: settings.topbarBg,
      topbarText: settings.topbarText,
      loginBg: settings.loginBg,
      loginGradientFrom: settings.loginGradientFrom,
      loginGradientTo: settings.loginGradientTo,
      loginCardBg: settings.loginCardBg,
      buttonPrimaryBg: settings.buttonPrimaryBg,
      buttonPrimaryText: settings.buttonPrimaryText,
      buttonSecondaryBg: settings.buttonSecondaryBg,
      buttonSecondaryText: settings.buttonSecondaryText,
      primaryColorDark: settings.primaryColorDark,
      secondaryColorDark: settings.secondaryColorDark,
      accentColorDark: settings.accentColorDark,
      backgroundColorDark: settings.backgroundColorDark,
      textColorDark: settings.textColorDark,
      borderColorDark: settings.borderColorDark,
      sidebarBgDark: settings.sidebarBgDark,
      sidebarTextDark: settings.sidebarTextDark,
      sidebarActiveBgDark: settings.sidebarActiveBgDark,
      sidebarActiveTextDark: settings.sidebarActiveTextDark,
      topbarBgDark: settings.topbarBgDark,
      topbarTextDark: settings.topbarTextDark,
      loginBgDark: settings.loginBgDark,
      loginGradientFromDark: settings.loginGradientFromDark,
      loginGradientToDark: settings.loginGradientToDark,
      loginCardBgDark: settings.loginCardBgDark,
      buttonPrimaryBgDark: settings.buttonPrimaryBgDark,
      buttonPrimaryTextDark: settings.buttonPrimaryTextDark,
      buttonSecondaryBgDark: settings.buttonSecondaryBgDark,
      buttonSecondaryTextDark: settings.buttonSecondaryTextDark,
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
  logo?: { url: string; fileId: string },
  platformNameLine1?: string,
  platformNameLine2?: string
): Promise<{ success: boolean }> {
  const user = await requireUser();
  requireRole(user, [Role.SUPER_ADMIN]);

  const line1 = platformNameLine1?.trim();
  const line2 = platformNameLine2?.trim();

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
  if (line1 !== undefined && line1.length === 0) {
    throw new Error("السطر الأول من اسم المنصة مطلوب");
  }
  if (line1 !== undefined && (<string>line1).length > 60) {
    throw new Error("السطر الأول طويل جداً (الحد الأقصى 60 حرفاً)");
  }
  if (line2 !== undefined && (<string>line2).length > 60) {
    throw new Error("السطر الثاني طويل جداً (الحد الأقصى 60 حرفاً)");
  }
  if ((line1 !== undefined && /<[^>]*>/.test(line1)) || (line2 !== undefined && /<[^>]*>/.test(line2))) {
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

  // اسم المنصة = السطران (قيمة واحدة للميتاداتا دون <br>) عند ضبطهما
  const finalPlatformName =
    line1 !== undefined
      ? line2
        ? `${line1} ${line2}`
        : line1
      : platformName.trim();

  const data: {
    platformName: string;
    platformNameLine1?: string;
    platformNameLine2?: string | null;
    logoUrl?: string;
    logoFileId?: string;
  } = { platformName: finalPlatformName };

  if (line1 !== undefined) {
    data.platformNameLine1 = line1;
    data.platformNameLine2 = line2 ?? null;
  }

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
        platformNameLine1: data.platformNameLine1 ?? null,
        platformNameLine2: data.platformNameLine2 ?? null,
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
 * تحديث إعدادات المظهر الأساسية (ADMIN فقط) — يكتب حصراً ضمن جهة المستخدم
 * - يخزّن في TenantDesignSettings بدلاً من الـ singleton العام (إصلاح M17/M18)
 * - SUPER_ADMIN يعدّل الافتراضيات عبر updateDesignSettings (المنصة)
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

  if (user.role === Role.ADMIN) {
    // ADMIN → كتابة نطاقية للجهة فقط (إصلاح العيب عبر الـ singleton)
    const tenantId = requireTenantId(user);
    const prevTokens = (
      await prisma.tenantDesignSettings.findUnique({ where: { tenantId } })
    )?.tokens as Record<string, never> | null ?? {};
    const nextTokens: Record<string, string | boolean> = {
      ...prevTokens,
      primaryColor,
      secondaryColor,
      darkModeEnabled,
    };
    await prisma.tenantDesignSettings.upsert({
      where: { tenantId },
      update: { tokens: nextTokens, updatedBy: user.id },
      create: { tenantId, tokens: nextTokens, updatedBy: user.id },
    });
  } else {
    // SUPER_ADMIN → افتراضيات المنصة (الموضع المنفصل لوضع المنصة — M17-E)
    await prisma.appSettings.upsert({
      where: { id: "singleton" },
      update: { primaryColor, secondaryColor, darkModeEnabled },
      create: { id: "singleton", primaryColor, secondaryColor, darkModeEnabled },
    });
  }

  await prisma.auditLog.create({
    data: {
      userId: user.id,
      tenantId: user.tenantId,
      action: AuditAction.UPDATE,
      details: JSON.stringify({
        entity: user.role === Role.ADMIN ? "TenantDesignSettings" : "AppSettings",
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

/**
 * تفعيل/تعطيل الوضع المظلم في كامل المنصة — SUPER_ADMIN فقط
 */
export async function updateDarkModeSetting(
  enabled: boolean
): Promise<{ success: boolean }> {
  const user = await requireUser();
  requireRole(user, [Role.SUPER_ADMIN]);

  await checkRateLimit(`settings-update:${user.id}`, 10);

  await prisma.appSettings.upsert({
    where: { id: "singleton" },
    update: { darkModeEnabled: enabled },
    create: { id: "singleton", darkModeEnabled: enabled },
  });

  await prisma.auditLog.create({
    data: {
      userId: user.id,
      tenantId: user.tenantId,
      action: AuditAction.UPDATE,
      details: JSON.stringify({
        entity: "AppSettings",
        darkModeEnabled: enabled,
      }),
    },
  });

revalidateTag("platform-settings");
  revalidatePath("/super-admin/settings");
  revalidatePath("/admin/settings");
  revalidatePath("/");
  revalidatePath("/login");

  return { success: true };
}

/**
 * جلب إعدادات التصميم الخاصة بجهة معيّنة (M17)
 * - تُدمج فوق افتراضيات المنصة (AppSettings) — تعود لقيم المنصة عند غياب تجاوز.
 * - أول استدعاء لا يتطلب مصادقة (يُستخدم في طبقة العرض داخل الجهة فقط).
 */
export type DesignTokens = {
  primaryColor: string;
  secondaryColor: string;
  accentColor: string;
  backgroundColor: string;
  textColor: string;
  borderColor: string;
  headingFont: string;
  bodyFont: string;
  borderRadius: string;
  shadowIntensity: string;
  buttonStyle: string;
  sidebarBg: string;
  sidebarText: string;
  sidebarActiveBg: string;
  sidebarActiveText: string;
  topbarBg: string;
  topbarText: string;
  loginBg: string;
  loginGradientFrom: string;
  loginGradientTo: string;
  loginCardBg: string;
  buttonPrimaryBg: string;
  buttonPrimaryText: string;
  buttonSecondaryBg: string;
  buttonSecondaryText: string;
  primaryColorDark: string;
  secondaryColorDark: string;
  accentColorDark: string;
  backgroundColorDark: string;
  textColorDark: string;
  borderColorDark: string;
  sidebarBgDark: string;
  sidebarTextDark: string;
  sidebarActiveBgDark: string;
  sidebarActiveTextDark: string;
  topbarBgDark: string;
  topbarTextDark: string;
  loginBgDark: string;
  loginGradientFromDark: string;
  loginGradientToDark: string;
  loginCardBgDark: string;
  buttonPrimaryBgDark: string;
  buttonPrimaryTextDark: string;
  buttonSecondaryBgDark: string;
  buttonSecondaryTextDark: string;
};

const PLATFORM_DESIGN_DEFAULTS: Omit<DesignTokens, "primaryColor" | "secondaryColor"> & { primaryColor: string; secondaryColor: string } = {
  primaryColor: "#015e63",
  secondaryColor: "#d3bb8b",
  accentColor: "#1a262e",
  backgroundColor: "#ffffff",
  textColor: "#0f172a",
  borderColor: "#e2e8f0",
  headingFont: "Cairo",
  bodyFont: "Cairo",
  borderRadius: "0.5rem",
  shadowIntensity: "md",
  buttonStyle: "rounded",
  sidebarBg: "#015e63",
  sidebarText: "#ffffff",
  sidebarActiveBg: "#014a4e",
  sidebarActiveText: "#ffffff",
  topbarBg: "#ffffff",
  topbarText: "#0f172a",
  loginBg: "#015e63",
  loginGradientFrom: "#014a4e",
  loginGradientTo: "#d3bb8b",
  loginCardBg: "#ffffff",
  buttonPrimaryBg: "#015e63",
  buttonPrimaryText: "#ffffff",
  buttonSecondaryBg: "#d3bb8b",
  buttonSecondaryText: "#0f172a",
  primaryColorDark: "#0e6e73",
  secondaryColorDark: "#e2d3ab",
  accentColorDark: "#0f1a22",
  backgroundColorDark: "#0e171b",
  textColorDark: "#eef1f4",
  borderColorDark: "#24343e",
  sidebarBgDark: "#071014",
  sidebarTextDark: "#dbe7ec",
  sidebarActiveBgDark: "#015e63",
  sidebarActiveTextDark: "#ffffff",
  topbarBgDark: "#121c22",
  topbarTextDark: "#eef1f4",
  loginBgDark: "#0a1416",
  loginGradientFromDark: "#06282b",
  loginGradientToDark: "#182830",
  loginCardBgDark: "#121c22",
  buttonPrimaryBgDark: "#0e6e73",
  buttonPrimaryTextDark: "#ffffff",
  buttonSecondaryBgDark: "#d3bb8b",
  buttonSecondaryTextDark: "#0f172a",
};

const DESIGN_TOKEN_KEYS = Object.keys(PLATFORM_DESIGN_DEFAULTS);

function pickDesignTokens(source: DesignTokens): DesignTokens {
  const result = {} as DesignTokens;
  for (const key of DESIGN_TOKEN_KEYS as (keyof DesignTokens)[]) {
    result[key] = source[key];
  }
  return result;
}

/** جلب إعدادات التصميم المدموجة لجهة (تجاوزات الجهة فوق افتراضيات المنصة) */
export async function getTenantDesignSettings(
  tenantId: string
): Promise<{ tokens: DesignTokens; hasOverrides: boolean }> {
  if (!tenantId) {
    return { tokens: PLATFORM_DESIGN_DEFAULTS, hasOverrides: false };
  }

  const tenantDesign = await prisma.tenantDesignSettings.findUnique({
    where: { tenantId },
    select: { tokens: true },
  });

  if (!tenantDesign?.tokens) {
    return { tokens: PLATFORM_DESIGN_DEFAULTS, hasOverrides: false };
  }

  const stored = tenantDesign.tokens as Record<string, unknown>;
  const merged = { ...PLATFORM_DESIGN_DEFAULTS };
  for (const key of DESIGN_TOKEN_KEYS) {
    const value = stored[key];
    if (typeof value === "string" && value.trim() !== "") {
      merged[key as keyof DesignTokens] = value as never;
    }
  }
  return { tokens: merged, hasOverrides: true };
}

/** جلب التجاوزات المرتبطة بالجهة الحالية للمستخدم (لا يلمس جهات أخرى) */
export async function getMyTenantDesignTokens(): Promise<DesignTokens | null> {
  const user = await requireUser();
  if (!user.tenantId) return null;
  const { tokens } = await getTenantDesignSettings(user.tenantId);
  return tokens;
}

/**
 * تحديث إعدادات التصميم الخاصة بجهة (M17) — ADMIN فقط وبوجود tenant
 * - يكتب حصراً ضمن جهة المستخدم (tenantId من الجلسة وليس من الطلب) (M17-B/M18-D)
 * - لا يعدّل إعدادات المنصة العامة (AppSettings) (M17-E)
 */
export async function updateTenantDesignSettings(input: {
  primaryColor?: string;
  secondaryColor?: string;
  accentColor?: string;
  backgroundColor?: string;
  textColor?: string;
  borderColor?: string;
  headingFont?: string;
  bodyFont?: string;
  borderRadius?: string;
  shadowIntensity?: string;
  buttonStyle?: string;
  sidebarBg?: string;
  sidebarText?: string;
  sidebarActiveBg?: string;
  sidebarActiveText?: string;
  topbarBg?: string;
  topbarText?: string;
  loginBg?: string;
  loginGradientFrom?: string;
  loginGradientTo?: string;
  loginCardBg?: string;
  buttonPrimaryBg?: string;
  buttonPrimaryText?: string;
  buttonSecondaryBg?: string;
  buttonSecondaryText?: string;
  // Dark Mode Tokens (D1)
  primaryColorDark?: string;
  secondaryColorDark?: string;
  accentColorDark?: string;
  backgroundColorDark?: string;
  textColorDark?: string;
  borderColorDark?: string;
  sidebarBgDark?: string;
  sidebarTextDark?: string;
  sidebarActiveBgDark?: string;
  sidebarActiveTextDark?: string;
  topbarBgDark?: string;
  topbarTextDark?: string;
  loginBgDark?: string;
  loginGradientFromDark?: string;
  loginGradientToDark?: string;
  loginCardBgDark?: string;
  buttonPrimaryBgDark?: string;
  buttonPrimaryTextDark?: string;
  buttonSecondaryBgDark?: string;
  buttonSecondaryTextDark?: string;
}): Promise<{ success: boolean }> {
  const user = await requireUser();

  // عزل الصلاحيات: ADMIN فقط — وليس SUPER_ADMIN (الجهات لا تصمم المنصة)
  requireRole(user, [Role.ADMIN]);
  const tenantId = requireTenantId(user); // من الجلسة حصراً — لا يوجد معرّف جهة في الطلب

  const hexOrEmpty = (value?: string) => {
    if (value === undefined || value.trim() === "") return undefined;
    if (!/^#[0-9a-fA-F]{6}$/.test(value.trim())) {
      throw new Error("القيم الملوّنة يجب أن تكون بصيغة HEX مثل #015e63");
    }
    return value.trim();
  };

  const allowedRadius = ["0rem", "0.25rem", "0.5rem", "0.75rem", "1rem"];
  const allowedShadows = ["none", "sm", "md", "lg", "xl"];
  const allowedButtonStyles = ["rounded", "square", "pill"];
  const allowedFonts = ["Cairo", "Noto Sans Arabic", "Tahoma", "Arial"];

  if (input.borderRadius && !allowedRadius.includes(input.borderRadius)) {
    throw new Error("قيمة استدارة الزوايا غير صالحة");
  }
  if (input.shadowIntensity && !allowedShadows.includes(input.shadowIntensity)) {
    throw new Error("قيمة شدة الظلال غير صالحة");
  }
  if (input.buttonStyle && !allowedButtonStyles.includes(input.buttonStyle)) {
    throw new Error("قيمة نمط الأزرار غير صالحة");
  }
  if (input.headingFont && !allowedFonts.includes(input.headingFont)) {
    throw new Error("الخط غير مسموح");
  }
  if (input.bodyFont && !allowedFonts.includes(input.bodyFont)) {
    throw new Error("الخط غير مسموح");
  }

  const colorKeys = [
    "primaryColor",
    "secondaryColor",
    "accentColor",
    "backgroundColor",
    "textColor",
    "borderColor",
    "sidebarBg",
    "sidebarText",
    "sidebarActiveBg",
    "sidebarActiveText",
    "topbarBg",
    "topbarText",
    "loginBg",
    "loginGradientFrom",
    "loginGradientTo",
    "loginCardBg",
    "buttonPrimaryBg",
    "buttonPrimaryText",
    "buttonSecondaryBg",
    "buttonSecondaryText",
    "primaryColorDark",
    "secondaryColorDark",
    "accentColorDark",
    "backgroundColorDark",
    "textColorDark",
    "borderColorDark",
    "sidebarBgDark",
    "sidebarTextDark",
    "sidebarActiveBgDark",
    "sidebarActiveTextDark",
    "topbarBgDark",
    "topbarTextDark",
    "loginBgDark",
    "loginGradientFromDark",
    "loginGradientToDark",
    "loginCardBgDark",
    "buttonPrimaryBgDark",
    "buttonPrimaryTextDark",
    "buttonSecondaryBgDark",
    "buttonSecondaryTextDark",
  ] as const;

  const tokens: Record<string, string> = {};
  for (const key of colorKeys) {
    const cleaned = hexOrEmpty(input[key]);
    if (cleaned !== undefined) tokens[key] = cleaned;
  }

  const prev = await prisma.tenantDesignSettings.findUnique({
    where: { tenantId },
    select: { tokens: true },
  });

  const mergedTokens = (prev?.tokens as Record<string, never> | null) ?? {};
  const nextTokens: Record<string, string | boolean> = { ...mergedTokens, ...tokens };

  if (input.borderRadius) nextTokens.borderRadius = input.borderRadius;
  if (input.shadowIntensity) nextTokens.shadowIntensity = input.shadowIntensity;
  if (input.buttonStyle) nextTokens.buttonStyle = input.buttonStyle;
  if (input.headingFont) nextTokens.headingFont = input.headingFont;
  if (input.bodyFont) nextTokens.bodyFont = input.bodyFont;

  await checkRateLimit(`tenant-design:${user.id}`, 10);

  await prisma.tenantDesignSettings.upsert({
    where: { tenantId },
    update: { tokens: nextTokens, updatedBy: user.id },
    create: { tenantId, tokens: nextTokens, updatedBy: user.id },
  });

  await prisma.auditLog.create({
    data: {
      userId: user.id,
      tenantId,
      action: AuditAction.UPDATE,
      details: JSON.stringify({
        entity: "TenantDesignSettings",
        tenantId,
        updatedTokens: Object.keys(tokens).length + (input.borderRadius ? 1 : 0),
      }),
    },
  });

  revalidatePath("/admin/design-settings");
  revalidatePath("/admin");
  revalidatePath("/");

  return { success: true };
}

/**
 * تحديث إعدادات التصميم المتقدمة — SUPER_ADMIN فقط
 * - ألوان: primary/secondary/accent/background/text/border
 * - خطوط: heading/body
 * - شكل: radius + shadow + buttonStyle
 * يُطبَّق فوراً عبر CSS variables في app/layout.tsx (مهما غيّر المظهر من settings)
 */
export async function updateDesignSettings(input: {
  primaryColor?: string;
  secondaryColor?: string;
  accentColor?: string;
  backgroundColor?: string;
  textColor?: string;
  borderColor?: string;
  headingFont?: string;
  bodyFont?: string;
borderRadius?: string;
  shadowIntensity?: string;
  buttonStyle?: string;
  sidebarBg?: string;
  sidebarText?: string;
  sidebarActiveBg?: string;
  sidebarActiveText?: string;
  topbarBg?: string;
  topbarText?: string;
  loginBg?: string;
  loginGradientFrom?: string;
  loginGradientTo?: string;
  loginCardBg?: string;
  buttonPrimaryBg?: string;
  buttonPrimaryText?: string;
  buttonSecondaryBg?: string;
  buttonSecondaryText?: string;
  // Dark Mode Tokens (D1)
  primaryColorDark?: string;
  secondaryColorDark?: string;
  accentColorDark?: string;
  backgroundColorDark?: string;
  textColorDark?: string;
  borderColorDark?: string;
  sidebarBgDark?: string;
  sidebarTextDark?: string;
  sidebarActiveBgDark?: string;
  sidebarActiveTextDark?: string;
  topbarBgDark?: string;
  topbarTextDark?: string;
  loginBgDark?: string;
  loginGradientFromDark?: string;
  loginGradientToDark?: string;
  loginCardBgDark?: string;
  buttonPrimaryBgDark?: string;
  buttonPrimaryTextDark?: string;
  buttonSecondaryBgDark?: string;
  buttonSecondaryTextDark?: string;
}): Promise<{ success: boolean }> {
  const user = await requireUser();
  requireRole(user, [Role.SUPER_ADMIN]);

  if ((input.primaryColor ?? "") !== "" && !/^#[0-9a-fA-F]{6}$/.test(input.primaryColor!)) {
    throw new Error("اللون الأساسي غير صالح — استخدم صيغة HEX مثل #015e63");
  }
  if ((input.secondaryColor ?? "") !== "" && !/^#[0-9a-fA-F]{6}$/.test(input.secondaryColor!)) {
    throw new Error("اللون الثانوي غير صالح — استخدم صيغة HEX مثل #d3bb8b");
  }
  if ((input.accentColor ?? "") !== "" && !/^#[0-9a-fA-F]{6}$/.test(input.accentColor!)) {
    throw new Error("لون التمييز غير صالح — استخدم صيغة HEX مثل #1a262e");
  }
  if ((input.backgroundColor ?? "") !== "" && !/^#[0-9a-fA-F]{6}$/.test(input.backgroundColor!)) {
    throw new Error("لون الخلفية غير صالح — استخدم صيغة HEX مثل #ffffff");
  }
  if ((input.textColor ?? "") !== "" && !/^#[0-9a-fA-F]{6}$/.test(input.textColor!)) {
    throw new Error("لون النص غير صالح — استخدم صيغة HEX مثل #0f172a");
  }
if ((input.borderColor ?? "") !== "" && !/^#[0-9a-fA-F]{6}$/.test(input.borderColor!)) {
    throw new Error("لون الحدود غير صالح — استخدم صيغة HEX مثل #e2e8f0");
  }
  if ((input.sidebarBg ?? "") !== "" && !/^#[0-9a-fA-F]{6}$/.test(input.sidebarBg!)) {
    throw new Error("لون خلفية الشريط الجانبي غير صالح — استخدم صيغة HEX");
  }
  if ((input.sidebarText ?? "") !== "" && !/^#[0-9a-fA-F]{6}$/.test(input.sidebarText!)) {
    throw new Error("لون نص الشريط الجانبي غير صالح — استخدم صيغة HEX");
  }
  if ((input.sidebarActiveBg ?? "") !== "" && !/^#[0-9a-fA-F]{6}$/.test(input.sidebarActiveBg!)) {
    throw new Error("لون خلفية العنصر النشط غير صالح — استخدم صيغة HEX");
  }
  if ((input.sidebarActiveText ?? "") !== "" && !/^#[0-9a-fA-F]{6}$/.test(input.sidebarActiveText!)) {
    throw new Error("لون نص العنصر النشط غير صالح — استخدم صيغة HEX");
  }
  if ((input.topbarBg ?? "") !== "" && !/^#[0-9a-fA-F]{6}$/.test(input.topbarBg!)) {
    throw new Error("لون خلفية الشريط العلوي غير صالح — استخدم صيغة HEX");
  }
  if ((input.topbarText ?? "") !== "" && !/^#[0-9a-fA-F]{6}$/.test(input.topbarText!)) {
    throw new Error("لون نص الشريط العلوي غير صالح — استخدم صيغة HEX");
  }
  if ((input.loginBg ?? "") !== "" && !/^#[0-9a-fA-F]{6}$/.test(input.loginBg!)) {
    throw new Error("لون خلفية تسجيل الدخول غير صالح — استخدم صيغة HEX");
  }
  if ((input.loginGradientFrom ?? "") !== "" && !/^#[0-9a-fA-F]{6}$/.test(input.loginGradientFrom!)) {
    throw new Error("لون بداية التدرج غير صالح — استخدم صيغة HEX");
  }
  if ((input.loginGradientTo ?? "") !== "" && !/^#[0-9a-fA-F]{6}$/.test(input.loginGradientTo!)) {
    throw new Error("لون نهاية التدرج غير صالح — استخدم صيغة HEX");
  }
  if ((input.loginCardBg ?? "") !== "" && !/^#[0-9a-fA-F]{6}$/.test(input.loginCardBg!)) {
    throw new Error("لون بطاقة تسجيل الدخول غير صالح — استخدم صيغة HEX");
  }
  if ((input.buttonPrimaryBg ?? "") !== "" && !/^#[0-9a-fA-F]{6}$/.test(input.buttonPrimaryBg!)) {
    throw new Error("لون الزر الأساسي غير صالح — استخدم صيغة HEX");
  }
  if ((input.buttonPrimaryText ?? "") !== "" && !/^#[0-9a-fA-F]{6}$/.test(input.buttonPrimaryText!)) {
    throw new Error("لون نص الزر الأساسي غير صالح — استخدم صيغة HEX");
  }
  if ((input.buttonSecondaryBg ?? "") !== "" && !/^#[0-9a-fA-F]{6}$/.test(input.buttonSecondaryBg!)) {
    throw new Error("لون الزر الثانوي غير صالح — استخدم صيغة HEX");
  }
  if ((input.buttonSecondaryText ?? "") !== "" && !/^#[0-9a-fA-F]{6}$/.test(input.buttonSecondaryText!)) {
    throw new Error("لون نص الزر الثانوي غير صالح — استخدم صيغة HEX");
  }
  if ((input.primaryColorDark ?? "") !== "" && !/^#[0-9a-fA-F]{6}$/.test(input.primaryColorDark!)) {
    throw new Error("اللون الأساسي الداكن غير صالح — استخدم صيغة HEX مثل #0e6e73");
  }
  if ((input.secondaryColorDark ?? "") !== "" && !/^#[0-9a-fA-F]{6}$/.test(input.secondaryColorDark!)) {
    throw new Error("اللون الثانوي الداكن غير صالح — استخدم صيغة HEX مثل #e2d3ab");
  }
  if ((input.accentColorDark ?? "") !== "" && !/^#[0-9a-fA-F]{6}$/.test(input.accentColorDark!)) {
    throw new Error("لون التمييز الداكن غير صالح — استخدم صيغة HEX");
  }
  if ((input.backgroundColorDark ?? "") !== "" && !/^#[0-9a-fA-F]{6}$/.test(input.backgroundColorDark!)) {
    throw new Error("خلفية الوضع الداكن غير صالحة — استخدم صيغة HEX");
  }
  if ((input.textColorDark ?? "") !== "" && !/^#[0-9a-fA-F]{6}$/.test(input.textColorDark!)) {
    throw new Error("لون نص الوضع الداكن غير صالح — استخدم صيغة HEX");
  }
  if ((input.borderColorDark ?? "") !== "" && !/^#[0-9a-fA-F]{6}$/.test(input.borderColorDark!)) {
    throw new Error("لون حدود الوضع الداكن غير صالح — استخدم صيغة HEX");
  }
  if ((input.sidebarBgDark ?? "") !== "" && !/^#[0-9a-fA-F]{6}$/.test(input.sidebarBgDark!)) {
    throw new Error("خلفية الشريط الجانبي الداكنة غير صالحة — استخدم صيغة HEX");
  }
  if ((input.sidebarTextDark ?? "") !== "" && !/^#[0-9a-fA-F]{6}$/.test(input.sidebarTextDark!)) {
    throw new Error("نص الشريط الجانبي الداكن غير صالح — استخدم صيغة HEX");
  }
  if ((input.sidebarActiveBgDark ?? "") !== "" && !/^#[0-9a-fA-F]{6}$/.test(input.sidebarActiveBgDark!)) {
    throw new Error("خلفية العنصر النشط الداكنة غير صالحة — استخدم صيغة HEX");
  }
  if ((input.sidebarActiveTextDark ?? "") !== "" && !/^#[0-9a-fA-F]{6}$/.test(input.sidebarActiveTextDark!)) {
    throw new Error("نص العنصر النشط الداكن غير صالح — استخدم صيغة HEX");
  }
  if ((input.topbarBgDark ?? "") !== "" && !/^#[0-9a-fA-F]{6}$/.test(input.topbarBgDark!)) {
    throw new Error("خلفية الشريط العلوي الداكنة غير صالحة — استخدم صيغة HEX");
  }
  if ((input.topbarTextDark ?? "") !== "" && !/^#[0-9a-fA-F]{6}$/.test(input.topbarTextDark!)) {
    throw new Error("نص الشريط العلوي الداكن غير صالح — استخدم صيغة HEX");
  }
  if ((input.loginBgDark ?? "") !== "" && !/^#[0-9a-fA-F]{6}$/.test(input.loginBgDark!)) {
    throw new Error("خلفية تسجيل الدخول الداكنة غير صالحة — استخدم صيغة HEX");
  }
  if ((input.loginGradientFromDark ?? "") !== "" && !/^#[0-9a-fA-F]{6}$/.test(input.loginGradientFromDark!)) {
    throw new Error("بداية تدرج الدخول الداكن غير صالحة — استخدم صيغة HEX");
  }
  if ((input.loginGradientToDark ?? "") !== "" && !/^#[0-9a-fA-F]{6}$/.test(input.loginGradientToDark!)) {
    throw new Error("نهاية تدرج الدخول الداكن غير صالحة — استخدم صيغة HEX");
  }
  if ((input.loginCardBgDark ?? "") !== "" && !/^#[0-9a-fA-F]{6}$/.test(input.loginCardBgDark!)) {
    throw new Error("خلفية بطاقة الدخول الداكنة غير صالحة — استخدم صيغة HEX");
  }
  if ((input.buttonPrimaryBgDark ?? "") !== "" && !/^#[0-9a-fA-F]{6}$/.test(input.buttonPrimaryBgDark!)) {
    throw new Error("خلفية الزر الأساسي الداكنة غير صالحة — استخدم صيغة HEX");
  }
  if ((input.buttonPrimaryTextDark ?? "") !== "" && !/^#[0-9a-fA-F]{6}$/.test(input.buttonPrimaryTextDark!)) {
    throw new Error("نص الزر الأساسي الداكن غير صالح — استخدم صيغة HEX");
  }
  if ((input.buttonSecondaryBgDark ?? "") !== "" && !/^#[0-9a-fA-F]{6}$/.test(input.buttonSecondaryBgDark!)) {
    throw new Error("خلفية الزر الثانوي الداكنة غير صالحة — استخدم صيغة HEX");
  }
  if ((input.buttonSecondaryTextDark ?? "") !== "" && !/^#[0-9a-fA-F]{6}$/.test(input.buttonSecondaryTextDark!)) {
    throw new Error("نص الزر الثانوي الداكن غير صالح — استخدم صيغة HEX");
  }

  const allowedRadius = ["0rem", "0.25rem", "0.5rem", "0.75rem", "1rem"];
  const allowedShadows = ["none", "sm", "md", "lg", "xl"];
  const allowedButtonStyles = ["rounded", "square", "pill"];

  const borderRadius = input.borderRadius || "0.5rem";
  const shadowIntensity = input.shadowIntensity || "md";
  const buttonStyle = input.buttonStyle || "rounded";

  if (!allowedRadius.includes(borderRadius)) {
    throw new Error("قيمة استدارة الزوايا غير صالحة");
  }
  if (!allowedShadows.includes(shadowIntensity)) {
    throw new Error("قيمة شدة الظلال غير صالحة");
  }
  if (!allowedButtonStyles.includes(buttonStyle)) {
    throw new Error("قيمة نمط الأزرار غير صالحة");
  }

  await checkRateLimit(`settings-update:${user.id}`, 10);

  const data = {
    primaryColor: (input.primaryColor || "#015e63").trim(),
    secondaryColor: (input.secondaryColor || "#d3bb8b").trim(),
    accentColor: (input.accentColor || "#1a262e").trim(),
    backgroundColor: (input.backgroundColor || "#ffffff").trim(),
    textColor: (input.textColor || "#0f172a").trim(),
    borderColor: (input.borderColor || "#e2e8f0").trim(),
    headingFont: (input.headingFont || "Cairo").trim(),
    bodyFont: (input.bodyFont || "Cairo").trim(),
borderRadius,
    shadowIntensity,
    buttonStyle,
    sidebarBg: (input.sidebarBg || "#015e63").trim(),
    sidebarText: (input.sidebarText || "#ffffff").trim(),
    sidebarActiveBg: (input.sidebarActiveBg || "#014a4e").trim(),
    sidebarActiveText: (input.sidebarActiveText || "#ffffff").trim(),
    topbarBg: (input.topbarBg || "#ffffff").trim(),
    topbarText: (input.topbarText || "#0f172a").trim(),
    loginBg: (input.loginBg || "#015e63").trim(),
    loginGradientFrom: (input.loginGradientFrom || "#014a4e").trim(),
    loginGradientTo: (input.loginGradientTo || "#d3bb8b").trim(),
    loginCardBg: (input.loginCardBg || "#ffffff").trim(),
    buttonPrimaryBg: (input.buttonPrimaryBg || "#015e63").trim(),
    buttonPrimaryText: (input.buttonPrimaryText || "#ffffff").trim(),
    buttonSecondaryBg: (input.buttonSecondaryBg || "#d3bb8b").trim(),
    buttonSecondaryText: (input.buttonSecondaryText || "#0f172a").trim(),
    primaryColorDark: (input.primaryColorDark || "#0e6e73").trim(),
    secondaryColorDark: (input.secondaryColorDark || "#e2d3ab").trim(),
    accentColorDark: (input.accentColorDark || "#0f1a22").trim(),
    backgroundColorDark: (input.backgroundColorDark || "#0e171b").trim(),
    textColorDark: (input.textColorDark || "#eef1f4").trim(),
    borderColorDark: (input.borderColorDark || "#24343e").trim(),
    sidebarBgDark: (input.sidebarBgDark || "#071014").trim(),
    sidebarTextDark: (input.sidebarTextDark || "#dbe7ec").trim(),
    sidebarActiveBgDark: (input.sidebarActiveBgDark || "#015e63").trim(),
    sidebarActiveTextDark: (input.sidebarActiveTextDark || "#ffffff").trim(),
    topbarBgDark: (input.topbarBgDark || "#121c22").trim(),
    topbarTextDark: (input.topbarTextDark || "#eef1f4").trim(),
    loginBgDark: (input.loginBgDark || "#0a1416").trim(),
    loginGradientFromDark: (input.loginGradientFromDark || "#06282b").trim(),
    loginGradientToDark: (input.loginGradientToDark || "#182830").trim(),
    loginCardBgDark: (input.loginCardBgDark || "#121c22").trim(),
    buttonPrimaryBgDark: (input.buttonPrimaryBgDark || "#0e6e73").trim(),
    buttonPrimaryTextDark: (input.buttonPrimaryTextDark || "#ffffff").trim(),
    buttonSecondaryBgDark: (input.buttonSecondaryBgDark || "#d3bb8b").trim(),
    buttonSecondaryTextDark: (input.buttonSecondaryTextDark || "#0f172a").trim(),
  };

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
      details: JSON.stringify({ entity: "AppSettings", ...data }),
    },
  });

  revalidateTag("platform-settings");
  revalidatePath("/super-admin/design-settings");
  revalidatePath("/super-admin/settings");
  revalidatePath("/admin");
  revalidatePath("/");
  revalidatePath("/login");

  return { success: true };
}