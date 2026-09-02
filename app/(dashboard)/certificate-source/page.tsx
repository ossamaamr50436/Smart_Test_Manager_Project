import type { Metadata } from "next";
import { RolePlaceholder } from "@/components/dashboard/role-placeholder";

export const metadata: Metadata = { title: "لوحة مصدر الشهادات" };

export default function CertificateSourceDashboardPage() {
  return (
    <RolePlaceholder
      title="لوحة مصدر الشهادات"
      description="الاطلاع على الطلاب الذين أكملوا جميع المراحل فقط، وإصدار الشهادات."
    />
  );
}