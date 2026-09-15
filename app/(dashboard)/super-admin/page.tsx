import type { Metadata } from "next";
import Link from "next/link";
import { redirect } from "next/navigation";
import { getCurrentUser } from "@/lib/actions/auth-actions";
import { guardSuperAdminPage } from "@/lib/tenancy";
import { getSuperAdminDashboardStats } from "@/lib/actions/super-admin-actions";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";

export const metadata: Metadata = { title: "لوحة المالك" };

export const dynamic = "force-dynamic";

const ALERT_LABELS: Record<string, string> = {
  TLS_CHANGED: "تغيير مفتاح TLS",
  SHARE_LINK_ACCESSED: "تسجيل دخول عبر رابط مشاركة",
  SPAM_LOGIN_ATTEMPT: "محاولة تسجيل دخول مشبوهة",
  TRANSFER_TRIAL: "محاولة نقل بيانات محظورة",
  SUSPICIOUS_ACCESS: "وصول مشبوه",
  RATE_LIMIT_HIT: "تجاوز حد الطلبات",
  CROSS_TENANT_ATTEMPT: "محاولة وصول عبر المستأجرين",
  FAILED_LOGIN: "محاولة دخول فاشلة",
};

export default async function SuperAdminPage() {
  const user = await getCurrentUser();
  if (!user) redirect("/login");
  await guardSuperAdminPage(user);

  const data = await getSuperAdminDashboardStats();

  const stats = [
    { label: "المؤسسات", value: data.stats.tenants },
    { label: "المستخدمون", value: data.stats.users },
    { label: "الجهات التعليمية", value: data.stats.institutions },
    { label: "الطلاب", value: data.stats.students },
    { label: "جلسات الاختبار", value: data.stats.sessions },
  ];

  return (
    <div className="space-y-6 animate-fade-in">
      <div className="flex flex-wrap items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold">لوحة المالك</h1>
          <p className="mt-1 text-muted-foreground">
            نظرة شاملة على منصة مستأجري تطبيق الاختبارات.
          </p>
        </div>
        <Link
          href="/super-admin/tenants/new"
          className="inline-flex items-center justify-center rounded-md bg-primary px-4 py-2 text-sm font-medium text-primary-foreground transition-colors hover:bg-primary/90"
        >
          إنشاء مؤسسة جديدة
        </Link>
      </div>

      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-5">
        {stats.map((stat) => (
          <Card key={stat.label}>
            <CardHeader>
              <CardTitle className="text-3xl">{stat.value}</CardTitle>
              <CardDescription>{stat.label}</CardDescription>
            </CardHeader>
          </Card>
        ))}
      </div>

      <div className="grid gap-6 lg:grid-cols-2">
        {/* آخر المؤسسات */}
        <Card>
          <CardHeader>
            <CardTitle>أحدث المؤسسات</CardTitle>
            <CardDescription>
              <Link href="/super-admin/tenants" className="text-primary hover:underline">
                عرض كل المؤسسات
              </Link>
            </CardDescription>
          </CardHeader>
          <CardContent>
            {data.recentTenants.length === 0 ? (
              <p className="text-sm text-muted-foreground">لا توجد مؤسسات بعد.</p>
            ) : (
              <ul className="divide-y">
                {data.recentTenants.map((t) => (
                  <li key={t.id} className="py-3">
                    <Link
                      href={`/super-admin/tenants/${t.id}`}
                      className="flex items-center justify-between gap-2 rounded-md p-2 transition-colors hover:bg-muted"
                    >
                      <div>
                        <p className="font-medium">{t.name}</p>
                        <p className="text-xs text-muted-foreground" dir="ltr">
                          {t.slug}
                        </p>
                      </div>
                      <div className="text-left">
                        <span
                          className={`inline-block rounded-full px-2 py-0.5 text-xs font-medium ${
                            t.isActive
                              ? "bg-green-100 text-green-700"
                              : "bg-red-100 text-red-700"
                          }`}
                        >
                          {t.isActive ? "نشط" : "معطّل"}
                        </span>
                        <p className="mt-1 text-xs text-muted-foreground">
                          {t._count.users} مستخدم · {t._count.students} طالب
                        </p>
                      </div>
                    </Link>
                  </li>
                ))}
              </ul>
            )}
          </CardContent>
        </Card>

        {/* آخر التنبيهات الأمنية */}
        <Card>
          <CardHeader>
            <CardTitle>آخر التنبيهات الأمنية</CardTitle>
            <CardDescription>
              <Link href="/super-admin/alerts" className="text-primary hover:underline">
                عرض كل التنبيهات
              </Link>
            </CardDescription>
          </CardHeader>
          <CardContent>
            {data.recentAlerts.length === 0 ? (
              <p className="text-sm text-muted-foreground">لا توجد تنبيهات أمنية.</p>
            ) : (
              <ul className="divide-y">
                {data.recentAlerts.map((alert) => (
                  <li key={alert.id} className="flex items-start justify-between gap-3 py-3">
                    <div>
                      <p className="text-sm font-medium">{ALERT_LABELS[alert.action] ?? alert.action}</p>
                      <p className="text-xs text-muted-foreground">
                        {alert.user?.email ?? "النظام"}
                      </p>
                    </div>
                    <span className="text-xs text-muted-foreground">
                      {new Date(alert.timestamp).toLocaleDateString("ar-SA")}
                    </span>
                  </li>
                ))}
              </ul>
            )}
          </CardContent>
        </Card>
      </div>
    </div>
  );
}