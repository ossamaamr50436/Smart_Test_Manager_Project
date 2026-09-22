// ============================================================
// هوية المنصة (M0) — المصدر الرسمي الوحيد لشعار المنصة الافتراضي
// - platform-logo.jpg = الشعار الرسمي المعتمد من ملف Piano logo
// - ترتيب الأولوية (Tenant > Platform > Default):
//   1. شعار الجهة المخصص (إن وُجد)
//   2. شعار المنصة الذي يرفعه SUPER_ADMIN من إعدادات المنصة (إن وُجد)
//   3. platform-logo (الشعار الافتراضي الرسمي)
// ============================================================

export const DEFAULT_PLATFORM_LOGO = "/platform-logo.jpg";

export const PLATFORM_LOGO_ALT = "شعار منصة مجتاز";

/**
 * حلّ الشعار الفعّال وفق التسلسل: شعار الجهة ← شعار المنصة ← الافتراضي.
 * القيم تُقرأ من قاعدة البيانات (مصادقة الخادم) — لا يُؤتمَن العميل هنا.
 */
export function resolveLogoUrl(
  tenantLogo: string | null | undefined,
  platformLogo: string | null | undefined
): string {
  if (tenantLogo) return tenantLogo;
  if (platformLogo) return platformLogo;
  return DEFAULT_PLATFORM_LOGO;
}