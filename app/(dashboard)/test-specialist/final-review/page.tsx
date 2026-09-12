import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { getCurrentUser } from "@/lib/actions/auth-actions";
import { prisma } from "@/lib/prisma";
import { Role, StudentStatus, AssessmentStatus } from "@prisma/client";
import { FinalReviewTable } from "@/components/specialist/final-review-table";

export const metadata: Metadata = {
  title: "مراجعة التقييمات النهائية",
};

export default async function FinalReviewPage() {
  const user = await getCurrentUser();

  // عزل الصلاحيات: صفحة خاصة بأخصائي الاختبارات
  if (!user || user.role !== Role.TEST_SPECIALIST) {
    redirect("/");
  }

  // الطلاب الذين اعتمد المختبرون تقييماتهم (بواحد على الأقل)
  const students = await prisma.student.findMany({
    where: { status: StudentStatus.COMPLETED },
    include: {
      institution: { select: { name: true } },
      examSessions: {
        include: {
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
              evaluator: { select: { name: true } },
            },
          },
        },
      },
    },
    orderBy: { updatedAt: "desc" },
  });

  // لكل طالب: تقييمات كل مختبر منفصلة
  const rows = students.map((student) => {
    const examiners = student.examSessions.flatMap((session) =>
      session.assessments.map((a) => ({
        examinerName: a.evaluator.name,
        finalScore: a.finalScore,
      }))
    );
    return {
      id: student.id,
      name: student.name,
      branch: student.branch,
      institutionName: student.institution.name,
      examiners,
      completedAt: student.updatedAt,
    };
  });

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold">مراجعة التقييمات النهائية</h1>
        <p className="mt-1 text-muted-foreground">
          تقييمات كل مختبر معروضة منفصلة — اعتمدها لإرسالها لرئيس الشؤون
        </p>
      </div>

      <FinalReviewTable students={rows} />
    </div>
  );
}