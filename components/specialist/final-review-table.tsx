"use client";

import { getBranchLabel } from "@/lib/utils";
import { useState } from "react";
import { useRouter } from "next/navigation";
import { specialistFinalApprove } from "@/lib/actions/admin-actions";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Card,
  CardContent,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogFooter,
} from "@/components/ui/dialog";

type ExaminerScore = {
  examinerId: string;
  examinerName: string;
  finalScore: number | null;
  recitationScore: number;
  tajweedScore: number;
  memorizationDeduction: number;
  totalDeduction: number;
  status: string;
  updatedAt: Date;
};

type FinalStudent = {
  id: string;
  name: string;
  branch: string;
  institutionName: string;
  examDate: Date | null;
  period: string | null;
  modelNumber: number | null | undefined;
  examiners: ExaminerScore[];
  completedAt: Date;
};

export function FinalReviewTable({ students }: { students: FinalStudent[] }) {
  const router = useRouter();
  const [error, setError] = useState("");
  const [processingId, setProcessingId] = useState<string | null>(null);
  const [dialogStudent, setDialogStudent] = useState<FinalStudent | null>(null);
  const [overrideScore, setOverrideScore] = useState("");
  const [overrideError, setOverrideError] = useState("");

  function openDialog(student: FinalStudent) {
    setDialogStudent(student);
    setOverrideScore("");
    setOverrideError("");
    setError("");
  }

  async function handleApprove(studentId: string, overrideRaw: string) {
    setError("");
    setOverrideError("");
    setProcessingId(studentId);

    // الدرجة المعدّلة اختيارية — تُمرَّر فقط عند إدخال قيمة صحيحة
    let override: number | null | undefined;
    const trimmed = overrideRaw.trim();
    if (trimmed !== "") {
      const num = Number(trimmed);
      if (!Number.isFinite(num) || num < 0 || num > 100) {
        setOverrideError("الدرجة المعدّلة يجب أن تكون بين 0 و 100");
        setProcessingId(null);
        return;
      }
      override = num;
    }

    try {
      await specialistFinalApprove(studentId, override);
      setDialogStudent(null);
      router.refresh();
    } catch (e) {
      setError(e instanceof Error ? e.message : "حدث خطأ غير متوقع");
    } finally {
      setProcessingId(null);
    }
  }

  if (students.length === 0) {
    return (
      <Card>
        <CardContent className="py-10 text-center text-sm text-muted-foreground">
          لا يوجد طلاب بتقييمات معتمدة بانتظار المراجعة حالياً
        </CardContent>
      </Card>
    );
  }

  return (
    <>
      <Card>
        <CardHeader>
          <CardTitle className="text-base">
            الطلاب المقيَّمون ({students.length})
          </CardTitle>
        </CardHeader>
        <CardContent>
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b text-right text-muted-foreground">
                  <th className="pb-2 font-medium">اسم الطالب</th>
                  <th className="pb-2 font-medium">الجهة</th>
                  <th className="pb-2 font-medium">الفرع</th>
                  <th className="pb-2 font-medium">تقييمات المختبرين (منفصلة)</th>
                  <th className="pb-2 font-medium">تاريخ الاختبار</th>
                  <th className="pb-2 font-medium">إجراءات</th>
                </tr>
              </thead>
              <tbody>
                {students.map((student) => (
                  <tr key={student.id} className="border-b last:border-0">
                    <td className="py-3 font-medium">{student.name}</td>
                    <td className="py-3">{student.institutionName}</td>
                    <td className="py-3">{getBranchLabel(student.branch)}</td>
                    <td className="py-3">
                      <ul className="space-y-1">
                        {student.examiners.length === 0 ? (
                          <li className="text-muted-foreground">—</li>
                        ) : (
                          student.examiners.map((ex, i) => (
                            <li key={i} className="flex items-center gap-2">
                              <span className="text-muted-foreground">
                                {ex.examinerName}:
                              </span>
                              <span className="font-semibold">
                                {ex.finalScore !== null
                                  ? `${ex.finalScore.toFixed(1)} / 100`
                                  : "—"}
                              </span>
                            </li>
                          ))
                        )}
                      </ul>
                    </td>
                    <td className="py-3">
                      {student.examDate
                        ? student.examDate.toLocaleDateString("ar-SA")
                        : "—"}
                    </td>
                    <td className="py-3">
                      <Button
                        size="sm"
                        variant="outline"
                        onClick={() => openDialog(student)}
                      >
                        مراجعة واعتماد
                      </Button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          {error && (
            <p className="mt-4 rounded-md bg-destructive/10 px-3 py-2 text-sm text-destructive">
              {error}
            </p>
          )}
        </CardContent>
      </Card>

      {/* نافذة مراجعة التقييمات الكاملة + الاعتماد */}
      <Dialog
        open={dialogStudent !== null}
        onOpenChange={(open) => {
          if (!open) setDialogStudent(null);
        }}
      >
        <DialogContent className="max-w-2xl text-right" dir="rtl">
          {dialogStudent && (
            <>
              <DialogHeader>
                <DialogTitle className="text-lg">{dialogStudent.name}</DialogTitle>
                <DialogDescription>
                  {dialogStudent.institutionName} — {getBranchLabel(dialogStudent.branch)}
                  {dialogStudent.examDate
                    ? ` — تاريخ الاختبار: ${dialogStudent.examDate.toLocaleDateString("ar-SA")}`
                    : ""}
                  {dialogStudent.period
                    ? ` — الفترة: ${dialogStudent.period === "MORNING" ? "صباحي" : "مسائي"}`
                    : ""}
                  {dialogStudent.modelNumber
                    ? ` — النموذج: ${dialogStudent.modelNumber}`
                    : ""}
                </DialogDescription>
              </DialogHeader>

              <div className="max-h-72 space-y-3 overflow-y-auto rounded-md border p-3">
                {dialogStudent.examiners.length === 0 ? (
                  <p className="py-4 text-center text-sm text-muted-foreground">
                    لا توجد تقييمات لاستعراضها
                  </p>
                ) : (
                  dialogStudent.examiners.map((ex, i) => (
                    <div
                      key={i}
                      className="rounded-lg border bg-muted/20 px-4 py-3 text-sm"
                    >
                      <div className="mb-2 flex items-center justify-between">
                        <p className="font-semibold">{ex.examinerName}</p>
                        <span
                          className={`rounded-full px-2 py-0.5 text-xs ${
                            ex.status === "APPROVED"
                              ? "bg-primary/10 text-primary"
                              : "bg-muted text-muted-foreground"
                          }`}
                        >
                          {ex.status === "APPROVED" ? "معتمد" : ex.status}
                        </span>
                      </div>
                      <div className="grid grid-cols-2 gap-2 text-xs text-muted-foreground sm:grid-cols-4">
                        <div>
                          <p>تلاوة (20)</p>
                          <p className="font-medium text-foreground">
                            {ex.recitationScore.toFixed(1)}
                          </p>
                        </div>
                        <div>
                          <p>تجويد (10)</p>
                          <p className="font-medium text-foreground">
                            {ex.tajweedScore.toFixed(1)}
                          </p>
                        </div>
                        <div>
                          <p>خصم الحفظ</p>
                          <p className="font-medium text-foreground">
                            {ex.memorizationDeduction.toFixed(1)}
                          </p>
                        </div>
                        <div>
                          <p>إجمالي الخصومات</p>
                          <p className="font-medium text-foreground">
                            {ex.totalDeduction.toFixed(1)}
                          </p>
                        </div>
                      </div>
                      <div className="mt-2 flex items-center justify-between rounded-md bg-background px-3 py-2">
                        <span className="text-xs text-muted-foreground">
                          الدرجة النهائية
                        </span>
                        <span className="font-bold text-primary">
                          {ex.finalScore !== null
                            ? `${ex.finalScore.toFixed(1)} / 100`
                            : "—"}
                        </span>
                      </div>
                    </div>
                  ))
                )}
              </div>

              <div className="space-y-2">
                <Label htmlFor="overrideScore">
                  تعديل الدرجة النهائية (اختياري — من 0 إلى 100)
                </Label>
                <Input
                  id="overrideScore"
                  type="number"
                  min={0}
                  max={100}
                  step={0.1}
                  placeholder="اتركه فارغاً لإبقاء درجات المختبرين"
                  value={overrideScore}
                  onChange={(e) => {
                    setOverrideScore(e.target.value);
                    setOverrideError("");
                  }}
                />
                {overrideError && (
                  <p className="text-xs text-destructive">{overrideError}</p>
                )}
                <p className="text-xs text-muted-foreground">
                  عند الإدخال تُعتمد الدرجة المعدّلة كدرجة نهائية للطالب مع حفظ
                  الدرجات السابقة في سجل التدقيق
                </p>
              </div>

              <DialogFooter>
                <Button
                  variant="outline"
                  onClick={() => setDialogStudent(null)}
                >
                  إلغاء
                </Button>
                <Button
                  disabled={processingId !== null}
                  onClick={() => handleApprove(dialogStudent.id, overrideScore)}
                >
                  {processingId === dialogStudent.id
                    ? "جارٍ الاعتماد..."
                    : "اعتماد نهائي"}
                </Button>
              </DialogFooter>
            </>
          )}
        </DialogContent>
      </Dialog>
    </>
  );
}