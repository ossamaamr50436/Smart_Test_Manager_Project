import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { getCurrentUser } from "@/lib/actions/auth-actions";
import { guardSuperAdminPage } from "@/lib/tenancy";
import { getCachedPlatformSettings } from "@/lib/cache";
import { PlatformSettingsForm } from "@/components/super-admin/platform-settings-form";

export const metadata: Metadata = { title: "إعدادات المنصة" };
export const dynamic = "force-dynamic";

export default async function SuperAdminSettingsPage() {
  const user = await getCurrentUser();
  if (!user) redirect("/login");
  await guardSuperAdminPage(user);

  const settings = await getCachedPlatformSettings();

  return (
    <div className="space-y-6 animate-fade-in">
      <div>
        <h1 className="text-2xl font-bold">إعدادات المنصة</h1>
        <p className="mt-1 text-muted-foreground">
          الاسم، الشعار، الألوان، والتفضيلات العامة
        </p>
      </div>
      <PlatformSettingsForm initial={settings} />
    </div>
  );
}