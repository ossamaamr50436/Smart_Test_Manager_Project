import type { Metadata } from "next";
import Link from "next/link";
import { redirect } from "next/navigation";
import { getCurrentUser } from "@/lib/actions/auth-actions";
import { listInstitutions } from "@/lib/actions/entity-actions";
import { Role } from "@prisma/client";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";

export const metadata: Metadata = {
  title: "إدارة الجهات",
};

export const dynamic = "force-dynamic";

export default async function SpecialistEntitiesPage() {
  const user = await getCurrentUser();
  if (
    !user ||
    (user.role !== Role.TEST_SPECIALIST && user.role !== Role.ADMIN)
  ) {
    redirect("/");
  }

  const { institutions } = await listInstitutions();

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-2xl font-bold">إدارة الجهات</h1>
          <p className="mt-1 text-muted-foreground">
            الجهات التعليمية — يمكنك الإشراف عليها وإنشاء جهات جديدة
          </p>
        </div>
        <Button asChild>
          <Link href="/specialist/entities/create">+ إنشاء جهة</Link>
        </Button>
      </div>

      <Card>
        <CardHeader>
          <CardTitle className="text-base">قائمة الجهات</CardTitle>
          <CardDescription>{institutions.length} جهة</CardDescription>
        </CardHeader>
        <CardContent>
          {institutions.length === 0 ? (
            <p className="py-8 text-center text-muted-foreground">
              لا توجد جهات بعد — أنشئ أول جهة
            </p>
          ) : (
            <div className="overflow-x-auto rounded-lg border">
              <table className="w-full text-sm">
                <thead className="bg-muted/60">
                  <tr className="text-right">
                    <th className="px-3 py-2 font-medium">الجهة</th>
                    <th className="px-3 py-2 font-medium">المدير</th>
                    <th className="px-3 py-2 font-medium">المشرف</th>
                    <th className="px-3 py-2 font-medium">رقم التصريح</th>
                    <th className="px-3 py-2 font-medium">الحي</th>
                    <th className="px-3 py-2 font-medium">إحصاءات</th>
                  </tr>
                </thead>
                <tbody>
                  {institutions.map((inst) => (
                    <tr key={inst.id} className="border-t">
                      <td className="px-3 py-2 font-medium">{inst.name}</td>
                      <td className="px-3 py-2">
                        <p>{inst.managerName}</p>
                        <p className="text-xs text-muted-foreground" dir="ltr">{inst.managerPhone}</p>
                      </td>
                      <td className="px-3 py-2">
                        <p>{inst.supervisorName}</p>
                        <p className="text-xs text-muted-foreground" dir="ltr">{inst.supervisorPhone}</p>
                      </td>
                      <td className="px-3 py-2 tabular-nums" dir="ltr">{inst.licenseNumber}</td>
                      <td className="px-3 py-2">{inst.district}</td>
                      <td className="px-3 py-2 text-xs text-muted-foreground">
                        {inst._count.students} طالب — {inst._count.users} مستخدم — {inst._count.examModels} نموذج
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}