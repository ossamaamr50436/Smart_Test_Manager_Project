"use client";

import { getBranchLabel } from "@/lib/utils";
import { useState } from "react";
import { useRouter } from "next/navigation";
import { headOfAffairsFinalApprove } from "@/lib/actions/admin-actions";
import { rejectStudentByHead } from "@/lib/actions/head-actions";
import { rejectionReasonError } from "@/lib/validations/rejection-reason";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Label } from "@/components/ui/label";
import { Input } from "@/components/ui/input";

type NotifiedStudent = {
  id: string;
  name: string;
  branch: string;
  institutionName: string;
  finalScore: number | null;
  notifiedAt: Date;
};

export function HeadApprovalTable({ students }: { students: NotifiedStudent[] }) {
  const router = useRouter();
  const [error, setError] = useState("");
  const [processingId, setProcessingId] = useState<string | null>(null);
  const [rejectReason, setRejectReason] = useState("");
  const [rejectingId, setRejectingId] = useState<string | null>(null);
  const [dialogStudent, setDialogStudent] = useState<NotifiedStudent | null>(null);
  const [overrideScore, setOverrideScore] = useState("");
  const [overrideError, setOverrideError] = useState("");

  async function handleApprove(studentId: string, overrideRaw: string) {
    setError("");
    let override: number | null | undefined;
    const trimmed = overrideRaw.trim();
    if (trimmed.length > 0) {
      const num = Number(trimmed);
      if (!Number.isFinite(num) || num < 0 || num > 100) {
        setOverrideError("الدرجة يجب أن تكون بين 0 و 100");
        return;
      }
      override = num;
    }
    setProcessingId(studentId);
    try {
      await headOfAffairsFinalApprove(studentId, override);
      setDialogStudent(null);
      setOverrideScore("");
      setOverrideError("");
      router.refresh();
    } catch (e) {
      setError(e instanceof Error ? e.message : "حدث خطأ غير متوقع");
    } finally {
      setProcessingId(null);
    }
  }

  async function handleReject(studentId: string) {
    setError("");
    const reasonError = rejectionReasonError(rejectReason);
    if (reasonError) {
      setError(reasonError);
      return;
    }
    setRejectingId(studentId);
    try {
      await rejectStudentByHead(studentId, rejectReason);
      setRejectReason("");
      router.refresh();
    } catch (e) {
      setError(e instanceof Error ? e.message : "حدث خطأ غير متوقع");
    } finally {
      setRejectingId(null);
    }
  }

  if (students.length === 0) {
    return (
      <Card>
        <CardContent className="py-10 text-center text-sm text-muted-foreground">
          لا يوجد طلاب بانتظار اعتمادك النهائي حالياً
        </CardContent>
      </Card>
    );
  }

  return (
    <>
      <Card>
        <CardHeader>
          <CardTitle className="text-base">
            الطلاب بانتظار الاعتماد النهائي ({students.length})
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
                  <th className="pb-2 font-medium">الدرجة النهائية</th>
                  <th className="pb-2 font-medium">تاريخ الاعتماد</th>
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
                      {student.finalScore !== null
                        ? `${student.finalScore.toFixed(2)} / 100`
                        : "—"}
                    </td>
                    <td className="py-3">
                      {student.notifiedAt.toLocaleDateString("ar-SA")}
                    </td>
                    <td className="py-3">
                      <div className="flex flex-wrap items-center gap-2">
                        <Button
                          size="sm"
                          disabled={processingId === student.id || rejectingId === student.id}
                          onClick={() => {
                            setDialogStudent(student);
                            setOverrideScore("");
                            setOverrideError("");
                          }}
                        >
                          {processingId === student.id
                            ? "جارٍ الاعتماد..."
                            : "اعتماد نهائي"}
                        </Button>
                        <div className="flex items-center gap-1">
                          <input
                            type="text"
                            value={rejectingId === student.id ? rejectReason : ""}
                            onChange={(e) => setRejectReason(e.target.value)}
                            placeholder="سبب الرفض (إلزامي)"
                            className="h-8 w-40 rounded-md border border-input bg-transparent px-2 text-xs"
                            aria-label="سبب الرفض"
                          />
                          <Button
                            size="sm"
                            variant="destructive"
                            disabled={
                              processingId === student.id ||
                              rejectingId === student.id ||
                              rejectReason.trim().length === 0
                            }
                            onClick={() => handleReject(student.id)}
                          >
                            {rejectingId === student.id ? "جارٍ الرفض..." : "رفض"}
                          </Button>
                        </div>
                      </div>
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

      {/* نافذة الاعتماد النهائي + تعديل الدرجة الاختياري */}
      <Dialog
        open={dialogStudent !== null}
        onOpenChange={(open) => {
          if (!open) setDialogStudent(null);
        }}
      >
        <DialogContent className="text-right" dir="rtl">
          {dialogStudent && (
            <>
              <DialogHeader>
                <DialogTitle className="text-base">
                  الاعتماد النهائي — {dialogStudent.name}
                </DialogTitle>
                <DialogDescription>
                  {dialogStudent.institutionName} — {getBranchLabel(dialogStudent.branch)}
                </DialogDescription>
              </DialogHeader>

              <div className="rounded-lg border bg-card p-3 text-sm">
                <div className="flex items-center justify-between gap-3">
                  <span className="text-muted-foreground">الدرجة النهائية المعتمدة</span>
                  <span className="font-bold text-primary">
                    {dialogStudent.finalScore !== null
                      ? `${dialogStudent.finalScore.toFixed(2)} / 100`
                      : "—"}
                  </span>
                </div>
              </div>

              <div className="space-y-2">
                <Label htmlFor="headOverrideScore">
                  تعديل الدرجة النهائية (اختياري — من 0 إلى 100)
                </Label>
                <Input
                  id="headOverrideScore"
                  type="number"
                  min={0}
                  max={100}
                  step={0.1}
                  placeholder="اتركه فارغاً لإبقاء الدرجة المعتمدة"
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
                  الدرجة السابقة في سجل التدقيق
                </p>
              </div>

              <DialogFooter>
                <Button variant="outline" onClick={() => setDialogStudent(null)}>
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