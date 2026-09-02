import type { Metadata } from "next";
import { RolePlaceholder } from "@/components/dashboard/role-placeholder";

export const metadata: Metadata = { title: "لوحة الأخصائي" };

export default function TestSpecialistDashboardPage() {
  return (
    <RolePlaceholder
      title="لوحة أخصائي الاختبارات"
      description="إدارة الطلبات، تشكيل اللجان، تحديد المواعيد، واعتماد التقييمات."
    />
  );
}