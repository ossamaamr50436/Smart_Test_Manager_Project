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

  const page = filters.page ?? 1;
  const pageSize = filters.pageSize ?? 20;
  const skip = (page - 1) * pageSize;

  const where: Prisma.AuditLogWhereInput = {};

  if (filters.action) {
    where.action = filters.action;
  }

  if (filters.userId) {
    where.userId = filters.userId;
  }

  if (filters.dateFrom || filters.dateTo) {
    where.timestamp = {};
    if (filters.dateFrom) {
      where.timestamp.gte = new Date(filters.dateFrom);
    }
    if (filters.dateTo) {
      const toDate = new Date(filters.dateTo);
      toDate.setHours(23, 59, 59, 999);
      where.timestamp.lte = toDate;
    }
  }

  if (filters.search) {
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
