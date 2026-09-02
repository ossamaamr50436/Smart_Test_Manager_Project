import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { getCurrentUser } from "@/lib/actions/auth-actions";
import { prisma } from "@/lib/prisma";
import { Role, StudentStatus } from "@prisma/client";
import { CommitteeForm } from "@/components/specialist/committee-form";
import {
  Card,
  CardContent,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";

export const metadata: Metadata = {
  title: "تشكيل اللجان",
};

export default async function CommitteesPage() {
  const user = await getCurrentUser();

  // عزل الصلاحيات: صفحة خاصة بأخصائي الاختبارات
  if (!user || user.role !== Role.TEST_SPECIALIST) {
    redirect("/dashboard/test-specialist");
  }

  // الطلاب المقبولون وغير الموزعين على لجان بعد
  const approvedStudents = await prisma.student.findMany({
    where: { status: StudentStatus.APPROVED },
    include: {
      institution: { select: { name: true } },
    },
    orderBy: { createdAt: "asc" },
  });

  // جميع المعلمين (المختبرين)
  const examiners = await prisma.user.findMany({
    where: { role: Role.EXAMINER },
    select: { id: true, name: true },
    orderBy: { name: "asc" },
  });

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold">تشكيل اللجان</h1>
        <p className="mt-1 text-muted-foreground">
          وزّع الطلاب المقبولين على لجان مكوّنة من معلمين وتاريخ محدد
        </p>
      </div>

      <div className="grid gap-6 lg:grid-cols-2">
        {/* قائمة الطلاب المقبولين */}
        <Card>
          <CardHeader>
            <CardTitle className="text-base">
              الطلاب المقبولون (غير الموزعين) — {approvedStudents.length}
            </CardTitle>
          </CardHeader>
          <CardContent>
            {approvedStudents.length === 0 ? (
              <p className="py-6 text-center text-sm text-muted-foreground">
                لا يوجد طلاب مقبولون بانتظار التوزيع
              </p>
            ) : (
              <div className="max-h-96 space-y-2 overflow-y-auto">
                {approvedStudents.map((student) => (
                  <div
                    key={student.id}
                    className="flex items-center justify-between rounded-lg border px-3 py-2 text-sm"
                  >
                    <div>
                      <p className="font-medium">{student.name}</p>
                      <p className="text-xs text-muted-foreground">
                        {student.branch} أجزاء — {student.institution.name}
                      </p>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </CardContent>
        </Card>

        {/* نموذج إنشاء جلسة اختبار */}
        <CommitteeForm
          students={approvedStudents}
          examiners={examiners}
        />
      </div>
    </div>
  );
}