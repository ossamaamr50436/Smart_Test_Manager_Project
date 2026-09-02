import type { Metadata } from "next";
import { RolePlaceholder } from "@/components/dashboard/role-placeholder";

export const metadata: Metadata = { title: "لوحة المسؤول" };

export default function AdminDashboardPage() {
  return (
    <RolePlaceholder
      title="لوحة المسؤول"
      description="تحكم كامل بالمنصة والمستخدمين والبيانات، مع تسجيل أي تدخل في Audit Log."
    />
  );
}