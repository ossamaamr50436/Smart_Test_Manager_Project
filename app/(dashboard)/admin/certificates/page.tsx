import type { Metadata } from "next";
import { requireUser, requireRole } from "@/lib/security";
import { Role } from "@prisma/client";
import { AdminCertificatesList } from "@/components/admin/admin-certificates-list";

export const metadata: Metadata = { title: "الشهادات" };

export const dynamic = "force-dynamic";

export default async function AdminCertificatesPage() {
  const user = await requireUser();
  requireRole(user, [Role.ADMIN]);

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold">الشهادات</h1>
        <p className="mt-1 text-muted-foreground">
          استعراض الشهادات الصادرة حسب حالتها.
        </p>
      </div>
      <AdminCertificatesList />
    </div>
  );
}
