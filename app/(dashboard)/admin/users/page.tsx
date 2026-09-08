import type { Metadata } from "next";
import { requireUser, requireRole } from "@/lib/security";
import { Role } from "@prisma/client";
import { AdminUsersManager } from "@/components/admin/admin-users-manager";

export const metadata: Metadata = { title: "إدارة المستخدمين" };

export const dynamic = "force-dynamic";

export default async function AdminUsersPage() {
  const user = await requireUser();
  requireRole(user, [Role.ADMIN]);

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold">إدارة المستخدمين</h1>
        <p className="mt-1 text-muted-foreground">
          إنشاء وتعديل وحذف المستخدمين وتغيير أدوارهم وكلمات المرور.
        </p>
      </div>
      <AdminUsersManager />
    </div>
  );
}
