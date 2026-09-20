// ============================================================
// استراتيجية التخزين المؤقت (Caching)
// - unstable_cache من Next.js للبيانات شبه الثابتة
// - تجنب استعلامات قاعدة البيانات المتكررة للقوائم الكبيرة
// ============================================================
import { unstable_cache } from "next/cache";
import { prisma } from "@/lib/prisma";
import type { PlatformSettings } from "@/lib/actions/settings-actions";

/**
 * قائمة النماذج الاختبارية مخزّنة مؤقتاً (بيانات شبه ثابتة)
 * إعادة التحقق كل ساعة — تُستخدم في لوحات العرض
 */
export const getCachedExamModels = unstable_cache(
  async () => {
    return prisma.questionBankModel.findMany({
      select: {
        id: true,
        modelNumber: true,
        branch: true,
        segmentsCount: true,
      },
      orderBy: [{ branch: "asc" }, { modelNumber: "asc" }],
    });
  },
  ["exam-models"],
  { revalidate: 3600 }
);

/**
 * قائمة الجهات التعليمية مخزّنة مؤقتاً
 * إعادة التحقق كل ساعة
 */
export const getCachedInstitutions = unstable_cache(
  async () => {
    return prisma.institution.findMany({
      select: {
        id: true,
        name: true,
        contactInfo: true,
        _count: { select: { students: true } },
      },
      orderBy: { name: "asc" },
    });
  },
  ["institutions"],
  { revalidate: 3600 }
);

/**
 * الموسم النشط الحالي (يتغير نادراً — يُخزّن مؤقتاً لـ 5 دقائق)
 * يُستخدم في عمليات توزيع اللجان وإيجاد النماذج
 */
export const getCachedActiveSeason = unstable_cache(
  async () => {
    return prisma.examSeason.findFirst({
      where: { isActive: true },
      select: { id: true, name: true },
      orderBy: { startDate: "desc" },
    });
  },
  ["active-season"],
  { revalidate: 300 }
);

/**
 * قائمة المختبرين المختصرين (المتوفرون لتشكيل اللجان)
 * البيانات شبه ثابتة — تُحدّث كل 10 دقائق
 */
export const getCachedExaminers = unstable_cache(
  async (tenantId?: string) => {
    return prisma.user.findMany({
      where: {
        ...(tenantId ? { tenantId } : {}),
        role: "EXAMINER",
      },
      select: { id: true, name: true },
      orderBy: { name: "asc" },
    });
  },
  ["examiners"],
  { revalidate: 600 }
);

// ------------------------------------------------------------
// B.4 — تخزين مؤقت لإعدادات المستأجر والمنصة (Server Components)
// ------------------------------------------------------------

/** إعدادات مستأجر واحدة (ألوان العلامة + إعدادات التقييم) — شبه ثابتة */
export type TenantConfig = {
  id: string;
  name: string;
  primaryColor: string;
  secondaryColor: string;
  isActive: boolean;
  assessmentSettings: {
    errorDeduction: number;
    doubtDeduction: number;
    tajweedDeduction: number;
  };
};

/**
 * إعدادات المستأجر (Tenant) — مخزّنة مؤقتاً 5 دقائق.
 * تُستخدم في Server Components الحرجة (اللوحات، صفحات التقييم) لتجنب
 * تكرار الاستعلام لكل طلب.
 */
export const getCachedTenantConfig = unstable_cache(
  async (tenantId: string): Promise<TenantConfig | null> => {
    const tenant = await prisma.tenant.findUnique({
      where: { id: tenantId },
      select: {
        id: true,
        name: true,
        primaryColor: true,
        secondaryColor: true,
        isActive: true,
        assessmentSettings: {
          select: {
            errorDeduction: true,
            doubtDeduction: true,
            tajweedDeduction: true,
          },
        },
      },
    });
    if (!tenant) return null;
    return {
      id: tenant.id,
      name: tenant.name,
      primaryColor: tenant.primaryColor,
      secondaryColor: tenant.secondaryColor,
      isActive: tenant.isActive,
      assessmentSettings: tenant.assessmentSettings[0] ?? {
        errorDeduction: 2.0,
        doubtDeduction: 1.0,
        tajweedDeduction: 0.5,
      },
    };
  },
  ["tenant-config"],
  { revalidate: 300 }
);

/**
 * إعدادات المنصة العامة (الاسم، الشعار، الألوان…) — مخزّنة مؤقتاً 60 ثانية.
 * تُستخدم في اللوحة الجذرية (Root Layout) والإعدادات العامة.
 */
export const getCachedPlatformSettings = unstable_cache(
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
  },
  ["platform-settings"],
  { revalidate: 60, tags: ["platform-settings"] }
);