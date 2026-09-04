"use server";

import { prisma } from "@/lib/prisma";
import { requireUser, requireRole } from "@/lib/security";
import { Role, AuditAction } from "@prisma/client";
import { revalidatePath } from "next/cache";
import { uploadFileToDrive } from "@/lib/google-drive";

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
};

/**
 * جلب إعدادات المنصة (دالة عامة)
 * إذا لم تكن هناك إعدادات، تنشئ الافتراضية
 */
export async function getPlatformSettings(): Promise<PlatformSettings> {
  let settings = await prisma.appSettings.findUnique({
    where: { id: "singleton" },
  });

  if (!settings) {
    settings = await prisma.appSettings.create({
      data: { id: "singleton" },
    });
  }

  return {
    platformName: settings.platformName,
    logoUrl: settings.logoUrl,
    logoFileId: settings.logoFileId,
    useTemplateMode: settings.useTemplateMode,
    templateFileId: settings.templateFileId,
  };
}

/**
 * تحديث إعدادات المنصة (ADMIN فقط — المادة 8)
 * - يسمح بتغيير الاسم والشعار
 * - يرفع الشعار الجديد إلى Google Drive (المادة 3)
 * - يسجّل العملية في AuditLog
 */
export async function updatePlatformSettings(
  platformName: string,
  logoFile?: { buffer: ArrayBuffer; fileName: string; mimeType: string }
): Promise<{ success: boolean }> {
  const user = await requireUser();
  requireRole(user, [Role.ADMIN]);

  if (!platformName || platformName.trim().length === 0) {
    throw new Error("اسم المنصة مطلوب");
  }

  const data: {
    platformName: string;
    logoUrl?: string;
    logoFileId?: string;
  } = { platformName: platformName.trim() };

  if (logoFile) {
    // التحقق من نوع الملف وحجمه (OWASP — منع DoS)
    const allowedMimeTypes = [
      "image/png",
      "image/jpeg",
      "image/svg+xml",
    ];
    if (!allowedMimeTypes.includes(logoFile.mimeType)) {
      throw new Error("نوع الشعار غير مسموح: PNG, JPG, أو SVG فقط");
    }
    if (logoFile.buffer.byteLength > 5 * 1024 * 1024) {
      throw new Error("حجم الشعار كبير جداً (الحد الأقصى 5MB)");
    }
    try {
      const uploaded = await uploadFileToDrive(
        Buffer.from(logoFile.buffer),
        logoFile.fileName,
        logoFile.mimeType
      );
      data.logoUrl = uploaded.webViewLink;
      data.logoFileId = uploaded.fileId;
    } catch (err) {
      throw new Error(
        `تعذر رفع الشعار على Google Drive: ${
          err instanceof Error ? err.message : "خطأ غير معروف"
        }`
      );
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
      action: AuditAction.UPDATE,
      details: JSON.stringify({
        entity: "AppSettings",
        platformName: data.platformName,
        logoUpdated: !!logoFile,
      }),
    },
  });

  revalidatePath("/dashboard/admin");
  revalidatePath("/dashboard");
  revalidatePath("/login");
  revalidatePath("/");

  return { success: true };
}

/**
 * تحديث وضع القالب الذكي للشهادات (ADMIN فقط)
 */
export async function updateTemplateSettings(
  useTemplateMode: boolean,
  templateFile?: { buffer: ArrayBuffer; fileName: string; mimeType: string }
): Promise<{ success: boolean }> {
  const user = await requireUser();
  requireRole(user, [Role.ADMIN]);

  const data: {
    useTemplateMode: boolean;
    templateFileId?: string;
  } = { useTemplateMode };

  if (templateFile) {
    // التحقق من نوع وحجم قالب الشهادة
    if (templateFile.mimeType !== "application/pdf") {
      throw new Error("قالب الشهادة يجب أن يكون ملف PDF");
    }
    if (templateFile.buffer.byteLength > 10 * 1024 * 1024) {
      throw new Error("حجم قالب الشهادة كبير جداً (الحد الأقصى 10MB)");
    }
    try {
      const uploaded = await uploadFileToDrive(
        Buffer.from(templateFile.buffer),
        templateFile.fileName,
        templateFile.mimeType
      );
      data.templateFileId = uploaded.fileId;
    } catch (err) {
      throw new Error(
        `تعذر رفع قالب الشهادة على Google Drive: ${
          err instanceof Error ? err.message : "خطأ غير معروف"
        }`
      );
    }
  }

  await prisma.appSettings.upsert({
    where: { id: "singleton" },
    update: data,
    create: { id: "singleton", ...data },
  });

  await prisma.auditLog.create({
    data: {
      userId: user.id,
      action: AuditAction.UPDATE,
      details: JSON.stringify({
        entity: "AppSettings",
        useTemplateMode,
        templateUpdated: !!templateFile,
      }),
    },
  });

  revalidatePath("/dashboard/admin");

  return { success: true };
}
