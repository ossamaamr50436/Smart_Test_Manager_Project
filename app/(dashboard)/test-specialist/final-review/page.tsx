import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { getCurrentUser } from "@/lib/actions/auth-actions";
import { prisma } from "@/lib/prisma";
import { Role, StudentStatus, AssessmentStatus } from "@prisma/client";
import { getTenantFilter } from "@/lib/tenancy";
import { FinalReviewTable } from "@/components/specialist/final-review-table";

export const metadata: Metadata = {
  title: "مراجعة التقييمات النهائية",
};

export default async function FinalReviewPage() {
  const user = await getCurrentUser();

  // عزل الصلاحيات: صفحة خاصة بأخصائي الاختبارات والمسؤول (المهمة C)
  if (!user || (user.role !== Role.TEST_SPECIALIST && user.role !== Role.ADMIN)) {
    redirect("/");
  }

  // الطلاب الذين اعتمد المختبران تقييماتهم معاً (COMPLETED = اعتماد مزدوج كامل)
  const students = await prisma.student.findMany({
    where: { ...getTenantFilter(user), status: StudentStatus.COMPLETED },
    include: {
      institution: { select: { name: true } },
      examSessions: {
        orderBy: { createdAt: "desc" },
        include: {
          model: { select: { modelNumber: true } },
          assessments: {
            where: {
              status: {
                in: [
                  AssessmentStatus.APPROVED,
                  AssessmentStatus.ACCEPTED,
                  AssessmentStatus.NOTIFIED,
                ],
              },
            },
            select: {
              finalScore: true,
              recitationScore: true,
              tajweedScore: true,
              memorizationDeduction: true,
              totalDeduction: true,
              status: true,
              updatedAt: true,
              evaluator: { select: { id: true, name: true } },
            },
          },
        },
      },
    },
    orderBy: { updatedAt: "desc" },
  });

  // لكل طالب: معلومات الجلسة + تقييم كل مختبر كاملاً (ستُعرض تفاصيلها في نافذة المراجعة)
  const rows = students.map((student) => {
    const session = student.examSessions[0] ?? null;
    const examiners = (session?.assessments ?? []).map((a) => ({
      examinerId: a.evaluator.id,
      examinerName: a.evaluator.name,
      finalScore: a.finalScore,
      recitationScore: a.recitationScore,
      tajweedScore: a.tajweedScore,
      memorizationDeduction: a.memorizationDeduction,
      totalDeduction: a.totalDeduction,
      status: a.status,
      updatedAt: a.updatedAt,
    }));
    return {
      id: student.id,
      name: student.name,
      branch: student.branch,
      institutionName: student.institution.name,
      examDate: session?.examDate ?? null,
      period: session?.period ?? null,
      modelNumber: session?.model?.modelNumber ?? null,
      examiners,
      completedAt: student.updatedAt,
    };
  });

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold">مراجعة التقييمات النهائية</h1>
        <p className="mt-1 text-muted-foreground">
          تقييمات المختبرين كاملة بانتظار مراجعتك — اطلع على التفاصيل ثم اعتمد النتيجة
          (يمكن تعديل الدرجة النهائية عند الحاجة مع حفظ الأثر)
        </p>
      </div>

      <FinalReviewTable students={rows} />
    </div>
  );
}