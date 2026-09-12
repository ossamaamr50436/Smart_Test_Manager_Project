import type { Metadata } from "next";
import { getPlatformSettings } from "@/lib/actions/settings-actions";
import { AdminSettingsForm } from "@/components/admin/admin-settings-form";
import { requireUser, requireRole } from "@/lib/security";
import { Role } from "@prisma/client";

export const metadata: Metadata = {
  title: "إعدادات المنصة",
};

export const dynamic = "force-dynamic";

export default async function AdminSettingsPage() {
  const user = await requireUser();
  requireRole(user, [Role.ADMIN]);

  const settings = await getPlatformSettings();

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold">إعدادات المنصة</h1>
        <p className="mt-1 text-muted-foreground">
          التحكم الكامل بالاسم والشعار والألوان ورقم الدعم الفني والوضع المظلم وإعدادات الشهادات
        </p>
      </div>

      <AdminSettingsForm
        initialPlatformName={settings.platformName}
        initialLogoUrl={settings.logoUrl}
        initialUseTemplateMode={settings.useTemplateMode}
        initialPrimaryColor={settings.primaryColor}
        initialSecondaryColor={settings.secondaryColor}
        initialWhatsappNumber={settings.whatsappNumber}
        initialDarkModeEnabled={settings.darkModeEnabled}
        initialRequireStudentApplicationFile={settings.requireStudentApplicationFile}
        initialShowTutorialSection={settings.showTutorialSection}
      />
    </div>
  );
}
