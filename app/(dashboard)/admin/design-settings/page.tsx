import type { Metadata } from "next";
import { requireUser, requireRole } from "@/lib/security";
import { Role } from "@prisma/client";
import { getTenantDesignSettings } from "@/lib/actions/settings-actions";
import { TenantDesignSettingsForm } from "@/components/admin/tenant-design-settings-form";

export const metadata: Metadata = { title: "إعدادات التصميم" };
export const dynamic = "force-dynamic";

export default async function AdminDesignSettingsPage() {
  const user = await requireUser();
  requireRole(user, [Role.ADMIN]);

  // M17-C: الجهة تُقرأ من الجلسة حصراً — يستحيل الوصول لجهة أخرى
  const { tokens, hasOverrides } = await getTenantDesignSettings(user.tenantId ?? "");

  return (
    <div className="space-y-6 animate-fade-in">
      <div>
        <h1 className="text-2xl font-bold">إعدادات التصميم (الجهة)</h1>
        <p className="mt-1 text-muted-foreground">
          تخصيص ألوان وهوية جهتك فقط — لا تؤثر على بقية الجهات أو على المنصة
        </p>
      </div>
      <TenantDesignSettingsForm initial={tokens} hasOverrides={hasOverrides} />
    </div>
  );
}