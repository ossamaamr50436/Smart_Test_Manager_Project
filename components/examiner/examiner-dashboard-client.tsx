"use client";

import { getBranchLabel } from "@/lib/utils";
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

type TestedStudent = {
  id: string;
  name: string;
  branch: string;
  assessmentStatus: string;
  finalScore: number | null;
  updatedAt: Date;
  modelNumber: number | null;
};

type CommitteeInfo = {
  name: string;
  modelNumbers: number[];
};

type Props = {
  pending?: StudentRow[];
  tested?: TestedStudent[];
  usedModelNumbers?: number[];
  committee: CommitteeInfo | null;
};

const STATUS_LABELS: Record<string, string> = {
  PENDING: "بانتظار المراجعة",
  APPROVED: "مقبول",
  REJECTED: "مرفوض",
  ASSIGNED: "موزع على لجنة",
  COMPLETED: "اكتمل تقييمه",
  NOTIFIED: "اعتمده الأخصائي",
  READY_FOR_CERTIFICATE: "جاهز للشهادة",
  CERTIFICATE_ISSUED: "صدرت شهادته",
};

const ASSESSMENT_STATUS_LABELS: Record<string, string> = {
  DRAFT: "جارٍ التقييم",
  APPROVED: "معتمد من قبلك",
};

