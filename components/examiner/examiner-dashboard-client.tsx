"use client";

import { useState } from "react";
import Link from "next/link";
import {
  Card,
  CardContent,
  CardHeader,
  CardTitle,
  CardDescription,
} from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
} from "@/components/ui/dialog";

type StudentRow = {
  id: string;
  name: string;
  branch: string;
  status: string;
};

type CommitteeInfo = {
  name: string;
  allocations: { startModelNumber: number; endModelNumber: number }[];
};

type Props = {
  students: StudentRow[];
  committee: CommitteeInfo | null;
};

export function ExaminerDashboardClient({ students, committee }: Props) {
  const [showModelModal, setShowModelModal] = useState(false);
  const [selectedStudentId, setSelectedStudentId] = useState<string | null>(null);
  const [modelNumber, setModelNumber] = useState("");
  const [modelError, setModelError] = useState("");

  function openModal(studentId: string) {
    setSelectedStudentId(studentId);
    setModelNumber("");
    setModelError("");
    setShowModelModal(true);
  }

  function handleStartTest() {
    if (!selectedStudentId) return;

    const num = Number(modelNumber);
    if (!num || !Number.isInteger(num)) {
      setModelError("أدخل رقم نموذج صحيح (عدد صحيح)");
      return;
    }

    // التحقق من النطاق
    if (committee && committee.allocations.length > 0) {
      const alloc = committee.allocations[0]!;
      if (num < alloc.startModelNumber || num > alloc.endModelNumber) {
        setModelError(
          `رقم النموذج خارج نطاق اللجنة — يجب أن يكون بين ${alloc.startModelNumber} و ${alloc.endModelNumber}`
        );
        return;
      }
    }

    setModelError("");
    window.location.href = `/examiner/assess/${selectedStudentId}?model=${num}`;
  }

  return (
    <div className="space-y-6">
      {/* معلومات اللجنة */}
      {committee && (
        <Card className="border-primary/20 bg-primary/5">
          <CardContent className="pt-4">
            <div className="flex flex-wrap items-center gap-4 text-sm">
              <div>
                <p className="text-muted-foreground">لجنة الاختبار</p>
                <p className="font-bold">{committee.name}</p>
              </div>
              {committee.allocations.map((a, i) => (
                <div key={i}>
                  <p className="text-muted-foreground">نطاق النماذج</p>
                  <p className="font-bold">
                    {a.startModelNumber} — {a.endModelNumber}
                  </p>
                </div>
              ))}
            </div>
          </CardContent>
        </Card>
      )}

      {/* قائمة الطلاب */}
      <Card>
        <CardHeader>
          <CardTitle className="text-base">طلاب لجانك</CardTitle>
          <CardDescription>
            اضغط «ابدأ الاختبار» بجانب الطالب لبدء التقييم التفاعلي
          </CardDescription>
        </CardHeader>
        <CardContent>
          {students.length === 0 ? (
            <p className="py-8 text-center text-sm text-muted-foreground">
              لم يتم توزيع أي طالب على لجانك بعد
            </p>
          ) : (
            <div className="space-y-2">
              {students.map((s) => (
                <div
                  key={s.id}
                  className="flex items-center justify-between rounded-lg border px-4 py-3"
                >
                  <div>
                    <p className="font-medium">{s.name}</p>
                    <p className="text-xs text-muted-foreground">
                      {s.branch} أجزاء — الحالة: {s.status}
                    </p>
                  </div>
                  <Button size="sm" onClick={() => openModal(s.id)}>
                    ابدأ الاختبار
                  </Button>
                </div>
              ))}
            </div>
          )}
        </CardContent>
      </Card>

      {/* مودال تحديد رقم النموذج */}
      <Dialog open={showModelModal} onOpenChange={setShowModelModal}>
        <DialogContent className="max-w-sm text-right" dir="rtl">
          <DialogHeader>
            <DialogTitle>ابدأ الاختبار</DialogTitle>
            <DialogDescription>
              أدخل رقم النموذج الذي اختاره الطالب لبدء التقييم التفاعلي
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-4 pt-2">
            <div className="space-y-2">
              <Label htmlFor="modelNumber">رقم النموذج الذي اختاره الطالب *</Label>
              <Input
                id="modelNumber"
                type="number"
                min={committee?.allocations[0]?.startModelNumber ?? 1}
                max={committee?.allocations[0]?.endModelNumber ?? 100}
                placeholder={
                  committee?.allocations[0]
                    ? `مثال: ${committee.allocations[0].startModelNumber}`
                    : "أدخل الرقم"
                }
                value={modelNumber}
                onChange={(e) => {
                  setModelNumber(e.target.value);
                  setModelError("");
                }}
              />
              {committee && committee.allocations[0] && (
                <p className="text-xs text-muted-foreground">
                  النطاق المسموح: {committee.allocations[0].startModelNumber} —{" "}
                  {committee.allocations[0].endModelNumber}
                </p>
              )}
            </div>

            {modelError && (
              <p className="rounded-md bg-destructive/10 px-3 py-2 text-xs text-destructive">
                {modelError}
              </p>
            )}

            <div className="flex justify-end gap-2">
              <Button variant="outline" onClick={() => setShowModelModal(false)}>
                إلغاء
              </Button>
              <Button
                onClick={handleStartTest}
                disabled={!modelNumber}
              >
                تأكيد والانتقال للتقييم
              </Button>
            </div>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
}
