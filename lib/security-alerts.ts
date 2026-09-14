import "server-only";
import { prisma } from "@/lib/prisma";
import { AuditAction, NotificationType, Role } from "@prisma/client";
import { broadcastSecurityAlert } from "@/lib/realtime";

// ============================================================
// Layer 3 — Intrusion Detection + Alerting
// رفع تنبيه أمني على مستوى المنصة (tenantId: null) عند:
//   - محاولة وصول عبر المستأجرين (CROSS_TENANT_ATTEMPT)
//   - تجاوز حد معدل الطلبات (RATE_LIMIT_HIT)
//   - محاولة دخول فاشلة (FAILED_LOGIN)
//   - وصول مشبوه عام (SUSPICIOUS_ACCESS)
// القاعدة: أي فشل في التنبيه لا يُفشل الطلب الأصلي (try/catch شامل).
// ============================================================

export type SecurityAlertType =
  | "cross_tenant_attempt"
  | "rate_limit_hit"
  | "failed_login"
  | "suspicious_access";

export interface SecurityAlertPayload {
  type: SecurityAlertType;
  message: string;
  userId?: string | null;
  tenantId?: string | null;
  ip?: string | null;
  details?: Record<string, unknown>;
}

const ACTION_BY_TYPE: Record<SecurityAlertType, AuditAction> = {
  cross_tenant_attempt: AuditAction.CROSS_TENANT_ATTEMPT,
  rate_limit_hit: AuditAction.RATE_LIMIT_HIT,
  failed_login: AuditAction.FAILED_LOGIN,
  suspicious_access: AuditAction.SUSPICIOUS_ACCESS,
};

const OPERATION_BY_TYPE: Record<SecurityAlertType, string> = {
  cross_tenant_attempt: "CROSS_TENANT_ATTEMPT",
  rate_limit_hit: "RATE_LIMIT_HIT",
  failed_login: "FAILED_LOGIN",
  suspicious_access: "SUSPICIOUS_ACCESS",
};

/**
 * يرفع تنبيهاً أمنياً على مستوى المنصة:
 *  1) سجل في AuditLog (tenantId: null — مستوى المنصة) مع بيانات موحّدة:
 *     userId + tenantId + operation + timestamp داخل details.
 *  2) بث لحظي لـ Pusher على القناة private-super-admin-alerts.
 *  3) إشعار داخلي لكل مستخدم SUPER_ADMIN.
 * جميع القنوات معزولة في try/catch — فشل أيٍّ منها لا يُسقط العملية.
 */
export async function raiseSecurityAlert(payload: SecurityAlertPayload): Promise<void> {
  // بيانات موحّدة لكل تنبيه (تُفحَص لاحقاً في سجل التدقيق)
  const normalized = {
    ...(payload.details ?? {}),
    alertType: payload.type,
    message: payload.message,
    ip: payload.ip ?? null,
    userId: payload.userId ?? null,
    tenantId: payload.tenantId ?? null,
    operation:
      typeof payload.details?.operation === "string"
        ? payload.details.operation
        : OPERATION_BY_TYPE[payload.type],
    timestamp: new Date().toISOString(),
  };

  // 1) سجل التدقيق (مستوى المنصة)
  try {
    await prisma.auditLog.create({
      data: {
        userId: payload.userId ?? null,
        action: ACTION_BY_TYPE[payload.type],
        details: normalized,
        tenantId: null,
      },
    });
  } catch {
    // فشل السجل لا يُفشل الطلب
  }

  // 2) البث اللحظي لقناة تنبيهات المالك
  try {
    await broadcastSecurityAlert({
      alertType: payload.type,
      message: payload.message,
      ip: payload.ip ?? null,
    });
  } catch {
    // فشل البث لا يُفشل الطلب
  }

  // 3) إشعارات داخلية لجميع مالكي المنصة
  try {
    const admins = await prisma.user.findMany({
      where: { role: Role.SUPER_ADMIN },
      select: { id: true, tenantId: true },
    });
    if (admins.length > 0) {
      await prisma.notification.createMany({
        data: admins.map((a) => ({
          userId: a.id,
          message: payload.message,
          type: NotificationType.ERROR,
          tenantId: a.tenantId, // SUPER_ADMIN → null (مستوى المنصة)
        })),
        skipDuplicates: true,
      });
    }
  } catch {
    // فشل الإشعارات لا يُفشل الطلب
  }
}