export function ExaminerDashboardClient({ pending, tested, usedModelNumbers = [], committee }: Props) {
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

    // التحقق من أن رقم النموذج مختار للجنة
    if (committee && committee.modelNumbers.length > 0 && !committee.modelNumbers.includes(num)) {
      setModelError(
        `رقم النموذج ${num} غير مسموح للجنة — النماذج المسموحة: ${committee.modelNumbers.join("، ")}`
      );
      return;
    }

    // M9: منع اختيار نموذج مستخدم مسبقاً في نفس اللجنة
    if (usedModelNumbers.includes(num)) {
      setModelError(
        `رقم النموذج ${num} مستخدم مسبقاً لطالب آخر في اللجنة — اختر نموذجاً متاحاً`
      );
      return;
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
              {committee.modelNumbers.length > 0 && (
                <div>
                  <p className="text-muted-foreground">النماذج المختارة</p>
                  <p className="font-bold">{committee.modelNumbers.join("، ")}</p>
                </div>
              )}
            </div>
          </CardContent>
        </Card>
      )}

      {/* قائمة الطلاب بانتظار الاختبار */}
      {pending !== undefined && (
        <Card>
          <CardHeader>
            <CardTitle className="text-base">الطلاب بانتظار الاختبار</CardTitle>
            <CardDescription>
              الطلاب الذين لم يقم المختبر بتقييمهم بعد — اضغط «ابدأ الاختبار» بجانب الطالب
            </CardDescription>
          </CardHeader>
          <CardContent>
            {pending.length === 0 ? (
              <p className="py-8 text-center text-sm text-muted-foreground">
                لم يتبقَّ طلاب بانتظار اختبارك — اطلع على «الطلاب المختبرون» أدناه
              </p>
            ) : (
              <div className="space-y-2">
                {pending.map((s) => (
                  <div
                    key={s.id}
                    className="flex items-center justify-between gap-3 rounded-lg border px-4 py-3"
                  >
                    <div>
                      <p className="font-medium">{s.name}</p>
                      <p className="text-xs text-muted-foreground">
                        {getBranchLabel(s.branch)} — الحالة: {STATUS_LABELS[s.status] ?? s.status}
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
      )}

      {/* الطلاب المختبرون */}
      {tested !== undefined && (
        <Card>
          <CardHeader>
            <CardTitle className="text-base">الطلاب المختبرون</CardTitle>
            <CardDescription>
              الطلاب الذين قيّمهم المختبر — تقييم معتمد لا يمكن تعديله، والجارٍ يمكن استكماله
            </CardDescription>
          </CardHeader>
          <CardContent>
            {tested.length === 0 ? (
              <p className="py-8 text-center text-sm text-muted-foreground">
                لم يقم المختبر باختبار أي طالب بعد
              </p>
            ) : (
              <div className="space-y-2">
                {tested.map((s) => {
                  const isApproved = s.assessmentStatus === "APPROVED";
                  return (
                    <div
                      key={s.id}
                      className="flex flex-wrap items-center justify-between gap-3 rounded-lg border px-4 py-3"
                    >
                      <div>
                        <p className="font-medium">{s.name}</p>
                        <p className="text-xs text-muted-foreground">
                          {getBranchLabel(s.branch)} —{" "}
                          {ASSESSMENT_STATUS_LABELS[s.assessmentStatus] ?? s.assessmentStatus}
                          {s.finalScore !== null && !isApproved && (
                            <span className="ms-1 font-medium">
                              — الدرجة الحالية: {s.finalScore}
                            </span>
                          )}
                          {s.updatedAt && (
                            <span className="ms-1">
                              — {new Date(s.updatedAt).toLocaleDateString("ar-SA")}
                            </span>
                          )}
                        </p>
                      </div>
                      <div className="flex items-center gap-2">
                        {!isApproved ? (
                          <Button size="sm" variant="outline" asChild>
                            <Link
                              href={
                                s.modelNumber
                                  ? `/examiner/assess/${s.id}?model=${s.modelNumber}`
                                  : "#"
                              }
                            >
                              استكمال التقييم
                            </Link>
                          </Button>
                        ) : (
                          <>
                            <span className="text-sm font-semibold text-primary">
                              {s.finalScore !== null ? `${s.finalScore} / 100` : ""}
                            </span>
                            <Button size="sm" variant="outline" asChild>
                              <Link href={`/examiner/tested/${s.id}`}>عرض التقييم</Link>
                            </Button>
                          </>
                        )}
                      </div>
                    </div>
                  );
                })}
              </div>
            )}
          </CardContent>
        </Card>
      )}

      {/* مودال تحديد رقم النموذج */}
      <Dialog open={showModelModal} onOpenChange={setShowModelModal}>
        <DialogContent className="max-w-sm text-right" dir="rtl">
          <DialogHeader>
            <DialogTitle>ابدأ الاختبار</DialogTitle>
            <DialogDescription>
              اختر رقم النموذج الذي اختاره الطالب من النماذج المتاحة للجنة
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-4 pt-2">
            {committee && committee.modelNumbers.length > 0 ? (
              <div className="space-y-2">
                <Label>اختر رقم النموذج</Label>
                <div className="grid max-h-44 grid-cols-6 gap-1.5 overflow-y-auto rounded-md border p-2">
                  {committee.modelNumbers.map((num) => {
                    const used = usedModelNumbers.includes(num);
                    return (
                      <button
                        key={num}
                        type="button"
                        disabled={used}
                        onClick={() => { setModelNumber(String(num)); setModelError(""); }}
                        title={used ? "مستخدم مسبقاً لطالب آخر في اللجنة" : undefined}
                        className={`rounded-md border px-2 py-1.5 text-center text-xs font-medium transition-colors ${
                          used
                            ? "cursor-not-allowed border-muted bg-muted text-muted-foreground/40 line-through"
                            : modelNumber === String(num)
                              ? "border-primary bg-primary text-primary-foreground"
                              : "text-muted-foreground hover:border-primary/50 hover:bg-muted/50"
                        }`}
                      >
                        {num}
                      </button>
                    );
                  })}
                </div>
                {usedModelNumbers.length > 0 && (
                  <p className="text-xs text-muted-foreground">
                    الأرقام المشطوبة مستخدمة مسبقاً لطلاب آخرين في اللجنة
                  </p>
                )}
              </div>
            ) : (
              <div className="space-y-2">
                <Label htmlFor="modelNumber">رقم النموذج الذي اختاره الطالب *</Label>
                <Input
                  id="modelNumber"
                  type="number"
                  min={1}
                  max={100}
                  placeholder="أدخل الرقم"
                  value={modelNumber}
                  onChange={(e) => { setModelNumber(e.target.value); setModelError(""); }}
                />
                <p className="text-xs text-muted-foreground">
                  لا توجد نماذج محددة للجنة — يمكن إدخال أي رقم صحيحاً
                </p>
              </div>
            )}

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