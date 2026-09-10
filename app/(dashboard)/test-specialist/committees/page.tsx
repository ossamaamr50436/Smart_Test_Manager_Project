import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { getCurrentUser } from "@/lib/actions/auth-actions";
import { prisma } from "@/lib/prisma";
import { Role, StudentStatus } from "@prisma/client";
import { CommitteeManager } from "@/components/specialist/committee-manager";
import { getCachedExaminers } from "@/lib/cache";

export const metadata: Metadata = {
  title: "تشكيل اللجان",
};

export default async function CommitteesPage() {
  const user = await getCurrentUser();

  if (!user || (user.role !== Role.TEST_SPECIALIST && user.role !== Role.ADMIN)) {
    redirect("/test-specialist");
  }

  // الطلاب المقبولون (بانتظار التوزيع على لجنة)
  const approvedStudents = await prisma.student.findMany({
    where: { status: StudentStatus.APPROVED },
    select: { id: true, name: true, branch: true },
    orderBy: { name: "asc" },
  });

  // جميع المعلمين (المختبرين)
  const examiners = await getCachedExaminers();

  // اللجان القائمة
  const committees = await prisma.committee.findMany({
    include: {
      teacher1: { select: { id: true, name: true } },
      teacher2: { select: { id: true, name: true } },
      season: { select: { id: true, name: true } },
      allocations: {
        select: { id: true, branch: true, startModelNumber: true, endModelNumber: true },
      },
      _count: { select: { students: true } },
    },
    orderBy: { createdAt: "desc" },
  });

  // المواسم النشطة
  const seasons = await prisma.examSeason.findMany({
    select: { id: true, name: true },
    orderBy: { createdAt: "desc" },
  });

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold">تشكيل اللجان</h1>
        <p className="mt-1 text-muted-foreground">
          أنشئ لجاناً من معلمين، ووزّع الطلاب المقبولين عليها، وحدد نطاق النماذج لكل لجنة
        </p>
      </div>

      <CommitteeManager
        examiners={examiners.map((e) => ({ id: e.id, name: e.name ?? "—" }))}
        seasons={seasons}
        committees={committees.map((c) => ({
          ...c,
          name: c.name,
          branch: c.branch,
          teacher1: { id: c.teacher1.id, name: c.teacher1.name ?? "—" },
          teacher2: { id: c.teacher2.id, name: c.teacher2.name ?? "—" },
          season: { id: c.season.id, name: c.season.name },
        }))}
        approvedStudents={approvedStudents}
      />
    </div>
  );
}
