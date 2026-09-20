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