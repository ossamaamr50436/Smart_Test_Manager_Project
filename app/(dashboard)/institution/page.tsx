import type { Metadata } from "next";
import { RolePlaceholder } from "@/components/dashboard/role-placeholder";

export const metadata: Metadata = { title: "لوحة الجهة التعليمية" };

export default function InstitutionDashboardPage() {
  return (
    <RolePlaceholder
      title="لوحة الجهة التعليمية"
      description="سيبقى الاطلاع هنا على طلابك المرشحين فقط، وترشيح طلاب جدد، وتتبع الحالة."
    />
  );
}