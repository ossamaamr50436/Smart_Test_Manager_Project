import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { getCurrentUser } from "@/lib/actions/auth-actions";
import { prisma } from "@/lib/prisma";
import { Role } from "@prisma/client";
import { ExamModelsManager } from "@/components/specialist/exam-models-manager";

export const metadata: Metadata = {
  title: "إدارة النماذج",
};

export default async function SpecialistModelsPage() {
  const user = await getCurrentUser();

  // عزل الصلاحيات: صفحة خاصة بأخصائي الاختبارات
  if (!user || user.role !== Role.TEST_SPECIALIST) {
    redirect("/test-specialist");
  }

  // جميع المواسم لاختيارها عند الإنشاء
  const seasons = await prisma.examSeason.findMany({
    select: { id: true, name: true },
    orderBy: { startDate: "desc" },
  });

  // جميع النماذج (حتى 100 نموذج لكل فرع)
  const models = await prisma.examModel.findMany({
    select: {
      id: true,
      modelNumber: true,
      branch: true,
      detailsJSON: true,
      segmentsCount: true,
      season: { select: { id: true, name: true } },
    },
    orderBy: [{ branch: "asc" }, { modelNumber: "asc" }],
  });

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold">إدارة النماذج الاختبارية</h1>
        <p className="mt-1 text-muted-foreground">
          وفق لائحة اختيار فرع كامل القرآن — حتى 100 نموذج لكل فرع، مع عدد مقاطع من 1 إلى 30
        </p>
      </div>

      <ExamModelsManager
        seasons={seasons}
        models={models}
      />
    </div>
  );
}