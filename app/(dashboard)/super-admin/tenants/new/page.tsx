import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { getCurrentUser } from "@/lib/actions/auth-actions";
import { requireSuperAdmin } from "@/lib/tenancy";
import { CreateTenantForm } from "@/components/super-admin/create-tenant-form";

export const metadata: Metadata = { title: "إنشاء مؤسسة" };

export const dynamic = "force-dynamic";

export default async function SuperAdminNewTenantPage() {
  const user = await getCurrentUser();
  if (!user) redirect("/login");
  requireSuperAdmin(user);

  return (
    <div className="space-y-6 animate-fade-in">
      <div>
        <h1 className="text-2xl font-bold">إنشاء مؤسسة جديدة</h1>
        <p className="mt-1 text-muted-foreground">
          أنشئ مستأجراً جديداً لمنصة الاختبارات بمؤسساته وألوانه الخاصة.
        </p>
      </div>
      <CreateTenantForm />
    </div>
  );
}