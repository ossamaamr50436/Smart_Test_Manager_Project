"use client";

import { getBranchLabel } from "@/lib/utils";
import { useState, useEffect, useCallback, useTransition } from "react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { getAdminStudents, getInstitutionsOptions } from "@/lib/actions/admin-panel-actions";
import { StudentStatus } from "@prisma/client";

type Student = {
  id: string;
  name: string;
  age: number;
  branch: string;
  status: StudentStatus;
  teacherName: string;
  parentPhone: string;
  institution: { name: string } | null;
  createdAt: Date;
};

type StudentsResult = {
  students: Student[];
  total: number;
  totalPages: number;
  page: number;
};

const STATUS_LABELS: Record<StudentStatus, string> = {
  PENDING: "بانتظار المراجعة",
  APPROVED: "مقبول",
  REJECTED: "مرفوض",
  ASSIGNED: "موزع على لجنة",
  COMPLETED: "اكتمل تقييمه",
  NOTIFIED: "اعتمده الأخصائي",
  READY_FOR_CERTIFICATE: "جاهز للشهادة",
  CERTIFICATE_ISSUED: "صدرت شهادته",
};

export function AdminStudentsList() {
  const [isPending, startTransition] = useTransition();
  const [result, setResult] = useState<StudentsResult | null>(null);
  const [institutions, setInstitutions] = useState<{ id: string; name: string }[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [page, setPage] = useState(1);
  const [search, setSearch] = useState("");
  const [status, setStatus] = useState("");
  const [institutionId, setInstitutionId] = useState("");

  const load = useCallback(async () => {
    startTransition(async () => {
      try {
        setResult(await getAdminStudents({
          page,
          search: search || undefined,
          status: status || undefined,
          institutionId: institutionId || undefined,
        }));
        setError("");
      } catch (e) {
        setError(e instanceof Error ? e.message : "تعذر تحميل الطلاب");
      }
    });
  }, [page, search, status, institutionId]);

  useEffect(() => {
    if (!loading) load();
  }, [load, loading]);

  useEffect(() => {
    (async () => {
      try {
        setInstitutions(await getInstitutionsOptions());
      } catch {
        setInstitutions([]);
      } finally {
        setLoading(false);
      }
    })();
  }, []);

  return (
    <div className="space-y-4">
      {error && (
        <p className="rounded-md border border-destructive/20 bg-destructive/10 px-4 py-3 text-sm text-destructive">{error}</p>
      )}
      {loading ? (
        <div className="py-12 text-center text-muted-foreground">جارٍ تحميل الطلاب...</div>
      ) : (
        <>
          <Card>
            <CardHeader><CardTitle className="text-base">التصفية والبحث</CardTitle></CardHeader>
            <CardContent>
              <div className="grid gap-3 sm:grid-cols-3">
                <div className="space-y-1">
                  <Label>بحث بالاسم</Label>
                  <Input value={search} onChange={(e) => { setSearch(e.target.value); setPage(1); }} dir="rtl" />
                </div>
                <div className="space-y-1">
                  <Label>الحالة</Label>
                  <select value={status} onChange={(e) => { setStatus(e.target.value); setPage(1); }} className="w-full rounded-md border bg-background px-3 py-2 text-sm">
                    <option value="">جميع الحالات</option>
                    {Object.values(StudentStatus).map((s) => (
                      <option key={s} value={s}>{STATUS_LABELS[s]}</option>
                    ))}
                  </select>
                </div>
                <div className="space-y-1">
                  <Label>الجهة</Label>
                  <select value={institutionId} onChange={(e) => { setInstitutionId(e.target.value); setPage(1); }} className="w-full rounded-md border bg-background px-3 py-2 text-sm">
                    <option value="">جميع الجهات</option>
                    {institutions.map((i) => (
                      <option key={i.id} value={i.id}>{i.name}</option>
                    ))}
                  </select>
                </div>
              </div>
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle className="text-base">الطلاب</CardTitle>
              <CardDescription>{result?.total ?? 0} طالب</CardDescription>
            </CardHeader>
            <CardContent>
              {isPending && <p className="py-4 text-center text-sm text-muted-foreground">جارٍ التحميل...</p>}
              {!isPending && result && result.students.length === 0 && (
                <p className="py-8 text-center text-muted-foreground">لا يوجد طلاب</p>
              )}
              {!isPending && result && result.students.length > 0 && (
                <div className="space-y-2">
                  {result.students.map((s) => (
                    <div key={s.id} className="flex flex-wrap items-center justify-between gap-3 rounded-lg border px-4 py-3">
                      <div className="space-y-1">
                        <p className="font-medium">{s.name}</p>
                        <p className="text-xs text-muted-foreground">
                          {s.age} سنة — {getBranchLabel(s.branch)} — {s.institution?.name ?? "—"}
                        </p>
                        <p className="text-xs text-muted-foreground">
                          المعلم: {s.teacherName} — ولي الأمر: {s.parentPhone}
                        </p>
                      </div>
                      <div className="flex flex-col items-end gap-1">
                        <span className="inline-flex items-center rounded-full bg-secondary-100 px-2 py-0.5 text-xs font-medium text-primary-700">
                          {STATUS_LABELS[s.status]}
                        </span>
                        <span className="text-xs text-muted-foreground">
                          {new Date(s.createdAt).toLocaleDateString("ar-SA")}
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
