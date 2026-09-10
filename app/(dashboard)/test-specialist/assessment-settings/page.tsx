import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { getCurrentUser } from "@/lib/actions/auth-actions";
import { Role } from "@prisma/client";
import { getAssessmentSettings } from "@/lib/actions/assessment-settings-actions";
import { AssessmentSettingsForm } from "@/components/specialist/assessment-settings-form";

export const metadata: Metadata = {
  title: "إعدادات التقييم",
};

export default async function AssessmentSettingsPage() {
  const user = await getCurrentUser();

  if (!user || (user.role !== Role.TEST_SPECIALIST && user.role !== Role.ADMIN)) {
    redirect("/test-specialist");
  }

  const settings = await getAssessmentSettings();

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold">إعدادات التقييم</h1>
        <p className="mt-1 text-muted-foreground">
          اضبط قيم الخصومات المستخدمة في التقييم التفاعلي للمختبرين
        </p>
      </div>

      <AssessmentSettingsForm settings={settings} />
    </div>
  );
}
