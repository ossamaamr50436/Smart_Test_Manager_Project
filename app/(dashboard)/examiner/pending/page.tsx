import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { getCurrentUser } from "@/lib/actions/auth-actions";
import { prisma } from "@/lib/prisma";
import { Role } from "@prisma/client";
import { getTenantFilter } from "@/lib/tenancy";
import { ExaminerDashboardClient } from "@/components/examiner/examiner-dashboard-client";

export const metadata: Metadata = { title: "الطلاب بانتظار الاختبار" };

export default async function ExaminerPendingPage() {
  const user = await getCurrentUser();

  if (!user || user.role !== Role.EXAMINER) {
    redirect("/");
  }

  const committee = await prisma.committee.findFirst({
    where: {
      ...getTenantFilter(user),
      OR: [{ teacher1Id: user.id }, { teacher2Id: user.id }],
    },
    select: {
      id: true,
      name: true,
      seasonId: true,
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

  // الطلاب الذين للمختبر تقييم لهم — يُستبعدون من قائمة الانتظار
  const myAssessments = await prisma.assessment.findMany({
    where: {
      ...getTenantFilter(user),
      evaluatorId: user.id,
      examSession: committee
        ? { student: { committeeId: committee.id } }
        : undefined,
    },
    select: { examSession: { select: { studentId: true } } },
  });
  const assessedIds = new Set(myAssessments.map((a) => a.examSession.studentId));

  // M9: النماذج المستخدمة = نماذج حُجزت لطلاب آخرين في نفس اللجنة
  const usedModelNumbers = new Set<number>();
  if (committee) {
    const usedSessions = await prisma.examSession.findMany({
      where: {
        seasonId: committee.seasonId,
        student: { committeeId: committee.id },
        status: { not: "CANCELLED" },
        model: { isNot: null },
      },
      select: {
        studentId: true,
        model: { select: { modelNumber: true } },
      },
    });
    for (const s of usedSessions) {
      if (!assessedIds.has(s.studentId) && s.model?.modelNumber) {
        usedModelNumbers.add(s.model.modelNumber);
      }
    }
  }

  const pendingStudents = (committee?.students ?? [])
    .filter((s) => !assessedIds.has(s.id))
    .map((s) => ({ id: s.id, name: s.name, branch: s.branch, status: s.status }));

  return (
    <div className="space-y-6 animate-fade-in">
      <div>
        <h1 className="text-2xl font-bold">الطلاب بانتظار الاختبار</h1>
        <p className="mt-1 text-muted-foreground">
          اضغط «ابدأ الاختبار» لبدء التقييم التفاعلي للطالب
        </p>
      </div>

      <ExaminerDashboardClient
        pending={pendingStudents}
        usedModelNumbers={[...usedModelNumbers]}
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