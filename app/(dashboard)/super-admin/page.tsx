import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { getCurrentUser } from "@/lib/actions/auth-actions";
import { requireSuperAdmin } from "@/lib/tenancy";
import { prisma } from "@/lib/prisma";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";

export const metadata: Metadata = { title: "لوحة المالك" };

export const dynamic = "force-dynamic";

export default async function SuperAdminPage() {
  const user = await getCurrentUser();
  if (!user) redirect("/login");
  requireSuperAdmin(user);

  const [tenantCount, userCount] = await Promise.all([
    prisma.tenant.count(),
    prisma.user.count(),
  ]);

  const stats = [
    { label: "إجمالي المؤسسات", value: tenantCount },
    { label: "إجمالي المستخدمين", value: userCount },
  ];

  return (
    <div className="space-y-6 animate-fade-in">
      <div>
        <h1 className="text-2xl font-bold">لوحة المالك</h1>
        <p className="mt-1 text-muted-foreground">
          إدارة المؤسسات والمستأجرين على مستوى المنصة.
        </p>
      </div>

      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-2">
        {stats.map((stat) => (
          <Card key={stat.label}>
            <CardHeader>
              <CardTitle className="text-3xl">{stat.value}</CardTitle>
              <CardDescription>{stat.label}</CardDescription>
            </CardHeader>
          </Card>
        ))}
      </div>

      <Card>
        <CardContent className="py-6">
          <p className="text-sm text-muted-foreground">
            🚧 الواجهة الكاملة (إدارة المستأجرين والمشرفين) ستبنى في الجلسة
            القادمة.
          </p>
        </CardContent>
      </Card>
    </div>
  );
}