import type { Metadata } from "next";
import { requireUser, requireRole } from "@/lib/security";
import { Role } from "@prisma/client";
import { getExaminerStats } from "@/lib/db.reports";
import { ReportsDashboard, type StatCard } from "@/components/reports/reports-dashboard";

export const metadata: Metadata = { title: "تقاريري" };

export const dynamic = "force-dynamic";

export default async function ExaminerReportsPage() {
  const user = await requireUser();
  requireRole(user, [Role.EXAMINER]);

  const stats = await getExaminerStats(user.id);

  const statCards: StatCard[] = [
    { label: "جلسات لجانك", value: stats.totalSessions, hint: "مجموع الجلسات الموزعة عليك" },
    { label: "الجلسات المنجزة", value: stats.completed },
    { label: "التقييمات التي أدخلتها", value: stats.evaluations },
    { label: "متوسط درجاتك", value: stats.avgScore ?? "—", hint: "من 100 (معتمدة فقط)" },
  ];

  const rows = stats.latest.map((s) => ({
    الطالب: s.studentName,
    الجهة: s.institution,
    الفرع: `${s.branch} أجزاء`,
    التاريخ: s.date?.toLocaleDateString("ar-SA") ?? "—",
    الحالة: s.status,
  }));

  return (
    <ReportsDashboard
      title="تقارير المختبر"
      subtitle="ملخص أدائك في اللجان — تُحسب التقييمات من 100 وفق اللائحة."
      statCards={statCards}
      bars={[
        { label: "جلسات مجدولة", count: stats.scheduled, color: "bg-sky-500" },
        { label: "جلسات مكتملة", count: stats.completed, color: "bg-emerald-500" },
        { label: "تقييماتي", count: stats.evaluations, color: "bg-primary" },
      ]}
      columns={[
        { key: "الطالب", label: "الطالب" },
        { key: "الجهة", label: "الجهة" },
        { key: "الفرع", label: "الفرع" },
        { key: "التاريخ", label: "التاريخ" },
        { key: "الحالة", label: "الحالة" },
      ]}
      rows={rows}
      csvFileName="report-examiner"
    />
  );
}