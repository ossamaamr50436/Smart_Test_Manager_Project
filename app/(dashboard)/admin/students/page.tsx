import type { Metadata } from "next";
import { requireUser, requireRole } from "@/lib/security";
import { Role } from "@prisma/client";
import { AdminStudentsList } from "@/components/admin/admin-students-list";

export const metadata: Metadata = { title: "الطلاب" };

export const dynamic = "force-dynamic";

export default async function AdminStudentsPage() {
  const user = await requireUser();
  requireRole(user, [Role.ADMIN]);

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold">الطلاب</h1>
        <p className="mt-1 text-muted-foreground">
          استعراض الطلاب حسب الجهة والحالة والبحث بالاسم.
        </p>
      </div>
      <AdminStudentsList />
    </div>
  );
}
