import type { Metadata } from "next";
import { requireUser, requireRole } from "@/lib/security";
import { Role } from "@prisma/client";
import { AdminModelsList } from "@/components/admin/admin-models-list";

export const metadata: Metadata = { title: "النماذج" };

export const dynamic = "force-dynamic";

export default async function AdminModelsPage() {
  const user = await requireUser();
  requireRole(user, [Role.ADMIN]);

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold">النماذج الاختبارية</h1>
        <p className="mt-1 text-muted-foreground">
          عرض النماذج الاختبارية وارتباطها بالجهات والمواسم.
        </p>
      </div>
      <AdminModelsList />
    </div>
  );
}
