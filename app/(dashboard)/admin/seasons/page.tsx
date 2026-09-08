import type { Metadata } from "next";
import { requireUser, requireRole } from "@/lib/security";
import { Role } from "@prisma/client";
import { AdminSeasonsManager } from "@/components/admin/admin-seasons-manager";

export const metadata: Metadata = { title: "إدارة المواسم" };

export const dynamic = "force-dynamic";

export default async function AdminSeasonsPage() {
  const user = await requireUser();
  requireRole(user, [Role.ADMIN]);

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold">إدارة المواسم</h1>
        <p className="mt-1 text-muted-foreground">
          إنشاء وتفعيل وإدارة مواسم الاختبارات.
        </p>
      </div>
      <AdminSeasonsManager />
    </div>
  );
}
