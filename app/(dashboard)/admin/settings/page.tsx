import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { auth } from "@/auth";
import { Role } from "@prisma/client";
import { getPlatformSettings } from "@/lib/actions/settings-actions";
import { AdminSettingsForm } from "@/components/admin/admin-settings-form";

export const metadata: Metadata = {
  title: "إعدادات المنصة",
};

export default async function AdminSettingsPage() {
  const session = await auth();
  if (!session?.user || session.user.role !== Role.ADMIN) {
    redirect("/dashboard");
  }

  const settings = await getPlatformSettings();

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold">إعدادات المنصة</h1>
        <p className="mt-1 text-muted-foreground">
          التحكم الكامل بالاسم والشعار وإعدادات الشهادات
        </p>
      </div>

      <AdminSettingsForm
        initialPlatformName={settings.platformName}
        initialLogoUrl={settings.logoUrl}
        initialUseTemplateMode={settings.useTemplateMode}
      />
    </div>
  );
}
