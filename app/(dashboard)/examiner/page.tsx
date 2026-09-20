import type { Metadata } from "next";
import Link from "next/link";
import { redirect } from "next/navigation";
import { getCurrentUser } from "@/lib/actions/auth-actions";
import { prisma } from "@/lib/prisma";
import { Role } from "@prisma/client";
import { getTenantFilter } from "@/lib/tenancy";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { ClipboardList, UserCheck, Users } from "lucide-react";

export const metadata: Metadata = { title: "لوحة المختبر" };

export default async function ExaminerDirectoryPage() {
  const user = await getCurrentUser();

  if (!user || user.role !== Role.EXAMINER) {
    redirect("/");
  }

  // اللجنة الخاصة بالمختبر + تقييماته للفصل بين القائمتين
  const [committee, myAssessments] = await Promise.all([
    prisma.committee.findFirst({
      where: {
        ...getTenantFilter(user),
        OR: [{ teacher1Id: user.id }, { teacher2Id: user.id }],
      },
      include: {
        selectedModels: {
          select: { model: { select: { modelNumber: true } } },
          orderBy: { createdAt: "asc" },
        },
        students: { select: { id: true, status: true } },
      },
    }),
    prisma.assessment.findMany({
      where: {
        ...getTenantFilter(user),
        evaluatorId: user.id,
        examSession: { student: { committeeId: { not: undefined } } },
      },
      select: { examSession: { select: { studentId: true } } },
    }),
  ]);

  const assessedStudentIds = new Set(
    myAssessments.map((a) => a.examSession.studentId)
  );
  const committeeStudents = committee?.students ?? [];
  const pendingCount = committeeStudents.filter(
    (s) => !assessedStudentIds.has(s.id)
  ).length;
  const testedCount = committeeStudents.length - pendingCount;
  const modelNumbers = committee?.selectedModels.map((s) => s.model.modelNumber) ?? [];

  return (
    <div className="space-y-6 animate-fade-in">
      <div>
        <h1 className="text-2xl font-bold">لوحة المختبر</h1>
        <p className="mt-1 text-muted-foreground">
          نظرة عامة على طلابك — تنقّل بين الطلاب بانتظار الاختبار والطلاب المختبرين
        </p>
      </div>

      {committee && (
        <Card className="border-primary/20 bg-primary/5">
          <CardHeader>
            <CardTitle className="text-base">{committee.name}</CardTitle>
          </CardHeader>
          <CardContent className="text-sm">
            {modelNumbers.length > 0 && (
              <p className="text-muted-foreground">
                النماذج المختارة:{" "}
                <span className="font-medium text-foreground">
                  {modelNumbers.join("، ")}
                </span>
              </p>
            )}
            <p className="text-muted-foreground">
              إجمالي طلاب اللجنة:{" "}
              <span className="font-medium text-foreground">{committeeStudents.length}</span>
            </p>
          </CardContent>
        </Card>
      )}

      <div className="grid gap-4 sm:grid-cols-2">
        <Card className="transition-shadow hover:shadow-lg">
          <CardContent className="flex items-center justify-between pt-6">
            <div>
              <CardTitle className="flex items-center gap-2 text-base">
                <Users className="h-4 w-4" />
                الطلاب بانتظار الاختبار
              </CardTitle>
              <p className="mt-2 text-3xl font-bold text-primary">{pendingCount}</p>
              <Link
                href="/examiner/pending"
                className="mt-4 inline-block text-sm font-medium underline-offset-4 hover:underline"
              >
                ابدأ بتقييم الطلاب ←
              </Link>
            </div>
          </CardContent>
        </Card>

        <Card className="transition-shadow hover:shadow-lg">
          <CardContent className="flex items-center justify-between pt-6">
            <div>
              <CardTitle className="flex items-center gap-2 text-base">
                <UserCheck className="h-4 w-4" />
                الطلاب المختبرون
              </CardTitle>
              <p className="mt-2 text-3xl font-bold">{testedCount}</p>
              <Link
                href="/examiner/tested"
                className="mt-4 inline-block text-sm font-medium underline-offset-4 hover:underline"
              >
                مراجعة الطلاب المختبرين ←
              </Link>
            </div>
          </CardContent>
        </Card>
      </div>

      <Card>
        <CardContent className="flex items-center justify-between pt-6">
          <div>
            <CardTitle className="flex items-center gap-2 text-base">
              <ClipboardList className="h-4 w-4" />
              تقاريري
            </CardTitle>
            <p className="mt-1 text-sm text-muted-foreground">
              استعرض إحصاءات أدائك ونتائج الطلاب
            </p>
          </div>
          <Link
            href="/examiner/reports"
            className="text-sm font-medium underline-offset-4 hover:underline"
          >
            فتح التقارير ←
          </Link>
        </CardContent>
      </Card>
    </div>
  );
}