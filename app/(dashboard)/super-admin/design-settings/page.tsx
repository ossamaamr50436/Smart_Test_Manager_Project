import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { getCurrentUser } from "@/lib/actions/auth-actions";
import { guardSuperAdminPage } from "@/lib/tenancy";
import { getCachedPlatformSettings } from "@/lib/cache";
import { DesignSettingsForm } from "@/components/super-admin/design-settings-form";

export const metadata: Metadata = { title: "إعدادات التصميم" };
export const dynamic = "force-dynamic";

export default async function SuperAdminDesignSettingsPage() {
  const user = await getCurrentUser();
  if (!user) redirect("/login");
  await guardSuperAdminPage(user);

  const settings = await getCachedPlatformSettings();

  return (
    <div className="space-y-6 animate-fade-in">
      <div>
        <h1 className="text-2xl font-bold">إعدادات التصميم</h1>
        <p className="mt-1 text-muted-foreground">
          الهوية، الألوان، الخطوط، والشكل العام للمنصة — مع معاينة مباشرة قبل الحفظ
        </p>
      </div>
      <DesignSettingsForm initial={settings} />
    </div>
  );
}
