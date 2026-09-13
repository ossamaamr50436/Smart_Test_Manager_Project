import "server-only";
import type { SessionUser } from "@/lib/security";
import { Role } from "@prisma/client";
import { raiseSecurityAlert } from "@/lib/security-alerts";

// ============================================================
// Multi-Tenant Isolation Helpers
// ============================================================

/**
 * يعيد فلتر Prisma حسب دور المستخدم.
 *
 * SUPER_ADMIN → {} (بدون فلتر — يرى كل شيء)
 * غيره → { tenantId: user.tenantId }
 *
 * @example
 * const filter = getTenantFilter(user);
 * const users = await prisma.user.findMany({ where: { ...filter, role: "EXAMINER" } });
 */
export function getTenantFilter(user: SessionUser): { tenantId?: string } {
  if (user.role === Role.SUPER_ADMIN) {
    return {};
  }
  if (!user.tenantId) {
    throw new Error("غير مصرح: المستخدم غير مرتبط بمؤسسة");
  }
  return { tenantId: user.tenantId };
}

/**
 * يتطلب أن يكون المستخدم ضمن tenant (يرمي خطأ إذا SUPER_ADMIN أو بلا tenantId).
 * استخدمه في كل عملية تحتاج كتابة داخل tenant.
 */
export function requireTenant(user: SessionUser): string {
  if (user.role === Role.SUPER_ADMIN) {
    throw new Error("غير مصرح: هذه العملية مخصصة للمؤسسات");
  }
  if (!user.tenantId) {
    throw new Error("غير مصرح: المستخدم غير مرتبط بمؤسسة");
  }
  return user.tenantId;
}

/**
 * يتطلب أن يكون المستخدم SUPER_ADMIN.
 */
export function requireSuperAdmin(user: SessionUser): void {
  if (user.role !== Role.SUPER_ADMIN) {
    throw new Error("غير مصرح: هذه العملية مخصصة لمالك المنصة");
  }
}

/**
 * تحقق أن كائن ينتمي لـ tenant المستخدم.
 * يرمي خطأ إذا حاول الوصول لبيانات tenant آخر.
 *
 * SUPER_ADMIN يمكنه الوصول لأي tenant.
 */
export function assertSameTenant<T extends { tenantId?: string | null }>(
  sessionUser: SessionUser,
  resource: T
): void {
  if (sessionUser.role === Role.SUPER_ADMIN) {
    return; // SUPER_ADMIN يرى كل شيء
  }
  if (resource.tenantId !== sessionUser.tenantId) {
    // Layer 3 — رفع تنبيه أمني (مستوى المنصة) عند محاولة وصول عبر المستأجرين.
    // لا يُفشل التنبيه نفسه العملية أبداً (raiseSecurityAlert معزول بـ try/catch داخلي).
    raiseSecurityAlert({
      type: "cross_tenant_attempt",
      message: "محاولة وصول عبر المستأجرين (Cross-Tenant)",
      userId: sessionUser.id,
      tenantId: sessionUser.tenantId ?? null,
      details: { targetTenantId: resource.tenantId ?? null },
    });
    throw new Error("غير مصرح: هذا السجل ينتمي لمؤسسة أخرى");
  }
}

/**
 * تحقق أن دور المستخدم في قائمة مسموحة.
 */
export function assertHasRole(user: SessionUser, allowed: Role[]): void {
  if (!allowed.includes(user.role)) {
    throw new Error(`غير مصرح: تتطلب أحد الأدوار: ${allowed.join(", ")}`);
  }
}