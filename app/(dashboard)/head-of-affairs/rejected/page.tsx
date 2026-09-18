import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { getCurrentUser } from "@/lib/actions/auth-actions";
import { getStudentsRejectedByHead } from "@/lib/actions/head-actions";
import { Role } from "@prisma/client";
import { RejectedStudentsTable } from "@/components/head-of-affairs/rejected-students-table";

export const metadata: Metadata = {
  title: "الطلاب المرفوضون",
};

export default async function HeadOfAffairsRejectedPage() {
  const user = await getCurrentUser();

  // عزل الصلاحيات: صفحة خاصة برئيس الشؤون التعليمية
  if (!user || user.role !== Role.HEAD_OF_AFFAIRS) {
    redirect("/");
  }

  const rejected = await getStudentsRejectedByHead();

  const rows = rejected.map((student) => {
    const assessment = student.examSessions[0]?.assessments[0];
    return {
      id: student.id,
      name: student.name,
      branch: student.branch,
      institutionName: student.institution.name,
      finalScore: assessment?.finalScore ?? null,
      rejectedAt: student.rejectedAt,
      rejectionReason: student.rejectionReason,
      rejectedByName: student.rejectedBy?.name ?? null,
    };
  });

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold">الطلاب المرفوضون</h1>
        <p className="mt-1 text-muted-foreground">
          الطلاب الذين رفُض اعتماد درجاتهم — مع سبب الرفض
        </p>
      </div>

      <RejectedStudentsTable
        students={rows}
        title="الطلاب المرفوضون من رئيس الشؤون التعليمية"
      />
    </div>
  );
}