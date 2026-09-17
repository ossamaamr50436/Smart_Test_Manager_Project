import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { auth } from "@/auth";
import { prisma } from "@/lib/prisma";
import { Role } from "@prisma/client";
import { ROLE_LABELS } from "@/lib/roles";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";

export const metadata: Metadata = { title: "الملف الشخصي" };

export const dynamic = "force-dynamic";

export default async function ProfilePage() {
  const session = await auth();
  if (!session?.user?.id) {
    redirect("/login");
  }

  const user = await prisma.user.findUnique({
    where: { id: session.user.id },
    select: {
      id: true,
      name: true,
      email: true,
      role: true,
      birthDate: true,
      phone: true,
      institutionId: true,
      institution: { select: { name: true, tenantId: true } },
      createdAt: true,
    },
  });

  if (!user) {
    redirect("/login");
  }

  const infoRows = [
    { label: "الاسم", value: user.name },
    { label: "البريد الإلكتروني", value: user.email },
    { label: "الدور", value: ROLE_LABELS[user.role] },
    {
      label: "تاريخ الميلاد",
      value: new Date(user.birthDate).toLocaleDateString("ar-SA"),
    },
    { label: "الجوال", value: user.phone || "—" },
    {
      label: "الجهة التعليمية",
      value: user.institution?.name ?? "—",
    },
    {
      label: "تاريخ الانضمام",
      value: new Date(user.createdAt).toLocaleDateString("ar-SA"),
    },
  ];

  const tenantId = user.institution?.tenantId ?? null;
  if (tenantId === null && user.role !== Role.SUPER_ADMIN) {
    throw new Error("غير مصرح: المستخدم غير مرتبط بمؤسسة");
  }
  const tenantFilter: { tenantId?: string } = tenantId ? { tenantId } : {};

  let roleStats: { label: string; value: string | number }[] = [];

  if (user.role === Role.SUPER_ADMIN) {
    const institutionsCount = await prisma.institution.count();
    roleStats = [{ label: "عدد المؤسسات", value: institutionsCount }];
  } else if (user.role === Role.ADMIN) {
    const [studentsCount, sessionsCount] = await Promise.all([
      prisma.student.count({ where: tenantFilter }),
      prisma.examSession.count({ where: tenantFilter }),
    ]);
    roleStats = [
      { label: "الجهة التعليمية", value: user.institution?.name ?? "—" },
      { label: "الطلاب", value: studentsCount },
      { label: "جلسات الاختبار", value: sessionsCount },
    ];
  } else if (user.role === Role.TEST_SPECIALIST) {
    const [committeesCount, approvedStudentsCount] = await Promise.all([
      prisma.committee.count({ where: tenantFilter }),
      prisma.student.count({
        where: { ...tenantFilter, status: "APPROVED" },
      }),
    ]);
    roleStats = [
      { label: "اللجان", value: committeesCount },
      { label: "الطلاب المقبولون", value: approvedStudentsCount },
    ];
  } else if (user.role === Role.EXAMINER) {
    const committee = await prisma.committee.findFirst({
      where: {
        ...tenantFilter,
        OR: [{ teacher1Id: user.id }, { teacher2Id: user.id }],
      },
      select: {
        name: true,
        selectedModels: {
          select: { model: { select: { modelNumber: true } } },
          orderBy: { createdAt: "asc" },
        },
        _count: { select: { students: true } },
      },
    });
    roleStats = [
      { label: "اللجنة", value: committee?.name ?? "—" },
      {
        label: "نماذج اللجنة",
        value: committee
          ? committee.selectedModels
              .map((s) => s.model.modelNumber)
              .join("، ")
          : "—",
      },
      { label: "طلاب اللجنة", value: committee?._count.students ?? 0 },
    ];
  } else if (user.role === Role.HEAD_OF_AFFAIRS) {
    const pendingAssessments = await prisma.student.count({
      where: { ...tenantFilter, status: "NOTIFIED" },
    });
    roleStats = [
      { label: "التقييمات المنتظرة", value: pendingAssessments },
    ];
  } else if (user.role === Role.CERTIFICATE_SOURCE) {
    const pendingCertificates = await prisma.certificate.count({
      where: { ...tenantFilter, status: "PENDING" },
    });
    roleStats = [
      { label: "الشهادات المنتظرة", value: pendingCertificates },
    ];
  } else if (user.role === Role.INSTITUTION) {
    const studentsCount = await prisma.student.count({
      where: { ...tenantFilter, institutionId: user.institutionId ?? undefined },
    });
    roleStats = [
      { label: "الجهة التعليمية", value: user.institution?.name ?? "—" },
      { label: "الطلاب المرشحون", value: studentsCount },
    ];
  }

  return (
    <div className="mx-auto flex max-w-2xl flex-col gap-6">
      <div className="space-y-1">
        <h1 className="text-2xl font-bold">الملف الشخصي</h1>
        <p className="text-sm text-muted-foreground">
          معلومات حسابك الأساسية
        </p>
      </div>

      <Card>
        <CardHeader>
          <CardTitle className="text-base">بيانات الحساب</CardTitle>
          <CardDescription>
            هذه البيانات مسجلة في النظام وتُستخدم في الاعتماد وطباعة الشهادات
          </CardDescription>
        </CardHeader>
        <CardContent>
          <dl className="divide-y rounded-lg border">
            {infoRows.map((row) => (
              <div
                key={row.label}
                className="flex items-center justify-between gap-4 px-4 py-3"
              >
                <dt className="text-sm text-muted-foreground">{row.label}</dt>
                <dd
                  className="truncate text-sm font-medium"
                  dir={row.label === "البريد الإلكتروني" ? "ltr" : undefined}
                >
                  {row.value}
                </dd>
              </div>
            ))}
          </dl>
        </CardContent>
      </Card>

      {roleStats.length > 0 && (
        <Card>
          <CardHeader>
            <CardTitle className="text-base">إحصائيات دورك</CardTitle>
            <CardDescription>
              بيانات مباشرة من النظام حسب دورك الحالي
            </CardDescription>
          </CardHeader>
          <CardContent>
            <dl className="divide-y rounded-lg border">
              {roleStats.map((row) => (
                <div
                  key={row.label}
                  className="flex items-center justify-between gap-4 px-4 py-3"
                >
                  <dt className="text-sm text-muted-foreground">{row.label}</dt>
                  <dd className="text-sm font-medium">{row.value}</dd>
                </div>
              ))}
            </dl>
          </CardContent>
        </Card>
      )}
    </div>
  );
}