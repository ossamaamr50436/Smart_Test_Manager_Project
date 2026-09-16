"use client";

import { getBranchLabel } from "@/lib/utils";
import { useState, useEffect, useCallback, useTransition } from "react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { getAcceptedStudents, updateAcceptedStudent } from "@/lib/actions/admin-panel-actions";
import { StudentStatus } from "@prisma/client";
import { BRANCHES, PERIODS } from "@/lib/validations/student";

type AcceptedRow = {
  id: string;
  name: string;
  nationality: string;
  branch: string;
  status: StudentStatus;
  createdAt: Date;
  approvedAt: Date | null;
  institution: { name: string } | null;
  committee: { id: string; name: string } | null;
  examSessions: { id: string; examDate: Date; period: string }[];
};

const ACCEPTED_STATUSES = [
  StudentStatus.APPROVED,
  StudentStatus.ASSIGNED,
  StudentStatus.COMPLETED,
  StudentStatus.NOTIFIED,
  StudentStatus.READY_FOR_CERTIFICATE,
  StudentStatus.CERTIFICATE_ISSUED,
];

const STATUS_LABELS: Record<string, string> = {
  APPROVED: "مقبول",
  ASSIGNED: "موزع على لجنة",
  COMPLETED: "اكتمل تقييمه",
  NOTIFIED: "اعتمده الأخصائي",
  READY_FOR_CERTIFICATE: "جاهز للشهادة",
  CERTIFICATE_ISSUED: "صدرت شهادته",
};

type EditState = {
  student: AcceptedRow;
  branch: string;
  committeeId: string;
  period: string;
  examDate: string;
};

function fmtDate(d: Date | null | undefined): string {
  if (!d) return "—";
  return new Date(d).toLocaleDateString("ar-SA");
}

function toDateInput(d: Date | null | undefined): string {
  if (!d) return "";
  const dt = new Date(d);
  const y = dt.getFullYear();
  const m = String(dt.getMonth() + 1).padStart(2, "0");
  const day = String(dt.getDate()).padStart(2, "0");
  return `${y}-${m}-${day}`;
}

