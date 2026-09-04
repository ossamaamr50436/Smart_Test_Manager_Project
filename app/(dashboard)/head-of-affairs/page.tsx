import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { getCurrentUser } from "@/lib/actions/auth-actions";
import { prisma } from "@/lib/prisma";
import { Role, StudentStatus } from "@prisma/client";
import { HeadApprovalTable } from "@/components/head-of-affairs/head-approval-table";

export const metadata: Metadata = {
  title: "لوحة رئيس الشؤون التعليمية",
};

export default async function HeadOfAffairsDashboardPage() {
  const user = await getCurrentUser();

  // عزل الصلاحيات: صفحة خاصة برئيس الشؤون التعليمية
  if (!user || user.role !== Role.HEAD_OF_AFFAIRS) {
    redirect("/dashboard");
  }

  // الطلاب الذين اعتمدهم الأخصائي وبانتظار الاعتماد النهائي لرئيس الشؤون
  const students = await prisma.student.findMany({
    where: { status: StudentStatus.NOTIFIED },
    include: {
      institution: { select: { name: true } },
      examSessions: {
        include: {
          assessments: {
            where: { status: "ACCEPTED" },
            select: { finalScore: true },
          },
        },
      },
    },
    orderBy: { updatedAt: "desc" },
  });

  const rows = students.map((student) => {
    const assessment = student.examSessions[0]?.assessments[0];
    return {
      id: student.id,
      name: student.name,
      branch: student.branch,
      institutionName: student.institution.name,
      finalScore: assessment?.finalScore ?? null,
      notifiedAt: student.updatedAt,
    };
  });

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold">لوحة رئيس الشؤون التعليمية</h1>
        <p className="mt-1 text-muted-foreground">
          الاعتماد الإداري النهائي للدرجات المعتمدة من أخصائي الاختبارات
        </p>
      </div>

      <HeadApprovalTable students={rows} />
    </div>
  );
}
