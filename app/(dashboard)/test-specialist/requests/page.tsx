import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { getCurrentUser } from "@/lib/actions/auth-actions";
import { prisma } from "@/lib/prisma";
import { Role, StudentStatus } from "@prisma/client";
import { RequestsTable } from "@/components/specialist/requests-table";

export const metadata: Metadata = {
  title: "طلبات الترشيح",
};

export default async function RequestsPage() {
  const user = await getCurrentUser();

  // عزل الصلاحيات: صفحة خاصة بأخصائي الاختبارات
  if (!user || user.role !== Role.TEST_SPECIALIST) {
    redirect("/dashboard/test-specialist");
  }

  const pendingStudents = await prisma.student.findMany({
    where: { status: StudentStatus.PENDING },
    include: {
      institution: { select: { name: true } },
    },
    orderBy: { createdAt: "desc" },
  });

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold">طلبات الترشيح</h1>
        <p className="mt-1 text-muted-foreground">
          الطلاب بانتظار قرارك — اعتمادهم أو رفضهم
        </p>
      </div>

      <RequestsTable students={pendingStudents} />
    </div>
  );
}