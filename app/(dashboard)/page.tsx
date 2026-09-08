import type { Metadata } from "next";
import { getCurrentUser } from "@/lib/actions/auth-actions";
import { prisma } from "@/lib/prisma";
import { ROLE_LABELS } from "@/lib/roles";
import {
  Card,
  CardContent,
  CardHeader,
  CardTitle,
  CardDescription,
} from "@/components/ui/card";

export const metadata: Metadata = {
  title: "لوحة التحكم الرئيسية",
};

export const dynamic = "force-dynamic";

export default async function DashboardPage() {
  const user = await getCurrentUser();
  const role = user?.role;
  const userName = user?.name ?? "مستخدم";

  const roleLabel = role ? ROLE_LABELS[role] : "غير محدد";

  // إحصائيات حقيقية من قاعدة البيانات (بدون بيانات وهمية)
  const [totalStudents, totalSessions, totalModels, approvedStudents] =
    await Promise.all([
      prisma.student.count(),
      prisma.examSession.count(),
      prisma.examModel.count(),
      prisma.student.count({ where: { status: "COMPLETED" } }),
    ]);

  const stats = [
    { label: "عدد الطلاب", value: totalStudents, hint: "طلاب مرشحون" },
    { label: "عدد الجلسات", value: totalSessions, hint: "جلسة اختبار" },
    {
      label: "الطلاب المكتملون",
      value: approvedStudents,
      hint: "أكملوا التقييم",
    },
    { label: "النماذج", value: totalModels, hint: "نموذج اختباري" },
  ];

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold">مرحباً، {userName}</h1>
        <p className="mt-1 text-muted-foreground">
          دورك:{" "}
          <span className="font-medium text-secondary">{roleLabel}</span>
        </p>
      </div>

      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        {stats.map((stat) => (
          <Card key={stat.label}>
            <CardHeader>
              <CardTitle className="text-3xl">{stat.value}</CardTitle>
              <CardDescription>{stat.label}</CardDescription>
            </CardHeader>
            <CardContent>
              <p className="text-xs text-muted-foreground">{stat.hint}</p>
            </CardContent>
          </Card>
        ))}
      </div>

      <Card>
        <CardHeader>
          <CardTitle>نظرة عامة</CardTitle>
          <CardDescription>
            هذه لوحة التحكم العامة. ستصلك تلقائياً إلى لوحة دورك من القائمة
            الجانبية.
          </CardDescription>
        </CardHeader>
        <CardContent>
          <p className="text-sm text-muted-foreground">
            استخدم القائمة الجانبية للتنقل بين أقسام دورك.
          </p>
        </CardContent>
      </Card>
    </div>
  );
}
