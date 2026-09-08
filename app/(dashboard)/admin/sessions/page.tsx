import type { Metadata } from "next";
import { requireUser, requireRole } from "@/lib/security";
import { Role } from "@prisma/client";
import { AdminSessionsList } from "@/components/admin/admin-sessions-list";

export const metadata: Metadata = { title: "الجلسات" };

export const dynamic = "force-dynamic";

export default async function AdminSessionsPage() {
  const user = await requireUser();
  requireRole(user, [Role.ADMIN]);

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold">جلسات الاختبار</h1>
        <p className="mt-1 text-muted-foreground">
          استعراض جلسات الاختبار واللجان القائمة عليها.
        </p>
      </div>
      <AdminSessionsList />
    </div>
  );
}
