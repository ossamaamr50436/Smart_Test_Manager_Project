import type { Metadata } from "next";
import Link from "next/link";
import { redirect } from "next/navigation";
import { getCurrentUser } from "@/lib/actions/auth-actions";
import { prisma } from "@/lib/prisma";
import { Role, StudentStatus } from "@prisma/client";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";

export const metadata: Metadata = { title: "لوحة الأخصائي" };

export const dynamic = "force-dynamic";

export default async function TestSpecialistDashboardPage() {
  const user = await getCurrentUser();

  if (!user || user.role !== Role.TEST_SPECIALIST) {
    redirect("/");
  }

  const pendingRequests = await prisma.student.count({
    where: { status: StudentStatus.PENDING },
  });

  const approvedStudents = await prisma.student.count({
    where: { status: StudentStatus.APPROVED },
  });

  const assignedStudents = await prisma.student.count({
    where: { status: StudentStatus.ASSIGNED },
  });

  const sessions = await prisma.examSession.count();

  const finalizedReady = await prisma.student.count({
    where: { status: StudentStatus.COMPLETED },
  });

  const stats = [
    {
      href: "/test-specialist/requests",
      label: "طلبات الترشيح",
      value: pendingRequests,
      hint: "بانتظار المراجعة",
    },
    {
      href: "/test-specialist/requests",
      label: "الطلاب المقبولون",
      value: approvedStudents,
      hint: "بانتظار تشكيل اللجان",
    },
    {
      href: "/test-specialist/committees",
      label: "الطلاب الموزعون على لجان",
      value: assignedStudents,
      hint: "جارٍ التقييم",
    },
    {
      href: "/test-specialist/final-review",
      label: "التقييمات المكتملة",
      value: finalizedReady,
      hint: "بانتظار المراجعة والاعتماد",
    },
    {
      href: "/test-specialist/committees",
      label: "اللجان (الجلسات)",
      value: sessions,
      hint: "إجمالي الجلسات المكوّنة",
    },
  ];

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold">لوحة أخصائي الاختبارات</h1>
        <p className="mt-1 text-muted-foreground">
          إدارة الطلبات وتشكيل اللجان ومراجعة التقييمات النهائية
        </p>
      </div>

      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
        {stats.map((stat) => (
          <Link key={stat.href} href={stat.href}>
            <Card className="transition-colors hover:bg-secondary-50">
              <CardHeader>
                <CardTitle className="text-base">{stat.label}</CardTitle>
              </CardHeader>
              <CardContent>
                <p className="text-3xl font-bold">{stat.value}</p>
                <p className="mt-1 text-xs text-muted-foreground">{stat.hint}</p>
              </CardContent>
            </Card>
          </Link>
        ))}
      </div>
    </div>
  );
}
