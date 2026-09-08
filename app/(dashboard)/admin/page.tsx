import type { Metadata } from "next";
import { requireUser, requireRole } from "@/lib/security";
import { Role } from "@prisma/client";
import {
  Card,
  CardContent,
  CardHeader,
  CardTitle,
  CardDescription,
} from "@/components/ui/card";
import { getAdminDashboardStats } from "@/lib/actions/admin-panel-actions";
import Link from "next/link";

export const metadata: Metadata = { title: "لوحة المسؤول" };

export const dynamic = "force-dynamic";

const ACTION_LABELS: Record<string, string> = {
  CREATE: "إنشاء",
  UPDATE: "تعديل",
  DELETE: "حذف",
  LOGIN: "دخول",
  APPROVE: "اعتماد",
  REJECT: "رفض",
  ASSESS: "تقييم",
};

const QUICK_LINKS = [
  { href: "/admin/users", label: "إدارة المستخدمين" },
  { href: "/admin/institutions", label: "إدارة المؤسسات" },
  { href: "/admin/seasons", label: "إدارة المواسم" },
  { href: "/admin/models", label: "النماذج" },
  { href: "/admin/students", label: "الطلاب" },
  { href: "/admin/sessions", label: "الجلسات" },
  { href: "/admin/certificates", label: "الشهادات" },
];

export default async function AdminDashboardPage() {
  const user = await requireUser();
  requireRole(user, [Role.ADMIN]);

  const stats = await getAdminDashboardStats();

  const primaryStats = [
    stats.totalStudents,
    stats.totalSessions,
    stats.totalUsers,
    stats.totalInstitutions,
  ];

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold">لوحة المسؤول</h1>
        <p className="mt-1 text-muted-foreground">
          تحكم كامل بالمنصة والمستخدمين والبيانات، مع تسجيل أي تدخل في سجل
          التدقيق.
        </p>
      </div>

      {/* الإحصائيات الأساسية */}
      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        {primaryStats.map((stat) => (
          <Card key={stat.label}>
            <CardHeader>
              <CardTitle className="text-3xl">{stat.value}</CardTitle>
              <CardDescription>{stat.label}</CardDescription>
            </CardHeader>
          </Card>
        ))}
      </div>

      {/* روابط سريعة */}
      <Card>
        <CardHeader>
          <CardTitle className="text-base">إدارة سريعة</CardTitle>
        </CardHeader>
        <CardContent>
          <div className="flex flex-wrap gap-2">
            {QUICK_LINKS.map((link) => (
              <Link
                key={link.href}
                href={link.href}
                className="rounded-md border bg-secondary-50 px-4 py-2 text-sm text-primary-700 transition-colors hover:bg-secondary-100"
              >
                {link.label}
              </Link>
            ))}
          </div>
        </CardContent>
      </Card>

      {/* إحصائيات مفصلة */}
      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        {[
          stats.totalSeasons,
          stats.totalExaminers,
          stats.upcomingSessions,
          stats.completedSessions,
          stats.pendingRequests,
          stats.approvedStudents,
          stats.rejectedStudents,
          stats.totalCertificates,
          stats.readyCertificates,
          stats.certificateIssuedStudents,
          stats.totalModels,
          stats.totalNotifications,
        ].map((stat) => (
          <Card key={stat.label}>
            <CardContent className="py-4">
              <p className="text-2xl font-bold">{stat.value}</p>
              <p className="text-xs text-muted-foreground">{stat.label}</p>
            </CardContent>
          </Card>
        ))}
      </div>

      {/* النشاط الأخير */}
      <Card>
        <CardHeader>
          <CardTitle className="text-base">آخر الأنشطة</CardTitle>
          <CardDescription>
            أحدث العمليات المسجلة في سجل التدقيق
          </CardDescription>
        </CardHeader>
        <CardContent>
          {stats.recentActivity.length === 0 ? (
            <p className="py-8 text-center text-sm text-muted-foreground">
              لا توجد أنشطة مسجلة بعد
            </p>
          ) : (
            <ul className="space-y-2">
              {stats.recentActivity.map((activity) => (
                <li
                  key={activity.id}
                  className="flex flex-wrap items-center justify-between gap-3 rounded-lg border px-4 py-3"
                >
                  <div className="space-y-1">
                    <div className="flex items-center gap-2">
                      <span className="inline-flex items-center rounded-full bg-secondary-100 px-2 py-0.5 text-xs font-medium text-primary-700">
                        {ACTION_LABELS[activity.action] ?? activity.action}
                      </span>
                      <span className="text-xs text-muted-foreground">
                        {activity.user
                          ? `${activity.user.name} (${activity.user.email})`
                          : "نظام"}
                      </span>
                    </div>
                    {activity.details && (
                      <p className="text-xs text-muted-foreground">
                        {typeof activity.details === "string"
                          ? activity.details
                          : JSON.stringify(activity.details)}
                      </p>
                    )}
                  </div>
                  <span className="text-xs text-muted-foreground">
                    {new Date(activity.timestamp).toLocaleString("ar-SA", {
                      year: "numeric",
                      month: "long",
                      day: "numeric",
                      hour: "2-digit",
                      minute: "2-digit",
                    })}
                  </span>
                </li>
              ))}
            </ul>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
