// ============================================================
// طبقة التقارير والتحليلات
// استعلامات مجمّعة (Aggregates) خفيفة بالاعتماد على فهارس Prisma
// ============================================================
import { prisma } from "@/lib/prisma";
import { StudentStatus } from "@prisma/client";

/** فئات الدرجات وفق لائحة الخاتمين (الاجتياز 80) */
export type ScoreBand = {
  label: string;
  min: number;
  max: number;
  color: string;
};

export const SCORE_BANDS: ScoreBand[] = [
  { label: "ممتاز", min: 95, max: 100, color: "bg-emerald-500" },
  { label: "جيد جداً", min: 90, max: 94, color: "bg-lime-500" },
  { label: "جيد", min: 85, max: 89, color: "bg-amber-500" },
  { label: "مقبول", min: 80, max: 84, color: "bg-orange-500" },
  { label: "دون الاجتياز", min: 0, max: 79, color: "bg-red-500" },
];

export type BandCount = { label: string; color: string; count: number };

export type PerformanceOverview = {
  totalStudents: number;
  byStatus: Record<StudentStatus, number>;
  byBranch: { branch: string; count: number }[];
  scoreBands: BandCount[];
  passRate: number;
  avgScore: number | null;
};

/**
 * نظرة عامة على الأداء لجميع الجهات (للمسؤول والأخصائي ورئيس الشؤون)
 */
export async function getPerformanceOverview(): Promise<PerformanceOverview> {
  const [totalStudents, byStatus, byBranch, finalizedAgg, bandAgg] =
    await Promise.all([
      prisma.student.count(),
      prisma.student.groupBy({ by: ["status"], _count: { _all: true } }),
      prisma.student.groupBy({ by: ["branch"], _count: { _all: true } }),
      prisma.assessment.aggregate({
        where: { status: { in: ["APPROVED", "ACCEPTED", "NOTIFIED"] } },
        _count: { _all: true },
        _avg: { finalScore: true },
      }),
      prisma.assessment.groupBy({
        by: ["finalScore"],
        where: { status: { in: ["APPROVED", "ACCEPTED", "NOTIFIED"] } },
        _count: { _all: true },
      }),
    ]);

  const statusMap = {} as Record<StudentStatus, number>;
  for (const s of Object.values(StudentStatus)) statusMap[s] = 0;
  for (const row of byStatus) statusMap[row.status as StudentStatus] = row._count._all;
  const grossAttempts = bandAgg.reduce((acc, r) => acc + r._count._all, 0);
  const finalCount = finalizedAgg._count._all;

  const scoreBands: BandCount[] = SCORE_BANDS.map((band) => ({
    label: band.label,
    color: band.color,
    count: bandAgg
      .filter((r) => r.finalScore >= band.min && r.finalScore <= band.max)
      .reduce((acc, r) => acc + r._count._all, 0),
  }));

  return {
    totalStudents,
    byStatus: statusMap,
    byBranch: byBranch.map((b) => ({ branch: b.branch, count: b._count._all })),
    scoreBands,
    passRate: grossAttempts > 0 ? Math.round((scoreBands.slice(0, 4).reduce((a, b) => a + b.count, 0) / grossAttempts) * 100) : 0,
    avgScore: finalCount > 0 ? Math.round((finalizedAgg._avg.finalScore ?? 0) * 10) / 10 : null,
  };
}

/**
 * إحصائيات جهة تعليمية (للجهة نفسها — عزل: جميع القوائم مفلترة بـ institutionId)
 */
export async function getInstitutionStats(institutionId: string) {
  const [students, byStatus, byBranch, assessments] = await Promise.all([
    prisma.student.count({ where: { institutionId } }),
    prisma.student.groupBy({
      where: { institutionId },
      by: ["status"],
      _count: { _all: true },
    }),
    prisma.student.groupBy({
      where: { institutionId },
      by: ["branch"],
      _count: { _all: true },
    }),
    prisma.assessment.findMany({
      where: {
        status: { in: ["APPROVED", "FINALIZED"] },
        examSession: { student: { institutionId } },
      },
      select: { finalScore: true },
    }),
  ]);

  const avg =
    assessments.length > 0
      ? Math.round(
          (assessments.reduce((acc, a) => acc + a.finalScore, 0) / assessments.length) * 10
        ) / 10
      : null;

  const passed = assessments.filter((a) => a.finalScore >= 80).length;
  const statusMap = {} as Record<StudentStatus, number>;
  for (const s of Object.values(StudentStatus)) statusMap[s] = 0;
  for (const row of byStatus) statusMap[row.status as StudentStatus] = row._count._all;

  return {
    students,
    byStatus: statusMap,
    byBranch: byBranch.map((b) => ({ branch: b.branch, count: b._count._all })),
    avgScore: avg,
    passRate: assessments.length > 0 ? Math.round((passed / assessments.length) * 100) : null,
    evaluations: assessments.length,
  };
}

/**
 * إحصائيات مختبر (معلم) — عدد تقييماته ومتوسط الدرجات
 * (عزل: الجلسات التي هو معلم أول أو ثانٍ فيها)
 */
export async function getExaminerStats(examinerId: string) {
  const sessions = await prisma.examSession.findMany({
    where: {
      OR: [{ teacher1Id: examinerId }, { teacher2Id: examinerId }],
    },
    select: {
      id: true,
      status: true,
      examDate: true,
      student: { select: { name: true, branch: true, institution: { select: { name: true } } } },
      assessments: { select: { finalScore: true, status: true, evaluatorId: true } },
    },
    orderBy: { examDate: "desc" },
  });

  const ownAssessments = sessions
    .flatMap((s) => s.assessments)
    .filter((a) => a.evaluatorId === examinerId);

  const scores = ownAssessments.filter((a) => a.status !== "DRAFT").map((a) => a.finalScore);
  const avg = scores.length > 0 ? Math.round((scores.reduce((a, b) => a + b, 0) / scores.length) * 10) / 10 : null;

  return {
    totalSessions: sessions.length,
    scheduled: sessions.filter((s) => s.status === "SCHEDULED").length,
    completed: sessions.filter((s) => s.status === "COMPLETED").length,
    evaluations: ownAssessments.length,
    avgScore: avg,
    latest: sessions.slice(0, 10).map((s) => ({
      studentName: s.student.name,
      branch: s.student.branch,
      institution: s.student.institution?.name ?? "",
      date: s.examDate,
      status: s.status,
    })),
  };
}