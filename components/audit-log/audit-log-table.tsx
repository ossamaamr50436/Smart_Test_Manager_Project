"use client";

import { useState, useEffect, useCallback, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardHeader,
  CardTitle,
  CardDescription,
} from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  getAuditLogs,
  getAuditLogStats,
  getAuditLogUsers,
  type AuditLogFilters,
  type AuditLogEntry,
  type AuditLogResult,
} from "@/lib/actions/audit-actions";
import { AuditAction } from "@prisma/client";

const ACTION_LABELS: Record<string, string> = {
  CREATE: "إنشاء",
  UPDATE: "تعديل",
  DELETE: "حذف",
  LOGIN: "دخول",
  APPROVE: "اعتماد",
  REJECT: "رفض",
  ASSESS: "تقييم",
};

const ACTION_COLORS: Record<string, string> = {
  CREATE: "bg-green-100 text-green-800",
  UPDATE: "bg-blue-100 text-blue-800",
  DELETE: "bg-red-100 text-red-800",
  LOGIN: "bg-gray-100 text-gray-800",
  APPROVE: "bg-emerald-100 text-emerald-800",
  REJECT: "bg-orange-100 text-orange-800",
  ASSESS: "bg-purple-100 text-purple-800",
};

export function AuditLogTable() {
  const router = useRouter();
  const [isPending, startTransition] = useTransition();
  const [result, setResult] = useState<AuditLogResult | null>(null);
  const [stats, setStats] = useState<{ action: string; count: number }[]>([]);
  const [users, setUsers] = useState<{ id: string; name: string; email: string }[]>([]);
  const [loading, setLoading] = useState(true);

  const [filters, setFilters] = useState<AuditLogFilters>({
    action: "",
    userId: "",
    dateFrom: "",
    dateTo: "",
    search: "",
    page: 1,
  });

  useEffect(() => {
    loadInitialData();
  }, []);

  const loadLogs = useCallback(async () => {
    startTransition(async () => {
      try {
        const logs = await getAuditLogs(filters);
        setResult(logs);
      } catch {
        // بدون تفاصيل خطأ (أمان)
      }
    });
  }, [filters]);

  useEffect(() => {
    loadLogs();
  }, [loadLogs]);

  async function loadInitialData() {
    try {
      const [logs, s, u] = await Promise.all([
        getAuditLogs({ page: 1 }),
        getAuditLogStats(),
        getAuditLogUsers(),
      ]);
      setResult(logs);
      setStats(s);
      setUsers(u);
    } catch {
      // بدون تفاصيل خطأ (أمان)
    } finally {
      setLoading(false);
    }
  }

  function handleFilterChange(key: keyof AuditLogFilters, value: string) {
    setFilters((prev) => ({ ...prev, [key]: value, page: 1 }));
  }

  function handlePageChange(newPage: number) {
    setFilters((prev) => ({ ...prev, page: newPage }));
  }

  if (loading) {
    return (
      <div className="py-12 text-center text-muted-foreground">
        جارٍ تحميل سجل التدقيق...
      </div>
    );
  }

  return (
    <div className="space-y-4">
      {/* إحصائيات سريعة */}
      {stats.length > 0 && (
        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
          {stats.map((s) => (
            <Card key={s.action}>
              <CardContent className="py-3">
                <p className="text-xs text-muted-foreground">العمليات</p>
                <p className="text-2xl font-bold">{s.count}</p>
                <p className="text-xs text-muted-foreground">
                  {ACTION_LABELS[s.action] ?? s.action}
                </p>
              </CardContent>
            </Card>
          ))}
        </div>
      )}

      {/* فلاتر البحث */}
      <Card>
        <CardHeader>
          <CardTitle className="text-base">التصفية والبحث</CardTitle>
        </CardHeader>
        <CardContent>
          <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
            <div className="space-y-1">
              <Label>نوع العملية</Label>
              <select
                value={filters.action}
                onChange={(e) => handleFilterChange("action", e.target.value)}
                className="w-full rounded-md border bg-background px-3 py-2 text-sm"
              >
                <option value="">جميع العمليات</option>
                {Object.values(AuditAction).map((a) => (
                  <option key={a} value={a}>
                    {ACTION_LABELS[a] ?? a}
                  </option>
                ))}
              </select>
            </div>

            <div className="space-y-1">
              <Label>المستخدم</Label>
              <select
                value={filters.userId}
                onChange={(e) => handleFilterChange("userId", e.target.value)}
                className="w-full rounded-md border bg-background px-3 py-2 text-sm"
              >
                <option value="">جميع المستخدمين</option>
                {users.map((u) => (
                  <option key={u.id} value={u.id}>
                    {u.name} ({u.email})
                  </option>
                ))}
              </select>
            </div>

            <div className="space-y-1">
              <Label>بحث في التفاصيل</Label>
              <Input
                value={filters.search}
                onChange={(e) => handleFilterChange("search", e.target.value)}
                placeholder="بحث..."
                dir="rtl"
              />
            </div>

            <div className="space-y-1">
              <Label>من تاريخ</Label>
              <Input
                type="date"
                value={filters.dateFrom}
                onChange={(e) => handleFilterChange("dateFrom", e.target.value)}
              />
            </div>

            <div className="space-y-1">
              <Label>إلى تاريخ</Label>
              <Input
                type="date"
                value={filters.dateTo}
                onChange={(e) => handleFilterChange("dateTo", e.target.value)}
              />
            </div>
          </div>
        </CardContent>
      </Card>

      {/* جدول السجلات */}
      <Card>
        <CardHeader>
          <CardTitle className="text-base">سجل العمليات</CardTitle>
          <CardDescription>
            {result?.total ?? 0} عملية مسجلة
          </CardDescription>
        </CardHeader>
        <CardContent>
          {isPending && (
            <p className="py-4 text-center text-sm text-muted-foreground">
              جارٍ التحميل...
            </p>
          )}

          {!isPending && result && result.entries.length === 0 && (
            <p className="py-8 text-center text-muted-foreground">
              لا توجد سجلات تطابق معايير البحث
            </p>
          )}

          {!isPending && result && result.entries.length > 0 && (
            <div className="space-y-2">
              {result.entries.map((entry) => (
                <div
                  key={entry.id}
                  className="flex flex-wrap items-start justify-between gap-3 rounded-lg border px-4 py-3"
                >
                  <div className="space-y-1">
                    <div className="flex items-center gap-2">
                      <span
                        className={`inline-flex items-center rounded-full px-2 py-0.5 text-xs font-medium ${
                          ACTION_COLORS[entry.action] ?? "bg-gray-100 text-gray-800"
                        }`}
                      >
                        {ACTION_LABELS[entry.action] ?? entry.action}
                      </span>
                      <span className="text-xs text-muted-foreground">
                        {entry.user
                          ? `${entry.user.name} (${entry.user.email})`
                          : "نظام"}
                      </span>
                    </div>
                    <p className="text-xs text-muted-foreground">
                      {new Date(entry.timestamp).toLocaleDateString("ar-SA", {
                        year: "numeric",
                        month: "long",
                        day: "numeric",
                        hour: "2-digit",
                        minute: "2-digit",
                      })}
                    </p>
                    {entry.details && (
                      <pre className="max-w-xl whitespace-pre-wrap break-all text-xs text-muted-foreground">
                        {typeof entry.details === "string"
                          ? entry.details
                          : JSON.stringify(entry.details, null, 2)}
                      </pre>
                    )}
                  </div>
                </div>
              ))}
            </div>
          )}

          {/* ترقيم الصفحات */}
          {result && result.totalPages > 1 && (
            <div className="mt-4 flex items-center justify-center gap-2">
              <Button
                size="sm"
                variant="outline"
                disabled={result.page <= 1}
                onClick={() => handlePageChange(result.page - 1)}
              >
                السابق
              </Button>
              <span className="text-sm text-muted-foreground">
                صفحة {result.page} من {result.totalPages}
              </span>
              <Button
                size="sm"
                variant="outline"
                disabled={result.page >= result.totalPages}
                onClick={() => handlePageChange(result.page + 1)}
              >
                التالي
              </Button>
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
