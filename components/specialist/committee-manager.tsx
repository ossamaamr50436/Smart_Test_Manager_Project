"use client";

import { getBranchLabel } from "@/lib/utils";
import { Fragment, useState } from "react";
import { useRouter } from "next/navigation";
import { createCommittee, updateCommittee, deleteCommittee, assignStudentToCommittee } from "@/lib/actions/committee-actions";
import { BRANCHES } from "@/lib/validations/assessment";
import { PERIODS } from "@/lib/validations/student";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { cn } from "@/lib/utils";

type ExaminerOption = { id: string; name: string };
type SeasonOption = { id: string; name: string };
type QuestionBankModelOption = { id: string; modelNumber: number; branch: string };

type CommitteeRow = {
  id: string;
  name: string;
  branch: string;
  teacher1: { id: string; name: string };
  teacher2: { id: string; name: string };
  season: { id: string; name: string };
  selectedModels: { id: string; model: { id: string; modelNumber: number } }[];
  _count: { students: number };
};

export function CommitteeManager({
  examiners,
  seasons,
  committees,
  approvedStudents,
  questionBankModels,
}: {
  examiners: ExaminerOption[];
  seasons: SeasonOption[];
  committees: CommitteeRow[];
  approvedStudents: { id: string; name: string; branch: string }[];
  questionBankModels: QuestionBankModelOption[];
}) {
  const router = useRouter();
  const [error, setError] = useState("");
  const [success, setSuccess] = useState("");
  const [loading, setLoading] = useState(false);
  const [confirmDeleteId, setConfirmDeleteId] = useState<string | null>(null);
  const [assignStudentId, setAssignStudentId] = useState("");
  const [assignCommitteeId, setAssignCommitteeId] = useState("");
  const [assignExamDate, setAssignExamDate] = useState("");
  const [assignPeriod, setAssignPeriod] = useState("");
  const [editingId, setEditingId] = useState<string | null>(null);

  // نموذج الإنشاء
  const [name, setName] = useState("");
  const [branch, setBranch] = useState<string>("5");
  const [teacher1Id, setTeacher1Id] = useState("");
  const [teacher2Id, setTeacher2Id] = useState("");
  const [seasonId, setSeasonId] = useState("");
  const [selectedModelIds, setSelectedModelIds] = useState<string[]>([]);

  const branchModels = questionBankModels.filter((m) => m.branch === branch);

  function toggleModel(modelId: string) {
    setSelectedModelIds((prev) =>
      prev.includes(modelId) ? prev.filter((id) => id !== modelId) : [...prev, modelId]
    );
  }

  async function handleCreate() {
    if (loading) return;
    setError("");
    setSuccess("");
    setLoading(true);
    try {
      const input = {
        name,
        branch,
        seasonId,
        teacher1Id,
        teacher2Id,
        modelIds: selectedModelIds,
      };
      if (editingId) {
        const result = await updateCommittee(editingId, input);
        if (result.success) {
          setSuccess("تم تعديل اللجنة بنجاح");
          resetForm();
          router.refresh();
        } else {
          setError(result.error);
        }
      } else {
        const result = await createCommittee(input);
        if (result.success) {
          setSuccess("تم إنشاء اللجنة بنجاح");
          resetForm();
          router.refresh();
        } else {
          setError(result.error);
        }
      }
    } catch (e) {
      setError(e instanceof Error ? e.message : "حدث خطأ غير متوقع");
    } finally {
      setLoading(false);
    }
  }

  function resetForm() {
    setEditingId(null);
    setName("");
    setBranch("5");
    setTeacher1Id("");
    setTeacher2Id("");
    setSeasonId("");
    setSelectedModelIds([]);
    setError("");
    setSuccess("");
  }

  function startEdit(c: CommitteeRow) {
    setEditingId(c.id);
    setName(c.name);
    setBranch(c.branch);
    setTeacher1Id(c.teacher1.id);
    setTeacher2Id(c.teacher2.id);
    setSeasonId(c.season.id);
    setSelectedModelIds(c.selectedModels.map((s) => s.model.id));
    setError("");
    setSuccess("");
  }

  function renderFormFields() {
    return (
      <div className="space-y-4">
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          <div className="space-y-2">
            <Label>اسم اللجنة *</Label>
            <Input value={name} onChange={(e) => setName(e.target.value)} placeholder="مثال: لجنة 1 — فرع 5 أجزاء" />
          </div>
          <div className="space-y-2">
            <Label>الموسم *</Label>
            <Select value={seasonId} onValueChange={setSeasonId}>
              <SelectTrigger><SelectValue placeholder="اختر الموسم" /></SelectTrigger>
              <SelectContent>
                {seasons.map((s) => (
                  <SelectItem key={s.id} value={s.id}>{s.name}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <div className="space-y-2">
            <Label>الفرع *</Label>
            <Select value={branch} onValueChange={(v) => { setBranch(v); setSelectedModelIds([]); }}>
              <SelectTrigger><SelectValue /></SelectTrigger>
              <SelectContent>
                {BRANCHES.map((b) => (
                  <SelectItem key={b} value={b}>{getBranchLabel(b)}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <div className="space-y-2">
            <Label>المختبر الأول *</Label>
            <Select value={teacher1Id} onValueChange={setTeacher1Id}>
              <SelectTrigger><SelectValue placeholder="اختر المختبر الأول" /></SelectTrigger>
              <SelectContent>
                {examiners.map((t) => (
                  <SelectItem key={t.id} value={t.id}>{t.name}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <div className="space-y-2">
            <Label>المختبر الثاني *</Label>
            <Select value={teacher2Id} onValueChange={setTeacher2Id}>
              <SelectTrigger><SelectValue placeholder="اختر المختبر الثاني" /></SelectTrigger>
              <SelectContent>
                {examiners.map((t) => (
                  <SelectItem key={t.id} value={t.id}>{t.name}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
        </div>

        {/* اختيار نماذج اللجنة يدوياً من بنك الأسئلة */}
        <div className="space-y-2">
          <div className="flex items-center justify-between gap-2">
            <Label>نماذج اللجنة (من بنك الأسئلة — لا ترتيب) *</Label>
            <div className="flex items-center gap-2">
              <span className="text-xs text-muted-foreground">
                المحدد: {selectedModelIds.length} من {branchModels.length}
              </span>
              <Button
                type="button"
                variant="outline"
                size="sm"
                onClick={() => setSelectedModelIds(branchModels.map((m) => m.id))}
                disabled={branchModels.length === 0}
              >
                تحديد الكل
              </Button>
              <Button
                type="button"
                variant="ghost"
                size="sm"
                onClick={() => setSelectedModelIds([])}
                disabled={selectedModelIds.length === 0}
              >
                مسح
              </Button>
            </div>
          </div>
          {branchModels.length === 0 ? (
            <p className="rounded-md bg-muted/50 px-3 py-3 text-sm text-muted-foreground">
              لا توجد نماذج لفرع {getBranchLabel(branch)} في بنك الأسئلة — أنشئها من صفحة إدارة النماذج أولاً.
            </p>
          ) : (
            <div className="grid max-h-56 grid-cols-6 gap-1.5 overflow-y-auto rounded-md border p-2 sm:grid-cols-8 md:grid-cols-10 lg:grid-cols-12">
              {branchModels.map((m) => {
                const active = selectedModelIds.includes(m.id);
                return (
                  <button
                    key={m.id}
                    type="button"
                    onClick={() => toggleModel(m.id)}
                    className={cn(
                      "rounded-md border px-2 py-1.5 text-center text-xs font-medium transition-colors",
                      active
                        ? "border-primary bg-primary text-primary-foreground"
                        : "text-muted-foreground hover:border-primary/50 hover:bg-muted/50"
                    )}
                    title={`نموذج ${m.modelNumber}`}
                  >
                    {m.modelNumber}
                  </button>
                );
              })}
            </div>
          )}
        </div>
      </div>
    );
  }

  async function handleDelete(id: string) {
    if (loading) return;
    setError("");
    setSuccess("");
    setLoading(true);
    try {
      const result = await deleteCommittee(id);
      if (result.success) {
        setConfirmDeleteId(null);
        setSuccess("تم حذف اللجنة");
        router.refresh();
      } else {
        setError(result.error);
      }
    } catch (e) {
      setError(e instanceof Error ? e.message : "حدث خطأ غير متوقع");
    } finally {
      setLoading(false);
    }
  }

  async function handleAssignStudent() {
    if (loading) return;
    if (!assignStudentId || !assignCommitteeId) {
      setError("اختر الطالب واللجنة");
      return;
    }
    if (!assignExamDate || !assignPeriod) {
      setError("حدد تاريخ الاختبار والفترة");
      return;
    }
    setError("");
    setSuccess("");
    setLoading(true);
    try {
      const result = await assignStudentToCommittee({
        studentId: assignStudentId,
        committeeId: assignCommitteeId,
        examDate: assignExamDate,
        period: assignPeriod,
      });
      if (result.success) {
        setSuccess("تم توزيع الطالب على اللجنة");
        setAssignStudentId("");
        setAssignCommitteeId("");
        setAssignExamDate("");
        setAssignPeriod("");
        router.refresh();
      } else {
        setError(result.error);
      }
    } catch (e) {
      setError(e instanceof Error ? e.message : "حدث خطأ غير متوقع");
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="space-y-6">
      {/* نموذج إنشاء لجنة */}
      {!editingId && (
        <Card>
          <CardHeader>
            <CardTitle className="text-base">إنشاء لجنة جديدة</CardTitle>
            <CardDescription>
              حدد الاسم والمختبرين والفرع ثم اختر نماذج اللجنة يدوياً من بنك الأسئلة (بلا ترتيب)
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            {renderFormFields()}

            {error && <p className="rounded-md bg-destructive/10 px-3 py-2 text-sm text-destructive">{error}</p>}
            {success && <p className="rounded-md bg-emerald-500/10 px-3 py-2 text-sm text-emerald-600">{success}</p>}

            <div className="flex items-center gap-2">
              <Button onClick={handleCreate} disabled={loading || !name || !seasonId || !teacher1Id || !teacher2Id || selectedModelIds.length === 0}>
                {loading ? "جارٍ الحفظ..." : "إنشاء اللجنة"}
              </Button>
            </div>
          </CardContent>
        </Card>
      )}

      {/* جدول اللجان */}
      <Card>
        <CardHeader>
          <CardTitle className="text-base">اللجان القائمة ({committees.length})</CardTitle>
        </CardHeader>
        <CardContent>
          {committees.length === 0 ? (
            <p className="py-6 text-center text-sm text-muted-foreground">لا توجد لجان بعد</p>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full border-collapse text-sm">
                <thead>
                  <tr className="border-b">
                    <th className="p-2 text-right font-medium">الاسم</th>
                    <th className="p-2 text-right font-medium">الفرع</th>
                    <th className="p-2 text-right font-medium">المختبر 1</th>
                    <th className="p-2 text-right font-medium">المختبر 2</th>
                    <th className="p-2 text-right font-medium">الطلاب</th>
                    <th className="p-2 text-right font-medium">النماذج المختارة</th>
                    <th className="p-2 text-center font-medium">إجراءات</th>
                  </tr>
                </thead>
                <tbody>
                  {committees.map((c) => (
                    <Fragment key={c.id}>
                      <tr className="border-b">
                        <td className="p-2 font-medium">{c.name}</td>
                        <td className="p-2">{getBranchLabel(c.branch)}</td>
                        <td className="p-2">{c.teacher1.name}</td>
                        <td className="p-2">{c.teacher2.name}</td>
                        <td className="p-2">{c._count.students}</td>
                        <td className="p-2">
                          {c.selectedModels.length === 0 ? (
                            <span className="text-xs text-muted-foreground">بدون نماذج</span>
                          ) : (
                            <span className="text-xs">
                              {c.selectedModels.map((s) => s.model.modelNumber).join("، ")}
                            </span>
                          )}
                        </td>
                        <td className="p-2 text-center">
                          {confirmDeleteId === c.id ? (
                            <div className="flex items-center justify-center gap-1">
                              <Button variant="destructive" size="sm" disabled={loading} onClick={() => handleDelete(c.id)}>تأكيد</Button>
                              <Button variant="ghost" size="sm" onClick={() => setConfirmDeleteId(null)}>إلغاء</Button>
                            </div>
                          ) : (
                            <div className="flex items-center justify-center gap-1">
                              <Button variant="outline" size="sm" onClick={() => startEdit(c)}>تعديل</Button>
                              <Button variant="ghost" size="sm" onClick={() => setConfirmDeleteId(c.id)}>حذف</Button>
                            </div>
                          )}
                        </td>
                      </tr>
                      {editingId === c.id && (
                        <tr className="border-b bg-muted/40">
                          <td colSpan={7} className="p-3">
                            <Card>
                              <CardHeader>
                                <CardTitle className="text-base">تعديل: {c.name}</CardTitle>
                                <CardDescription>
                                  حدد الاسم والمختبرين والفرع ثم اختر نماذج اللجنة يدوياً من بنك الأسئلة (بلا ترتيب)
                                </CardDescription>
                              </CardHeader>
                              <CardContent className="space-y-4">
                                {renderFormFields()}

                                {error && <p className="rounded-md bg-destructive/10 px-3 py-2 text-sm text-destructive">{error}</p>}
                                {success && <p className="rounded-md bg-emerald-500/10 px-3 py-2 text-sm text-emerald-600">{success}</p>}

                                <div className="flex items-center gap-2">
                                  <Button onClick={handleCreate} disabled={loading || !name || !seasonId || !teacher1Id || !teacher2Id || selectedModelIds.length === 0}>
                                    {loading ? "جارٍ الحفظ..." : "حفظ التعديلات"}
                                  </Button>
                                  <Button variant="ghost" onClick={resetForm} disabled={loading}>
                                    إلغاء
                                  </Button>
                                </div>
                              </CardContent>
                            </Card>
                          </td>
                        </tr>
                      )}
                    </Fragment>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </CardContent>
      </Card>

      {/* توزيع طالب على لجنة */}
      {approvedStudents.length > 0 && committees.length > 0 && (
        <Card>
          <CardHeader>
            <CardTitle className="text-base">توزيع طالب على لجنة</CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="grid gap-4 sm:grid-cols-3">
              <div className="space-y-2">
                <Label>الطالب *</Label>
                <Select value={assignStudentId} onValueChange={setAssignStudentId}>
                  <SelectTrigger><SelectValue placeholder="اختر الطالب" /></SelectTrigger>
                  <SelectContent>
                    {approvedStudents.map((s) => (
                      <SelectItem key={s.id} value={s.id}>{s.name} — {getBranchLabel(s.branch)}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-2">
                <Label>اللجنة *</Label>
                <Select value={assignCommitteeId} onValueChange={setAssignCommitteeId}>
                  <SelectTrigger><SelectValue placeholder="اختر اللجنة" /></SelectTrigger>
                  <SelectContent>
                    {committees.map((c) => (
                      <SelectItem key={c.id} value={c.id}>{c.name}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-2">
                <Label>تاريخ الاختبار *</Label>
                <Input
                  type="date"
                  value={assignExamDate}
                  onChange={(e) => setAssignExamDate(e.target.value)}
                />
              </div>
              <div className="space-y-2">
                <Label>الفترة *</Label>
                <Select value={assignPeriod} onValueChange={setAssignPeriod}>
                  <SelectTrigger><SelectValue placeholder="اختر الفترة" /></SelectTrigger>
                  <SelectContent>
                    {PERIODS.map((p) => (
                      <SelectItem key={p} value={p}>{p}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div className="flex items-end">
                <Button onClick={handleAssignStudent} disabled={loading || !assignStudentId || !assignCommitteeId || !assignExamDate || !assignPeriod} className="w-full">
                  توزيع الطالب
                </Button>
              </div>
            </div>
          </CardContent>
        </Card>
      )}
    </div>
  );
}