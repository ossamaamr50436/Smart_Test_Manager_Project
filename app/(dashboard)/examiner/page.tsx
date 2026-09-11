import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { getCurrentUser } from "@/lib/actions/auth-actions";
import { prisma } from "@/lib/prisma";
import { Role } from "@prisma/client";
import { ExaminerDashboardClient } from "@/components/examiner/examiner-dashboard-client";

export const metadata: Metadata = { title: "لوحة المختبر" };

export default async function ExaminerDashboardPage() {
  const user = await getCurrentUser();

  if (!user || user.role !== Role.EXAMINER) {
    redirect("/");
  }

  // البحث عن اللجنة التي ينتمي إليها المختبر (معلم1 أو معلم2)
  const committee = await prisma.committee.findFirst({
    where: {
      OR: [{ teacher1Id: user.id }, { teacher2Id: user.id }],
    },
    include: {
      allocations: { select: { startModelNumber: true, endModelNumber: true } },
      students: {
        select: { id: true, name: true, branch: true, status: true },
        orderBy: { name: "asc" },
      },
    },
  });

  return (
    <div className="space-y-6 animate-fade-in">
      <div>
        <h1 className="text-2xl font-bold">لوحة المختبر (المعلم)</h1>
        <p className="mt-1 text-muted-foreground">
          طلابك الموزعون على لجنتك — اضغط «ابدأ الاختبار» لبدء التقييم التفاعلي
        </p>
      </div>

      <ExaminerDashboardClient
        students={committee?.students ?? []}
        committee={committee
          ? {
              name: committee.name,
              allocations: committee.allocations,
            }
          : null
        }
      />
    </div>
  );
}
