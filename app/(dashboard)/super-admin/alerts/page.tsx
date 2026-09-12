import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { getCurrentUser } from "@/lib/actions/auth-actions";
import { requireSuperAdmin } from "@/lib/tenancy";
import { getSuperAdminDashboardStats } from "@/lib/actions/super-admin-actions";
import { SecurityAlertsList } from "@/components/super-admin/security-alerts-list";

export const metadata: Metadata = { title: "التنبيهات الأمنية" };

export const dynamic = "force-dynamic";

export default async function SuperAdminAlertsPage() {
  const user = await getCurrentUser();
  if (!user) redirect("/login");
  requireSuperAdmin(user);

  const data = await getSuperAdminDashboardStats();

  return (
    <div className="space-y-6 animate-fade-in">
      <div>
        <h1 className="text-2xl font-bold">التنبيهات الأمنية</h1>
        <p className="mt-1 text-muted-foreground">
          أحداث مستوى المنصة (تنبيهات أمنية، محاولات دخول، عمليات حرجة).
        </p>
      </div>
      <SecurityAlertsList initialAlerts={data.recentAlerts} />
    </div>
  );
}