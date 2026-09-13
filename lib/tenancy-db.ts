import "server-only";
import { prisma } from "@/lib/prisma";
import type { Prisma } from "@prisma/client";
import type { SessionUser } from "@/lib/security";
import { Role } from "@prisma/client";

// ============================================================
// Layer 2 — سياق المستأجر على مستوى الاتصال (RLS)
//
// Utility جاهز للتفعيل مستقبلاً مع هجرة enable_row_level_security.
// عند تشغيل RLS، يجب لف كل Server Action بـ withTenantContext حتى
// تُضبط قيمة app.tenant_id داخل المعاملة (is_local=true → تُعاد
// تلقائياً عند انتهاء المعاملة، فلا تتسرب لاتصال آخر في المجمع).
//
//   - مستخدم مؤسسة  → app.tenant_id = <tenantId>
//   - SUPER_ADMIN   → app.tenant_id = '' (يرى الكل عبر السياسات)
//   - مستخدم بلا tenant → يرمي (لا سياق آمن — fail-closed)
//
// ⚠️ غير مستخدم بعد في قاعدة الكود — يُفسَّر هذا الملف كدليل تنفيذ
// للإصدار القادم (ما زال التطبيق يعمل بالعزل المنطقي Layer 1).
// ============================================================

export async function withTenantContext<T>(
  user: SessionUser,
  fn: (tx: Prisma.TransactionClient) => Promise<T>
): Promise<T> {
  const tenantId = user.role === Role.SUPER_ADMIN ? "" : user.tenantId ?? null;
  if (tenantId === null) {
    throw new Error("غير مصرح: المستخدم غير مرتبط بمؤسسة");
  }

  return prisma.$transaction(async (tx) => {
    await tx.$executeRaw`SELECT set_config('app.tenant_id', ${tenantId}, true)`;
    return fn(tx);
  });
}