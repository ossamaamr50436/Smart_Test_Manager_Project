import type { Metadata } from "next";
import { requireUser, requireRole } from "@/lib/security";
import { Role } from "@prisma/client";
import { getPerformanceOverview, SCORE_BANDS } from "@/lib/db.reports";
import { ReportsDashboard, type StatCard } from "@/components/reports/reports-dashboard";

export const metadata: Metadata = { title: "التقارير والتحليلات" };

export const dynamic = "force-dynamic";

const STATUS_LABELS: Record<string, string> = {
  PENDING: "بانتظار المراجعة",
  APPROVED: "مقبول",
  REJECTED: "مرفوض",
  ASSIGNED: "موزع على لجنة",
  COMPLETED: "اكتمل تقييمه",
  NOTIFIED: "اعتمده الأخصائي",
  READY_FOR_CERTIFICATE: "جاهز للشهادة",
  CERTIFICATE_ISSUED: "صدرت شهادته",
};

export default async function AdminReportsPage() {
  const user = await requireUser();
  requireRole(user, [Role.ADMIN, Role.TEST_SPECIALIST, Role.HEAD_OF_AFFAIRS]);

  const overview = await getPerformanceOverview();

  const statCards: StatCard[] = [
    { label: "إجمالي الطلاب", value: overview.totalStudents },
    { label: "متوسط الدرجات", value: overview.avgScore ?? "—", hint: "للتقييمات المعتمدة" },
    { label: "نسبة الاجتياز", value: `${overview.passRate}%`, hint: "من التقييمات المكتملة" },
    { label: "مكتمل التقييم", value: overview.byStatus.COMPLETED },
  ];

  const rows = Object.entries(overview.byStatus).map(([status, count]) => ({
    الحالة: STATUS_LABELS[status] ?? status,
    العدد: count,
  }));

  return (
    <ReportsDashboard
      title="التقارير والتحليلات"
      subtitle="نظرة شاملة على أداء الجمعية: التوزيع حسب الحالة والفرع ودرجات اللائحة (100)."
      statCards={statCards}
      bars={[
        ...overview.byBranch.map((b) => ({ label: `${b.branch} أجزاء`, count: b.count })),
        ...overview.scoreBands.filter((s) => s.count > 0).map((s) => ({ label: s.label, count: s.count, color: s.color })),
      ]}
      columns={[{ key: "الحالة", label: "الحالة" }, { key: "العدد", label: "العدد" }]}
      rows={rows}
      csvFileName="report-overview"
    />
  );
}