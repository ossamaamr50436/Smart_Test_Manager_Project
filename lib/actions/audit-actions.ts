"use server";

import { prisma } from "@/lib/prisma";
import { requireUser, requireRole } from "@/lib/security";
import { Role, AuditAction, Prisma } from "@prisma/client";

// ============================================================
// سجل التدقيق (المادة 8 — عزل الصلاحيات)
// لا يظهر إلا للمستخدمين من نوع ADMIN أو TEST_SPECIALIST
// ============================================================

export type AuditLogFilters = {
  action?: AuditAction | "";
  userId?: string;
  dateFrom?: string;
  dateTo?: string;
  search?: string;
  page?: number;
  pageSize?: number;
};

export type AuditLogEntry = {
  id: string;
  action: AuditAction;
  details: Prisma.JsonValue;
  timestamp: Date;
  user: { name: string; email: string } | null;
};

export type AuditLogResult = {
  entries: AuditLogEntry[];
  total: number;
  page: number;
  pageSize: number;
  totalPages: number;
};

/**
 * جلب سجلات التدقيق مع التصفية والبحث
 * عزل الصلاحيات: ADMIN و TEST_SPECIALIST فقط
 */
export async function getAuditLogs(
  filters: AuditLogFilters = {}
): Promise<AuditLogResult> {
  const user = await requireUser();
  requireRole(user, [Role.ADMIN, Role.TEST_SPECIALIST]);

  // التحقق من قيم ترقيم الصفحات (منع DoS عبر قيم ضخمة)
  const rawPage = Number(filters.page ?? 1);
  const rawPageSize = Number(filters.pageSize ?? 20);
  if (!Number.isInteger(rawPage) || rawPage < 1 || rawPage > 10000) {
    throw new Error("رقم الصفحة غير صالح");
  }
  if (!Number.isInteger(rawPageSize) || rawPageSize < 1 || rawPageSize > 100) {
    throw new Error("حجم الصفحة غير صالح (الحد الأقصى 100)");
  }
  const page = rawPage;
  const pageSize = rawPageSize;
  const skip = (page - 1) * pageSize;

  const where: Prisma.AuditLogWhereInput = {};

  if (filters.action) {
    where.action = filters.action;
  }

  if (filters.userId) {
    // منع TEST_SPECIALIST من تصفية سجلات ADMIN (تدرّج الصلاحيات)
    if (user.role === Role.TEST_SPECIALIST) {
      const targetUser = await prisma.user.findUnique({
        where: { id: filters.userId },
        select: { role: true },
      });
      if (targetUser?.role === Role.ADMIN) {
        throw new Error("غير مصرح: لا يمكنك عرض سجلات المسؤول");
      }
    }
    where.userId = filters.userId;
  }

  if (filters.dateFrom || filters.dateTo) {
    const from = filters.dateFrom ? new Date(filters.dateFrom) : null;
    const to = filters.dateTo ? new Date(filters.dateTo) : null;
    if (from && Number.isNaN(from.getTime())) {
      throw new Error("تاريخ البداية غير صحيح");
    }
    if (to && Number.isNaN(to.getTime())) {
      throw new Error("تاريخ النهاية غير صحيح");
    }
    where.timestamp = {};
    if (from) where.timestamp.gte = from;
    if (to) {
      const toDate = to;
      toDate.setHours(23, 59, 59, 999);
      where.timestamp.lte = toDate;
    }
  }

  if (filters.search && filters.search.length > 0) {
    if (filters.search.length > 200) {
      throw new Error("نص البحث طويل جداً (الحد الأقصى 200 حرف)");
    }
    where.details = { string_contains: filters.search };
  }

  const [entries, total] = await Promise.all([
    prisma.auditLog.findMany({
      where,
      include: {
        user: {
          select: { name: true, email: true },
        },
      },
      orderBy: { timestamp: "desc" },
      skip,
      take: pageSize,
    }),
    prisma.auditLog.count({ where }),
  ]);

  return {
    entries,
    total,
    page,
    pageSize,
    totalPages: Math.ceil(total / pageSize),
  };
}

/**
 * إحصائيات سجل التدقيق (عدد العمليات حسب النوع)
 */
export async function getAuditLogStats() {
  const user = await requireUser();
  requireRole(user, [Role.ADMIN, Role.TEST_SPECIALIST]);

  const stats = await prisma.auditLog.groupBy({
    by: ["action"],
    _count: { id: true },
  });

  return stats.map((s) => ({
    action: s.action,
    count: s._count.id,
  }));
}

/**
 * جلب قائمة المستخدمين لقائمة التصفية
 */
export async function getAuditLogUsers() {
  const user = await requireUser();
  requireRole(user, [Role.ADMIN, Role.TEST_SPECIALIST]);

  return prisma.user.findMany({
    select: { id: true, name: true, email: true },
    orderBy: { name: "asc" },
  });
}
