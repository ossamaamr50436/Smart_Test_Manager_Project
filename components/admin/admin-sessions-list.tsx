"use client";

import { useState, useEffect, useCallback, useTransition } from "react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Label } from "@/components/ui/label";
import { getAdminSessions } from "@/lib/actions/admin-panel-actions";
import { ExamSessionStatus } from "@prisma/client";

type Session = {
  id: string;
  examDate: Date;
  period: string;
  status: ExamSessionStatus;
  student: { id: string; name: string; branch: string } | null;
  teacher1: { id: string; name: string } | null;
  teacher2: { id: string; name: string } | null;
  season: { name: string } | null;
  _count: { assessments: number };
};

type SessionsResult = {
  sessions: Session[];
  total: number;
  totalPages: number;
  page: number;
};

const STATUS_LABELS: Record<ExamSessionStatus, string> = {
  SCHEDULED: "مجدولة",
  IN_PROGRESS: "جارٍ التقييم",
  COMPLETED: "مكتملة",
  CANCELLED: "ملغاة",
};

export function AdminSessionsList() {
  const [isPending, startTransition] = useTransition();
  const [result, setResult] = useState<SessionsResult | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [page, setPage] = useState(1);
  const [status, setStatus] = useState("");

  const load = useCallback(async () => {
    startTransition(async () => {
      try {
        setResult(await getAdminSessions({ page, status: status || undefined }));
        setError("");
      } catch (e) {
        setError(e instanceof Error ? e.message : "تعذر تحميل الجلسات");
      }
    });
  }, [page, status]);

  useEffect(() => {
    if (!loading) load();
  }, [load, loading]);

  useEffect(() => {
    setLoading(false);
  }, []);

  return (
    <div className="space-y-4">
      {error && (
        <p className="rounded-md border border-destructive/20 bg-destructive/10 px-4 py-3 text-sm text-destructive">{error}</p>
      )}
      {loading ? (
        <div className="py-12 text-center text-muted-foreground">جارٍ تحميل الجلسات...</div>
      ) : (
        <>
          <Card>
            <CardHeader><CardTitle className="text-base">التصفية</CardTitle></CardHeader>
            <CardContent>
              <div className="max-w-xs space-y-1">
                <Label>الحالة</Label>
                <select value={status} onChange={(e) => { setStatus(e.target.value); setPage(1); }} className="w-full rounded-md border bg-background px-3 py-2 text-sm">
                  <option value="">جميع الحالات</option>
                  {Object.values(ExamSessionStatus).map((s) => (
                    <option key={s} value={s}>{STATUS_LABELS[s]}</option>
                  ))}
                </select>
              </div>
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle className="text-base">جلسات الاختبار</CardTitle>
              <CardDescription>{result?.total ?? 0} جلسة</CardDescription>
            </CardHeader>
            <CardContent>
              {isPending && <p className="py-4 text-center text-sm text-muted-foreground">جارٍ التحميل...</p>}
              {!isPending && result && result.sessions.length === 0 && (
                <p className="py-8 text-center text-muted-foreground">لا توجد جلسات</p>
              )}
              {!isPending && result && result.sessions.length > 0 && (
                <div className="space-y-2">
                  {result.sessions.map((s) => (
                    <div key={s.id} className="flex flex-wrap items-center justify-between gap-3 rounded-lg border px-4 py-3">
                      <div className="space-y-1">
                        <p className="font-medium">{s.student?.name ?? "—"}</p>
                        <p className="text-xs text-muted-foreground">
                          {s.student?.branch ?? "—"} أجزاء — الفترة: {s.period} —{" "}
                          {s.season?.name ?? "بدون موسم"}
                        </p>
                        <p className="text-xs text-muted-foreground">
                          القيّمان: {s.teacher1?.name ?? "—"} و {s.teacher2?.name ?? "—"} —{" "}
                          {s._count.assessments} تقييم
                        </p>
                      </div>
                      <div className="flex flex-col items-end gap-1">
                        <span className="inline-flex items-center rounded-full bg-secondary-100 px-2 py-0.5 text-xs font-medium text-primary-700">
                          {STATUS_LABELS[s.status]}
                        </span>
                        <span className="text-xs text-muted-foreground">
                          {new Date(s.examDate).toLocaleDateString("ar-SA")}
                        </span>
                      </div>
                    </div>
                  ))}
                </div>
              )}

              {result && result.totalPages > 1 && (
                <div className="mt-4 flex items-center justify-center gap-2">
                  <Button size="sm" variant="outline" disabled={result.page <= 1} onClick={() => setPage((p) => p - 1)}>السابق</Button>
                  <span className="text-sm text-muted-foreground">صفحة {result.page} من {result.totalPages}</span>
                  <Button size="sm" variant="outline" disabled={result.page >= result.totalPages} onClick={() => setPage((p) => p + 1)}>التالي</Button>
                </div>
              )}
            </CardContent>
          </Card>
        </>
      )}
    </div>
  );
}
