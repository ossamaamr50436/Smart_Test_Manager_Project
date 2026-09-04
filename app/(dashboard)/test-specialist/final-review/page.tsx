import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { getCurrentUser } from "@/lib/actions/auth-actions";
import { prisma } from "@/lib/prisma";
import { Role, StudentStatus } from "@prisma/client";
import { FinalReviewTable } from "@/components/specialist/final-review-table";

export const metadata: Metadata = {
  title: "مراجعة التقييمات النهائية",
};

export default async function FinalReviewPage() {
  const user = await getCurrentUser();

  // عزل الصلاحيات: صفحة خاصة بأخصائي الاختبارات
  if (!user || user.role !== Role.TEST_SPECIALIST) {
    redirect("/dashboard");
  }

  // الطلاب المكتملون (انتهوا من التقييم والاعتماد المتسلسل)
  const students = await prisma.student.findMany({
    where: { status: StudentStatus.COMPLETED },
    include: {
      institution: { select: { name: true } },
      examSessions: {
        include: {
          assessments: {
            where: { status: "FINALIZED" },
            select: { finalScore: true },
          },
        },
      },
    },
    orderBy: { updatedAt: "desc" },
  });

  // استخراج الدرجة النهائية وتاريخ الانتهاء لكل طالب
  const rows = students.map((student) => {
    const assessment = student.examSessions[0]?.assessments[0];
    return {
      id: student.id,
      name: student.name,
      branch: student.branch,
      institutionName: student.institution.name,
      finalScore: assessment?.finalScore ?? null,
      completedAt: student.updatedAt,
    };
  });

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold">مراجعة التقييمات النهائية</h1>
        <p className="mt-1 text-muted-foreground">
          الطلاب الذين أكملوا التقييم والاعتماد المتسلسل — اعتمدهم نهائياً لإرسالها
          لرئيس الشؤون
        </p>
      </div>

      <FinalReviewTable students={rows} />
    </div>
  );
}
