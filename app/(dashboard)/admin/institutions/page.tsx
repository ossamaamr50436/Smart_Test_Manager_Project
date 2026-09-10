import type { Metadata } from "next";
import { requireUser, requireRole } from "@/lib/security";
import { Role } from "@prisma/client";
import { AdminInstitutionsManager } from "@/components/admin/admin-institutions-manager";

export const metadata: Metadata = { title: "إدارة الجهات" };

export const dynamic = "force-dynamic";

export default async function AdminInstitutionsPage() {
  const user = await requireUser();
  requireRole(user, [Role.ADMIN]);

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold">إدارة الجهات</h1>
        <p className="mt-1 text-muted-foreground">
          إنشاء وتعديل وحذف الجهات التعليمية — كلمة المرور التلقائية للجهة تُجبر على التغيير عند أول دخول.
        </p>
      </div>
      <AdminInstitutionsManager />
    </div>
  );
}
