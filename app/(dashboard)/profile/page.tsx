import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { auth } from "@/auth";
import { prisma } from "@/lib/prisma";
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
      institution: { select: { name: true } },
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
    </div>
  );
}