export function AcceptedStudentsManager({
  institutions,
  committees,
}: {
  institutions: { id: string; name: string }[];
  committees: { id: string; name: string }[];
}) {
  const [isPending, startTransition] = useTransition();
  const [result, setResult] = useState<{ students: AcceptedRow[]; total: number; totalPages: number; page: number } | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [page, setPage] = useState(1);
  const [search, setSearch] = useState("");
  const [status, setStatus] = useState("");
  const [institutionId, setInstitutionId] = useState("");
  const [branch, setBranch] = useState("");
  const [period, setPeriod] = useState("");
  const [editState, setEditState] = useState<EditState | null>(null);
  const [saving, setSaving] = useState(false);
  const [formError, setFormError] = useState("");
  const [notice, setNotice] = useState("");

  const load = useCallback(() => {
    startTransition(async () => {
      try {
        setResult(await getAcceptedStudents({
          page,
          search: search || undefined,
          status: status || undefined,
          institutionId: institutionId || undefined,
          branch: branch || undefined,
          period: period || undefined,
        }));
        setError("");
      } catch (e) {
        setError(e instanceof Error ? e.message : "تعذر تحميل الطلاب المقبولين");
      }
    });
  }, [page, search, status, institutionId, branch, period]);

  useEffect(() => {
    if (!loading) load();
  }, [load, loading]);

  useEffect(() => {
    setLoading(false);
  }, []);

  function openEdit(s: AcceptedRow) {
    const session = s.examSessions[0];
    setEditState({
      student: s,
      branch: s.branch,
      committeeId: s.committee?.id ?? "",
      period: session?.period ?? "",
      examDate: toDateInput(session?.examDate ?? null),
    });
    setFormError("");
    setNotice("");
  }

  async function handleSave() {
    if (!editState) return;
    setSaving(true);
    setFormError("");
    try {
      const res = await updateAcceptedStudent(editState.student.id, {
        branch: editState.branch,
        committeeId: editState.committeeId === "" ? null : editState.committeeId,
        period: editState.period || undefined,
        examDate: editState.examDate || undefined,
      });
      if (res.success) {
        setEditState(null);
        setNotice("تم حفظ التعديلات على بيانات الطالب");
        load();
      } else {
        setFormError(res.error);
      }
    } catch (e) {
      setFormError(e instanceof Error ? e.message : "حدث خطأ غير متوقع");
    } finally {
      setSaving(false);
    }
  }

  const hasSession = (s: AcceptedRow) => (s.examSessions.length ?? 0) > 0;

  return (
    <div className="space-y-4">
      {error && (
        <p className="rounded-md border border-destructive/20 bg-destructive/10 px-4 py-3 text-sm text-destructive">{error}</p>
      )}
      {notice && (
        <p className="rounded-md bg-emerald-500/10 px-4 py-3 text-sm text-emerald-600">{notice}</p>
      )}

      <Card>
        <CardHeader><CardTitle className="text-base">التصفية والبحث</CardTitle></CardHeader>
        <CardContent>
          <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-5">
            <div className="space-y-1">
              <Label>بحث بالاسم</Label>
              <Input value={search} onChange={(e) => { setSearch(e.target.value); setPage(1); }} dir="rtl" />
            </div>
            <div className="space-y-1">
              <Label>الحالة</Label>
              <select value={status} onChange={(e) => { setStatus(e.target.value); setPage(1); }} className="w-full rounded-md border bg-background px-3 py-2 text-sm">
                <option value="">جميع الحالات</option>
                {ACCEPTED_STATUSES.map((s) => (
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
            <div className="space-y-1">
              <Label>الفرع</Label>
              <select value={branch} onChange={(e) => { setBranch(e.target.value); setPage(1); }} className="w-full rounded-md border bg-background px-3 py-2 text-sm">
                <option value="">جميع الفروع</option>
                {BRANCHES.map((b) => (
                  <option key={b} value={b}>{getBranchLabel(b)}</option>
                ))}
              </select>
            </div>
            <div className="space-y-1">
              <Label>الفترة</Label>
              <select value={period} onChange={(e) => { setPeriod(e.target.value); setPage(1); }} className="w-full rounded-md border bg-background px-3 py-2 text-sm">
                <option value="">جميع الفترات</option>
                {PERIODS.map((p) => (
                  <option key={p} value={p}>{p}</option>
                ))}
              </select>
            </div>
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle className="text-base">الطلاب المقبولون</CardTitle>
          <CardDescription>{result?.total ?? 0} طالب</CardDescription>
        </CardHeader>
        <CardContent>
          {isPending && <p className="py-4 text-center text-sm text-muted-foreground">جارٍ التحميل...</p>}
          {!isPending && result && result.students.length === 0 && (
            <p className="py-8 text-center text-muted-foreground">لا يوجد طلاب</p>
          )}
          {!isPending && result && result.students.length > 0 && (
            <div className="overflow-x-auto">
              <table className="w-full border-collapse text-sm">
                <thead>
                  <tr className="border-b">
                    <th className="p-2 text-right font-medium">الاسم</th>
                    <th className="p-2 text-right font-medium">الجنسية</th>
                    <th className="p-2 text-right font-medium">الفرع</th>
                    <th className="p-2 text-right font-medium">الجهة</th>
                    <th className="p-2 text-right font-medium">تاريخ الترشيح</th>
                    <th className="p-2 text-right font-medium">تاريخ القبول</th>
                    <th className="p-2 text-right font-medium">تاريخ الاختبار</th>
                    <th className="p-2 text-right font-medium">الفترة</th>
                    <th className="p-2 text-right font-medium">اللجنة</th>
                    <th className="p-2 text-right font-medium">الحالة</th>
                    <th className="p-2 text-center font-medium">إجراءات</th>
                  </tr>
                </thead>
                <tbody>
                  {result.students.map((s) => {
                    const session = s.examSessions[0];
                    return (
                      <tr key={s.id} className="border-b">
                        <td className="p-2 font-medium">{s.name}</td>
                        <td className="p-2">{s.nationality}</td>
                        <td className="p-2">{getBranchLabel(s.branch)}</td>
                        <td className="p-2">{s.institution?.name ?? "—"}</td>
                        <td className="p-2">{fmtDate(s.createdAt)}</td>
                        <td className="p-2">{fmtDate(s.approvedAt)}</td>
                        <td className="p-2">{fmtDate(session?.examDate ?? null)}</td>
                        <td className="p-2">{session?.period ?? "—"}</td>
                        <td className="p-2">{s.committee?.name ?? "—"}</td>
                        <td className="p-2">{STATUS_LABELS[s.status]}</td>
                        <td className="p-2 text-center">
                          <Button variant="outline" size="sm" onClick={() => openEdit(s)}>تعديل</Button>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
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

      {editState && (
        <Dialog open onOpenChange={(open) => !open && setEditState(null)}>
          <DialogContent className="sm:max-w-md">
            <DialogHeader>
              <DialogTitle>تعديل بيانات الطالب</DialogTitle>
            </DialogHeader>
            <div className="space-y-4">
              <div className="space-y-2">
                <Label>الفرع *</Label>
                <Select value={editState.branch} onValueChange={(v) => setEditState({ ...editState, branch: v })}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>
                    {BRANCHES.map((b) => (
                      <SelectItem key={b} value={b}>{getBranchLabel(b)}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-2">
                <Label>اللجنة</Label>
                <Select value={editState.committeeId} onValueChange={(v) => setEditState({ ...editState, committeeId: v })}>
                  <SelectTrigger><SelectValue placeholder="بدون لجنة" /></SelectTrigger>
                  <SelectContent>
                    {committees.map((c) => (
                      <SelectItem key={c.id} value={c.id}>{c.name}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-2">
                <div className="flex items-center justify-between">
                  <Label>تاريخ الاختبار</Label>
                  {!hasSession(editState.student) && (
                    <span className="text-xs text-muted-foreground">لا توجد جلسة بعد</span>
                  )}
                </div>
                <Input
                  type="date"
                  disabled={!hasSession(editState.student)}
                  value={editState.examDate}
                  onChange={(e) => setEditState({ ...editState, examDate: e.target.value })}
                />
              </div>
              <div className="space-y-2">
                <Label>الفترة</Label>
                <Select
                  value={editState.period}
                  disabled={!hasSession(editState.student)}
                  onValueChange={(v) => setEditState({ ...editState, period: v })}
                >
                  <SelectTrigger><SelectValue placeholder={hasSession(editState.student) ? "اختر الفترة" : "لا توجد جلسة بعد"} /></SelectTrigger>
                  <SelectContent>
                    {PERIODS.map((p) => (
                      <SelectItem key={p} value={p}>{p}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              {formError && (
                <p className="rounded-md bg-destructive/10 px-3 py-2 text-sm text-destructive">{formError}</p>
              )}
            </div>
            <DialogFooter>
              <Button variant="ghost" onClick={() => setEditState(null)}>إلغاء</Button>
              <Button onClick={handleSave} disabled={saving || !editState.branch}>
                {saving ? "جارٍ الحفظ..." : "حفظ التعديلات"}
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>
      )}
    </div>
  );
}