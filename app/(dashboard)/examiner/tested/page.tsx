import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { getCurrentUser } from "@/lib/actions/auth-actions";
import { prisma } from "@/lib/prisma";
import { Role } from "@prisma/client";
import { getTenantFilter } from "@/lib/tenancy";
import { ExaminerDashboardClient } from "@/components/examiner/examiner-dashboard-client";

export const metadata: Metadata = { title: "الطلاب المختبرون" };

export default async function ExaminerTestedPage() {
  const user = await getCurrentUser();

  if (!user || user.role !== Role.EXAMINER) {
    redirect("/");
  }

  const committee = await prisma.committee.findFirst({
    where: {
      ...getTenantFilter(user),
      OR: [{ teacher1Id: user.id }, { teacher2Id: user.id }],
    },
    include: {
      selectedModels: {
        select: { model: { select: { modelNumber: true } } },
        orderBy: { createdAt: "asc" },
      },
    },
  });

  // تقييمات المختبر داخل لجنته فقط — للعرض وللاستكمال
  const myAssessments = await prisma.assessment.findMany({
    where: {
      ...getTenantFilter(user),
      evaluatorId: user.id,
      examSession: committee
        ? { student: { committeeId: committee.id } }
        : undefined,
    },
    select: {
      examSession: {
        select: {
          studentId: true,
          student: { select: { name: true, branch: true } },
        },
      },
      status: true,
      finalScore: true,
      updatedAt: true,
      model: { select: { modelNumber: true } },
    },
    orderBy: { updatedAt: "desc" },
  });

  const testedStudents = myAssessments.map((a) => ({
    id: a.examSession.studentId,
    name: a.examSession.student.name,
    branch: a.examSession.student.branch,
    assessmentStatus: a.status,
    finalScore: a.finalScore,
    updatedAt: a.updatedAt,
    modelNumber: a.model?.modelNumber ?? null,
  }));

  return (
    <div className="space-y-6 animate-fade-in">
      <div>
        <h1 className="text-2xl font-bold">الطلاب المختبرون</h1>
        <p className="mt-1 text-muted-foreground">
          الطلاب الذين قيّمهم المختبر — التقييم المعتمد لا يمكن تعديله، والجارٍ يُستكمل
        </p>
      </div>

      <ExaminerDashboardClient
        tested={testedStudents}
        committee={
          committee
            ? {
                name: committee.name,
                modelNumbers: committee.selectedModels.map((s) => s.model.modelNumber),
              }
            : null
        }
      />
    </div>
  );
}