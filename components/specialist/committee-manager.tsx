"use client";

import { getBranchLabel } from "@/lib/utils";
import { useState } from "react";
import { useRouter } from "next/navigation";
import { createCommittee, deleteCommittee, assignStudentToCommittee } from "@/lib/actions/committee-actions";
import { BRANCHES } from "@/lib/validations/assessment";
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

type ExaminerOption = { id: string; name: string };
type SeasonOption = { id: string; name: string };
type CommitteeRow = {
  id: string;
  name: string;
  branch: string;
  teacher1: { id: string; name: string };
  teacher2: { id: string; name: string };
  season: { id: string; name: string };
  allocations: { id: string; branch: string; startModelNumber: number; endModelNumber: number }[];
  _count: { students: number };
};

export function CommitteeManager({
  examiners,
  seasons,
  committees,
  approvedStudents,
}: {
  examiners: ExaminerOption[];
  seasons: SeasonOption[];
  committees: CommitteeRow[];
  approvedStudents: { id: string; name: string; branch: string }[];
}) {
  const router = useRouter();
  const [error, setError] = useState("");
  const [success, setSuccess] = useState("");
  const [loading, setLoading] = useState(false);
  const [confirmDeleteId, setConfirmDeleteId] = useState<string | null>(null);
  const [assignStudentId, setAssignStudentId] = useState("");
  const [assignCommitteeId, setAssignCommitteeId] = useState("");

  // نموذج الإنشاء
  const [name, setName] = useState("");
  const [branch, setBranch] = useState<string>("5");
  const [teacher1Id, setTeacher1Id] = useState("");
  const [teacher2Id, setTeacher2Id] = useState("");
  const [seasonId, setSeasonId] = useState("");
  const [startModel, setStartModel] = useState("1");
  const [endModel, setEndModel] = useState("10");

  async function handleCreate() {
    setError("");
    setSuccess("");
    setLoading(true);
    try {
      await createCommittee({
        name,
        branch,
        seasonId,
        teacher1Id,
        teacher2Id,
        startModelNumber: Number(startModel),
        endModelNumber: Number(endModel),
      });
      setSuccess("تم إنشاء اللجنة بنجاح");
      setName("");
      setTeacher1Id("");
      setTeacher2Id("");
      setStartModel("1");
      setEndModel("10");
      router.refresh();
    } catch (e) {
      setError(e instanceof Error ? e.message : "حدث خطأ غير متوقع");
    } finally {
      setLoading(false);
    }
  }

  async function handleDelete(id: string) {
    setError("");
    setSuccess("");
    try {
      await deleteCommittee(id);
      setConfirmDeleteId(null);
      setSuccess("تم حذف اللجنة");
      router.refresh();
    } catch (e) {
      setError(e instanceof Error ? e.message : "حدث خطأ غير متوقع");
    }
  }

  async function handleAssignStudent() {
    if (!assignStudentId || !assignCommitteeId) {
      setError("اختر الطالب واللجنة");
      return;
    }
    setError("");
    setSuccess("");
    setLoading(true);
    try {
      await assignStudentToCommittee({ studentId: assignStudentId, committeeId: assignCommitteeId });
      setSuccess("تم توزيع الطالب على اللجنة");
      setAssignStudentId("");
      setAssignCommitteeId("");
      router.refresh();
    } catch (e) {
      setError(e instanceof Error ? e.message : "حدث خطأ غير متوقع");
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="space-y-6">
      {/* نموذج إنشاء لجنة */}
      <Card>
        <CardHeader>
          <CardTitle className="text-base">إنشاء لجنة جديدة</CardTitle>
          <CardDescription>
            حدد الاسم والمعلمين والفرع ونطاق النماذج
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
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
              <Select value={branch} onValueChange={(v) => setBranch(v)}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  {BRANCHES.map((b) => (
                    <SelectItem key={b} value={b}>{getBranchLabel(b)}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-2">
              <Label>المعلم الأول (الأكبر سناً) *</Label>
              <Select value={teacher1Id} onValueChange={setTeacher1Id}>
                <SelectTrigger><SelectValue placeholder="اختر المعلم الأول" /></SelectTrigger>
                <SelectContent>
                  {examiners.map((t) => (
                    <SelectItem key={t.id} value={t.id}>{t.name}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-2">
              <Label>المعلم الثاني (الأصغر سناً) *</Label>
              <Select value={teacher2Id} onValueChange={setTeacher2Id}>
                <SelectTrigger><SelectValue placeholder="اختر المعلم الثاني" /></SelectTrigger>
                <SelectContent>
                  {examiners.map((t) => (
                    <SelectItem key={t.id} value={t.id}>{t.name}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="grid grid-cols-2 gap-2">
              <div className="space-y-2">
                <Label>رقم النموذج (البداية)</Label>
                <Input type="number" min={1} max={100} value={startModel} onChange={(e) => setStartModel(e.target.value)} />
              </div>
              <div className="space-y-2">
                <Label>رقم النموذج (النهاية)</Label>
                <Input type="number" min={1} max={100} value={endModel} onChange={(e) => setEndModel(e.target.value)} />
              </div>
            </div>
          </div>

          {error && <p className="rounded-md bg-destructive/10 px-3 py-2 text-sm text-destructive">{error}</p>}
          {success && <p className="rounded-md bg-emerald-500/10 px-3 py-2 text-sm text-emerald-600">{success}</p>}

          <Button onClick={handleCreate} disabled={loading || !name || !seasonId || !teacher1Id || !teacher2Id}>
            {loading ? "جارٍ الإنشاء..." : "إنشاء اللجنة"}
          </Button>
        </CardContent>
      </Card>

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
                    <th className="p-2 text-right font-medium">المعلم 1</th>
                    <th className="p-2 text-right font-medium">المعلم 2</th>
                    <th className="p-2 text-right font-medium">الطلاب</th>
                    <th className="p-2 text-right font-medium">النطاق</th>
                    <th className="p-2 text-center font-medium">إجراءات</th>
                  </tr>
                </thead>
                <tbody>
                  {committees.map((c) => (
                    <tr key={c.id} className="border-b">
                      <td className="p-2 font-medium">{c.name}</td>
                      <td className="p-2">{getBranchLabel(c.branch)}</td>
                      <td className="p-2">{c.teacher1.name}</td>
                      <td className="p-2">{c.teacher2.name}</td>
                      <td className="p-2">{c._count.students}</td>
                      <td className="p-2">
                        {c.allocations.map((a) => (
                          <span key={a.id} className="text-xs">
                            {a.startModelNumber}–{a.endModelNumber}
                          </span>
                        ))}
                      </td>
                      <td className="p-2 text-center">
                        {confirmDeleteId === c.id ? (
                          <div className="flex items-center justify-center gap-1">
                            <Button variant="destructive" size="sm" onClick={() => handleDelete(c.id)}>تأكيد</Button>
                            <Button variant="ghost" size="sm" onClick={() => setConfirmDeleteId(null)}>إلغاء</Button>
                          </div>
                        ) : (
                          <Button variant="ghost" size="sm" onClick={() => setConfirmDeleteId(c.id)}>حذف</Button>
                        )}
                      </td>
                    </tr>
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
              <div className="flex items-end">
                <Button onClick={handleAssignStudent} disabled={loading || !assignStudentId || !assignCommitteeId} className="w-full">
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
