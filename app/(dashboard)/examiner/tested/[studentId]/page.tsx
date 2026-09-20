import type { Metadata } from "next";
import { notFound, redirect } from "next/navigation";
import { getCurrentUser } from "@/lib/actions/auth-actions";
import { prisma } from "@/lib/prisma";
import { Role, AssessmentStatus } from "@prisma/client";
import { getTenantFilter } from "@/lib/tenancy";
import { getBranchLabel } from "@/lib/utils";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import Link from "next/link";

export const metadata: Metadata = { title: "تفاصيل التقييم" };

export default async function ExaminerTestedStudentPage({
  params,
}: {
  params: Promise<{ studentId: string }>;
}) {
  const { studentId } = await params;
  const user = await getCurrentUser();

  if (!user || user.role !== Role.EXAMINER) {
    redirect("/examiner");
  }

  const student = await prisma.student.findUnique({
    where: { id: studentId },
    include: {
      committee: {
        select: {
          name: true,
          teacher1Id: true,
          teacher2Id: true,
          seasonId: true,
        },
      },
    },
  });

  if (!student || !student.committee) {
    notFound();
  }

  // عزل الصلاحيات: المختبر معلم في لجنة هذا الطالب فقط
  const isTeacher =
    student.committee.teacher1Id === user.id ||
    student.committee.teacher2Id === user.id;
  if (!isTeacher) {
    notFound();
  }

  const examSession = await prisma.examSession.findFirst({
    where: {
      ...getTenantFilter(user),
      studentId: student.id,
      seasonId: student.committee.seasonId,
    },
    orderBy: { createdAt: "desc" },
    include: {
      teacher1: { select: { id: true, name: true } },
      teacher2: { select: { id: true, name: true } },
      season: { select: { name: true } },
    },
  });

  if (!examSession) {
    notFound();
  }

  // تقييم المختبر الحالي فقط (قراءة فقط — تعتمد وتمنع التعديل)
  const myAssessment = await prisma.assessment.findFirst({
    where: {
      ...getTenantFilter(user),
      examSessionId: examSession.id,
      evaluatorId: user.id,
    },
    include: { model: { select: { modelNumber: true } } },
  });

  if (!myAssessment) {
    notFound();
  }

  const other = await prisma.assessment.findFirst({
    where: {
      ...getTenantFilter(user),
      examSessionId: examSession.id,
      evaluatorId: { not: user.id },
    },
    include: {
      evaluator: { select: { name: true } },
      model: { select: { modelNumber: true } },
    },
  });

  const fmtDate = (d: Date) =>
    new Intl.DateTimeFormat("ar-SA", {
      dateStyle: "long",
    }).format(d);

  const deductionRows = [
    { label: "أخطاء الكلمات", count: myAssessment.wordErrors, unit: 1 },
    { label: "أخطاء الحروف", count: myAssessment.letterErrors, unit: 1 },
    { label: "أخطاء الضبط", count: myAssessment.diacriticErrors, unit: 1 },
    { label: "اللحن الجلي", count: myAssessment.seriousErrors, unit: 2 },
    { label: "اللحن الخفي", count: myAssessment.subtleErrors, unit: 0.5 },
    { label: "عدد مرات التنبيه", count: myAssessment.promptingCount, unit: 1 },
    { label: "عدد مرات الشك", count: myAssessment.doubtCount, unit: 0.5 },
    { label: "أخطاء التجويد", count: myAssessment.tajweedErrors, unit: null },
  ];

  return (
    <div className="mx-auto max-w-3xl space-y-6 animate-fade-in">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold">تفاصيل تقييم الطالب</h1>
          <p className="mt-1 text-muted-foreground">
            عرض قراءة فقط — التقييم المعتمد لا يمكن تعديله
          </p>
        </div>
        <Button variant="outline" asChild>
          <Link href="/examiner">العودة للوحة المختبر</Link>
        </Button>
      </div>

      {/* معلومات الجلسة */}
      <Card>
        <CardHeader>
          <CardTitle className="text-base">معلومات الجلسة</CardTitle>
        </CardHeader>
        <CardContent className="grid gap-3 text-sm sm:grid-cols-2">
          <div>
            <p className="text-muted-foreground">الطالب</p>
            <p className="font-medium">{student.name}</p>
          </div>
          <div>
            <p className="text-muted-foreground">الفرع</p>
            <p className="font-medium">{getBranchLabel(student.branch)}</p>
          </div>
          <div>
            <p className="text-muted-foreground">اللجنة</p>
            <p className="font-medium">{student.committee.name}</p>
          </div>
          <div>
            <p className="text-muted-foreground">الموسم</p>
            <p className="font-medium">{examSession.season.name}</p>
          </div>
          <div>
            <p className="text-muted-foreground">تاريخ الاختبار</p>
            <p className="font-medium">{fmtDate(examSession.examDate)}</p>
          </div>
          <div>
            <p className="text-muted-foreground">الفترة</p>
            <p className="font-medium">
              {examSession.period === "MORNING" ? "صباحي" : "مسائي"}
            </p>
          </div>
          <div>
            <p className="text-muted-foreground">المقيّمون</p>
            <p className="font-medium">
              {examSession.teacher1.name} ← {examSession.teacher2.name} →
            </p>
          </div>
          <div>
            <p className="text-muted-foreground">رقم النموذج</p>
            <p className="font-medium">
              {myAssessment.model?.modelNumber ?? "غير محدد"}
            </p>
          </div>
        </CardContent>
      </Card>

      {/* تقييم المختبر الحالي */}
      <Card>
        <CardHeader>
          <CardTitle className="text-base">تقييمك للطالب</CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="grid gap-3 text-sm sm:grid-cols-3">
            <ScoreTile label="التلاوة وحسن الأداء" value={myAssessment.recitationScore} max={20} />
            <ScoreTile label="التجويد التطبيقي" value={myAssessment.tajweedScore} max={10} />
            <ScoreTile
              label="إجمالي الخصومات"
              value={myAssessment.totalDeduction}
              max={100}
            />
          </div>

          <div className="rounded-lg border bg-muted/30 p-4">
            <div className="mb-2 flex items-center justify-between">
              <p className="text-sm font-semibold">تفاصيل الخصومات</p>
              <p className="text-xs text-muted-foreground">
                خصم الحفظ: {myAssessment.memorizationDeduction.toFixed(1)}
              </p>
            </div>
            <div className="grid gap-1.5 text-sm sm:grid-cols-2">
              {deductionRows.map((r) => (
                <div
                  key={r.label}
                  className="flex items-center justify-between rounded-md border bg-background px-3 py-1.5"
                >
                  <span>{r.label}</span>
                  <span className="font-medium">
                    {r.count}
                    {r.unit !== null && (
                      <span className="text-muted-foreground"> × {r.unit}</span>
                    )}
                  </span>
                </div>
              ))}
            </div>
          </div>

          <div className="flex items-center justify-between rounded-lg border border-primary/30 bg-primary/5 px-4 py-3">
            <p className="font-semibold">الدرجة النهائية</p>
            <p className="text-2xl font-bold text-primary">
              {myAssessment.finalScore.toFixed(1)} / 100
            </p>
          </div>
        </CardContent>
      </Card>

      {/* تقييم المختبر الآخر */}
      {other && (
        <Card>
          <CardHeader>
            <CardTitle className="text-base">
              تقييم المختبر الآخر: {other.evaluator.name}
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-3 text-sm">
            <div className="grid gap-3 sm:grid-cols-3">
              <ScoreTile label="التلاوة وحسن الأداء" value={other.recitationScore} max={20} />
              <ScoreTile label="التجويد التطبيقي" value={other.tajweedScore} max={10} />
              <ScoreTile label="إجمالي الخصومات" value={other.totalDeduction} max={100} />
            </div>
            <div className="flex items-center justify-between rounded-lg border bg-muted/30 px-4 py-3">
              <p className="font-semibold">الدرجة النهائية</p>
              <p className="text-xl font-bold">{other.finalScore.toFixed(1)} / 100</p>
            </div>
          </CardContent>
        </Card>
      )}

      <p className="text-center text-xs text-muted-foreground">
        الحالة: {myAssessment.status === AssessmentStatus.APPROVED ? "معتمد" : "جارٍ التقييم"} —
        عرض التقييمات من اختصاص اللجنة
      </p>
    </div>
  );
}

function ScoreTile({ label, value, max }: { label: string; value: number; max: number }) {
  return (
    <div className="rounded-lg border px-4 py-3 text-center">
      <p className="text-xs text-muted-foreground">{label}</p>
      <p className="mt-1 text-lg font-bold">
        {value.toFixed(1)} <span className="text-xs font-normal text-muted-foreground">/ {max}</span>
      </p>
    </div>
  );
}