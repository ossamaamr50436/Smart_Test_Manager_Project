import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { getCurrentUser } from "@/lib/actions/auth-actions";
import { prisma } from "@/lib/prisma";
import { Role, AssessmentStatus } from "@prisma/client";
import { getTenantFilter } from "@/lib/tenancy";
import { ExaminerDashboardClient } from "@/components/examiner/examiner-dashboard-client";

export const metadata: Metadata = { title: "لوحة المختبر" };

export default async function ExaminerDashboardPage() {
  const user = await getCurrentUser();

  if (!user || user.role !== Role.EXAMINER) {
    redirect("/");
  }

  // البحث عن اللجنة التي ينتمي إليها المختبر (معلم1 أو معلم2)
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
      students: {
        select: { id: true, name: true, branch: true, status: true },
        orderBy: { name: "asc" },
      },
    },
  });

  // تقييمات هذا المختبر داخل لجنته — لفصل «بانتظار الاختبار» عن «الطلاب المختبرون»
  const myAssessments = await prisma.assessment.findMany({
    where: {
      ...getTenantFilter(user),
      evaluatorId: user.id,
      examSession: committee
        ? { student: { committeeId: committee.id } }
        : undefined,
    },
    select: {
      examSession: { select: { studentId: true } },
      status: true,
      finalScore: true,
      updatedAt: true,
      model: { select: { modelNumber: true } },
    },
  });

  const assessmentByStudent = new Map<
    string,
    {
      status: AssessmentStatus;
      finalScore: number | null;
      updatedAt: Date;
      modelNumber: number | null;
    }
  >();
  for (const a of myAssessments) {
    assessmentByStudent.set(a.examSession.studentId, {
      status: a.status,
      finalScore: a.finalScore,
      updatedAt: a.updatedAt,
      modelNumber: a.model?.modelNumber ?? null,
    });
  }

  const pendingStudents: {
    id: string;
    name: string;
    branch: string;
    status: string;
  }[] = [];
  const testedStudents: {
    id: string;
    name: string;
    branch: string;
    assessmentStatus: AssessmentStatus;
    finalScore: number | null;
    updatedAt: Date;
    modelNumber: number | null;
  }[] = [];

  for (const student of committee?.students ?? []) {
    const mine = assessmentByStudent.get(student.id);
    if (!mine) {
      pendingStudents.push({
        id: student.id,
        name: student.name,
        branch: student.branch,
        status: student.status,
      });
    } else {
      testedStudents.push({
        id: student.id,
        name: student.name,
        branch: student.branch,
        assessmentStatus: mine.status,
        finalScore: mine.finalScore,
        updatedAt: mine.updatedAt,
        modelNumber: mine.modelNumber,
      });
    }
  }

  return (
    <div className="space-y-6 animate-fade-in">
      <div>
        <h1 className="text-2xl font-bold">لوحة المختبر</h1>
        <p className="mt-1 text-muted-foreground">
          طلابك الموزعون على لجنتك — اضغط «ابدأ الاختبار» لبدء التقييم التفاعلي
        </p>
      </div>

      <ExaminerDashboardClient
        students={pendingStudents}
        testedStudents={testedStudents}
        committee={committee
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