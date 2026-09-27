/**
 * بوابة إجبار تغيير كلمة المرور (المرحلة 4)
 * ------------------------------------------------------------
 * وحدة نقية (بلا Prisma / بلا Node APIs) ليعمل نفس القرار في:
 *  - Edge Middleware عبر `callbacks.authorized` في auth.config.ts
 *  - تخطيط لوحة التحكم على الخادم (RSC)
 *  - حارس مسارات `/api/*` (خارج نطاق matcher في middleware.ts)
 *
 * القاعدة: إن كان `mustChangePassword === true` فالوحيد المسموح هو
 * مسار تغيير كلمة المرور (مع مساراته الفرعية)، ولا تنشأ حلقة إعادة توجيه.
 */

export const CHANGE_PASSWORD_PATH = "/change-password";

/** هل هذا المسار من مسارات تغيير كلمة المرور؟ */
export function isPasswordGateAllowedPath(pathname: string): boolean {
  if (!pathname) return false;
  return (
    pathname === CHANGE_PASSWORD_PATH ||
    pathname.startsWith(CHANGE_PASSWORD_PATH + "/")
  );
}

/**
 * قرار التحويل: يرجع المسار الواجب التحويل إليه أو `null` عند السماح.
 * `undefined` يُعامل كـ`false` (مستخدم طبيعي غير مجبر).
 */
export function resolvePasswordGate(input: {
  mustChangePassword?: boolean | null;
  pathname: string;
}): string | null {
  if (input.mustChangePassword !== true) return null;
  if (isPasswordGateAllowedPath(input.pathname)) return null;
  return CHANGE_PASSWORD_PATH;
}

/**
 * فحص الجلسة على الخادم: يرمي خطأ صريحاً (يبدأ بـ"غير مصرح")
 * بدل الاعتماد على إخفاء عناصر الواجهة.
 */
export function assertPasswordChanged(user: {
  mustChangePassword?: boolean | null;
}): void {
  if (user.mustChangePassword === true) {
    throw new Error("غير مصرح: يجب تغيير كلمة المرور قبل متابعة استخدام المنصة");
  }
}
