import type { Metadata } from "next";
import { RolePlaceholder } from "@/components/dashboard/role-placeholder";

export const metadata: Metadata = { title: "لوحة المختبر" };

export default function ExaminerDashboardPage() {
  return (
    <RolePlaceholder
      title="لوحة المختبر (المعلم)"
      description="سيتطلع هنا على الطلاب الموزعين على لجنتك فقط، وتسجيل التقييم."
    />
  );
}