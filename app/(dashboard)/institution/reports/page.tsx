import type { Metadata } from "next";
import { requireUser, requireRole } from "@/lib/security";
import { Role } from "@prisma/client";
import { getInstitutionStats } from "@/lib/db.reports";
import { ReportsDashboard, type StatCard } from "@/components/reports/reports-dashboard";

export const metadata: Metadata = { title: "تقارير الجهة" };

export const dynamic = "force-dynamic";

export default async function InstitutionReportsPage() {
  const user = await requireUser();
  requireRole(user, [Role.INSTITUTION]);

  // عزل صارم: الإحصاءات مقيدة بجهة المستخدم فقط (المادة 8/1)
  if (!user.institutionId) {
    throw new Error("حساب الجهة غير مرتبط بجهة تعليمية — تواصل مع المسؤول");
  }
  const stats = await getInstitutionStats(user.institutionId);

  const statCards: StatCard[] = [
    { label: "طلاب جهتك", value: stats.students },
    { label: "متوسط الدرجات", value: stats.avgScore ?? "—", hint: "للتقييمات المعتمدة" },
    { label: "نسبة الاجتياز", value: stats.passRate === null ? "—" : `${stats.passRate}%` },
    { label: "التقييمات", value: stats.evaluations },
  ];

  return (
    <ReportsDashboard
      title="تقارير الجهة التعليمية"
      subtitle="إحصاءات طلاب جهتك فقط — لا تظهر بيانات أي جهة أخرى."
      statCards={statCards}
      bars={stats.byBranch.map((b) => ({ label: `${b.branch} أجزاء`, count: b.count }))}
      columns={[]}
      rows={[]}
      csvFileName="report-institution"
    />
  );
}