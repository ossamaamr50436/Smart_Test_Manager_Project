import type { Metadata } from "next";
import { notFound, redirect } from "next/navigation";
import { getCurrentUser } from "@/lib/actions/auth-actions";
import { requireSuperAdmin } from "@/lib/tenancy";
import { getTenantDetails } from "@/lib/actions/super-admin-actions";
import { TenantDetailsClient } from "@/components/super-admin/tenant-details-client";
import { TenantControls } from "@/components/super-admin/tenant-controls";
import { TenantNotifications } from "@/components/super-admin/tenant-notifications";

export const metadata: Metadata = { title: "تفاصيل المؤسسة" };

export const dynamic = "force-dynamic";

export default async function SuperAdminTenantDetailsPage({
  params,
}: {
  params: { id: string };
}) {
  const user = await getCurrentUser();
  if (!user) redirect("/login");
  requireSuperAdmin(user);

  let tenant;
  try {
    tenant = await getTenantDetails(params.id);
  } catch {
    notFound();
  }

  const emptyForDelete =
    tenant._count.users + tenant._count.institutions + tenant._count.students === 0;

  return (
    <div className="space-y-6 animate-fade-in">
      <TenantDetailsClient tenant={tenant} />
      <div className="grid gap-6 lg:grid-cols-2">
        <TenantControls
          tenantId={tenant.id}
          tenantName={tenant.name}
          tenantSlug={tenant.slug}
          isActive={tenant.isActive}
          emptyForDelete={emptyForDelete}
        />
        <TenantNotifications tenantId={tenant.id} />
      </div>
    </div>
  );
}