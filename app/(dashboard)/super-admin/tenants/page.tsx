import type { Metadata } from "next";
import Link from "next/link";
import { redirect } from "next/navigation";
import { getCurrentUser } from "@/lib/actions/auth-actions";
import { requireSuperAdmin } from "@/lib/tenancy";
import { getTenantsList } from "@/lib/actions/super-admin-actions";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";

export const metadata: Metadata = { title: "المؤسسات" };

export const dynamic = "force-dynamic";

export default async function SuperAdminTenantsPage() {
  const user = await getCurrentUser();
  if (!user) redirect("/login");
  requireSuperAdmin(user);

  const tenants = await getTenantsList();

  return (
    <div className="space-y-6 animate-fade-in">
      <div className="flex flex-wrap items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold">إدارة المؤسسات</h1>
          <p className="mt-1 text-muted-foreground">
            قائمة كل المؤسسات (المستأجرين) — تفعيل، تعطيل، ومراقبة.
          </p>
        </div>
        <Link
          href="/super-admin/tenants/new"
          className="inline-flex items-center justify-center rounded-md bg-primary px-4 py-2 text-sm font-medium text-primary-foreground transition-colors hover:bg-primary/90"
        >
          إنشاء مؤسسة جديدة
        </Link>
      </div>

      {tenants.length === 0 ? (
        <Card>
          <CardContent className="py-10 text-center text-sm text-muted-foreground">
            لا توجد مؤسسات بعد — أنشئ أول مؤسسة.
          </CardContent>
        </Card>
      ) : (
        <Card>
          <CardHeader>
            <CardTitle>المؤسسات ({tenants.length})</CardTitle>
            <CardDescription>اضغط على أي مؤسسة لعرض تفاصيلها والتحكم بها.</CardDescription>
          </CardHeader>
          <CardContent>
            <div className="overflow-x-auto">
              <table className="w-full min-w-[640px] text-sm">
                <thead>
                  <tr className="border-b text-right text-muted-foreground">
                    <th className="px-3 py-2">المؤسسة</th>
                    <th className="px-3 py-2">المعرّف</th>
                    <th className="px-3 py-2">الحالة</th>
                    <th className="px-3 py-2">المستخدمون</th>
                    <th className="px-3 py-2">الطلاب</th>
                    <th className="px-3 py-2">الجهات</th>
                    <th className="px-3 py-2">تاريخ الإنشاء</th>
                  </tr>
                </thead>
                <tbody>
                  {tenants.map((t) => (
                    <tr key={t.id} className="border-b transition-colors hover:bg-muted/50">
                      <td className="px-3 py-3">
                        <Link
                          href={`/super-admin/tenants/${t.id}`}
                          className="font-medium text-primary hover:underline"
                        >
                          {t.name}
                        </Link>
                      </td>
                      <td className="px-3 py-3 text-muted-foreground" dir="ltr">
                        {t.slug}
                      </td>
                      <td className="px-3 py-3">
                        <span
                          className={`inline-block rounded-full px-2 py-0.5 text-xs font-medium ${
                            t.isActive
                              ? "bg-green-100 text-green-700"
                              : "bg-red-100 text-red-700"
                          }`}
                        >
                          {t.isActive ? "نشط" : "معطّل"}
                        </span>
                      </td>
                      <td className="px-3 py-3">{t._count.users}</td>
                      <td className="px-3 py-3">{t._count.students}</td>
                      <td className="px-3 py-3">{t._count.institutions}</td>
                      <td className="px-3 py-3 text-muted-foreground">
                        {new Date(t.createdAt).toLocaleDateString("ar-SA")}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </CardContent>
        </Card>
      )}
    </div>
  );
}