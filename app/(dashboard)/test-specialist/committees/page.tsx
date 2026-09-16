import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { getCurrentUser } from "@/lib/actions/auth-actions";
import { prisma } from "@/lib/prisma";
import { Role, StudentStatus } from "@prisma/client";
import { CommitteeManager } from "@/components/specialist/committee-manager";
import { getCachedExaminers } from "@/lib/cache";
import { getTenantFilter } from "@/lib/tenancy";

export const metadata: Metadata = {
  title: "تشكيل اللجان",
};

export const dynamic = "force-dynamic";

export default async function CommitteesPage() {
  const user = await getCurrentUser();

  if (!user || (user.role !== Role.TEST_SPECIALIST && user.role !== Role.ADMIN)) {
    redirect("/test-specialist");
  }

  const tenantFilter = getTenantFilter(user);

  // الطلاب المقبولون (بانتظار التوزيع على لجنة)
  const approvedStudents = await prisma.student.findMany({
    where: { ...tenantFilter, status: StudentStatus.APPROVED },
    select: { id: true, name: true, branch: true },
    orderBy: { name: "asc" },
  });

  // جميع المختبرين ضمن نفس المؤسسة
  const examiners = await getCachedExaminers(user.tenantId ?? undefined);

  // اللجان القائمة
  const committees = await prisma.committee.findMany({
    where: tenantFilter,
    include: {
      teacher1: { select: { id: true, name: true } },
      teacher2: { select: { id: true, name: true } },
      season: { select: { id: true, name: true } },
      selectedModels: {
        select: { id: true, model: { select: { id: true, modelNumber: true } } },
        orderBy: { createdAt: "asc" },
      },
      _count: { select: { students: true } },
    },
    orderBy: { createdAt: "desc" },
  });

  // نماذج بنك الأسئلة للاختيار اليدوي (المهمة I)
  const questionBankModels = await prisma.questionBankModel.findMany({
    where: tenantFilter,
    select: { id: true, modelNumber: true, branch: true },
    orderBy: [{ branch: "asc" }, { modelNumber: "asc" }],
  });

  // المواسم النشطة
  const seasons = await prisma.examSeason.findMany({
    where: tenantFilter,
    select: { id: true, name: true },
    orderBy: { createdAt: "desc" },
  });

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold">تشكيل اللجان</h1>
        <p className="mt-1 text-muted-foreground">
          أنشئ لجاناً من معلمين، ووزّع الطلاب المقبولين عليها، واختر نماذج كل لجنة يدوياً من بنك الأسئلة
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
        questionBankModels={questionBankModels}
      />
    </div>
  );
}
