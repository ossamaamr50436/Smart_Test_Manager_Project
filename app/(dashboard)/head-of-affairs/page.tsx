import type { Metadata } from "next";
import { RolePlaceholder } from "@/components/dashboard/role-placeholder";

export const metadata: Metadata = { title: "لوحة رئيس الشؤون" };

export default function HeadOfAffairsDashboardPage() {
  return (
    <RolePlaceholder
      title="لوحة رئيس الشؤون التعليمية"
      description="اعتماد الدرجات النهائية للطلاب المكتملين وإرسال الإشعارات."
    />
  );
}