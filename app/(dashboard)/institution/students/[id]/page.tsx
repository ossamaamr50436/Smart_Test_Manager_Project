import type { Metadata } from "next";
import { notFound, redirect } from "next/navigation";
import { getCurrentUser } from "@/lib/actions/auth-actions";
import { assertCanAccessStudent } from "@/lib/security";
import { prisma } from "@/lib/prisma";
import { Role, StudentStatus, CertificateStatus } from "@prisma/client";
import { getBranchLabel } from "@/lib/utils";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import {
  StudentTimeline,
  formatTimelineDate,
  type TimelineStep,
} from "@/components/students/student-timeline";

export const metadata: Metadata = {
  title: "بيانات الطالب",
};

export const dynamic = "force-dynamic";

const STATUS_LABELS: Record<string, string> = {
  PENDING: "بانتظار المراجعة",
  APPROVED: "مقبول",
  REJECTED: "مرفوض",
  ASSIGNED: "تم توزيعه على لجنة",
  COMPLETED: "اكتمل تقييمه",
  NOTIFIED: "بانتظار اعتماد رئيس الشؤون",
  READY_FOR_CERTIFICATE: "جاهز لإصدار الشهادة",
  CERTIFICATE_ISSUED: "صدرت شهادته",
};

const CERT_STATUS_LABELS: Record<string, string> = {
  PENDING: "بانتظار التوقيع",
  SIGNED: "موقّعة",
  UPLOADED: "مرفوعة",
  SENT: "مُرسَلة",
};

const REVIEW_CONCLUDED_STATUSES: StudentStatus[] = [
  StudentStatus.APPROVED,
  StudentStatus.ASSIGNED,
  StudentStatus.COMPLETED,
  StudentStatus.NOTIFIED,
  StudentStatus.REJECTED,
  StudentStatus.REJECTED_BY_HEAD,
  StudentStatus.READY_FOR_CERTIFICATE,
  StudentStatus.CERTIFICATE_ISSUED,
];

const FINAL_APPROVAL_STATUSES: StudentStatus[] = [
  StudentStatus.READY_FOR_CERTIFICATE,
  StudentStatus.CERTIFICATE_ISSUED,
];

export default async function StudentDetailsPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const user = await getCurrentUser();

  if (!user) {
    redirect("/login");
  }

  if (user.role !== Role.INSTITUTION) {
    redirect("/");
  }

  const student = await assertCanAccessStudent(user, id);

  const full = await prisma.student.findUnique({
    where: { id },
    select: {
      id: true,
      name: true,
      age: true,
      branch: true,
      nationality: true,
      teacherName: true,
      parentPhone: true,
      phone: true,
      address: true,
      status: true,
      createdAt: true,
      approvedAt: true,
      assignedAt: true,
      finalizedAt: true,
      committeeId: true,
      committee: { select: { name: true } },
      submittedById: true,
      submittedBy: { select: { name: true, role: true } },
      institution: { select: { name: true } },
      applicationFileUrl: true,
      examSessions: {
        orderBy: { examDate: "desc" },
        select: {
          id: true,
          examDate: true,
          period: true,
          assessments: {
            orderBy: { updatedAt: "desc" },
            select: {
              id: true,
              finalScore: true,
              recitationScore: true,
              tajweedScore: true,
              status: true,
              updatedAt: true,
            },
          },
        },
      },
      certificates: {
        orderBy: { issuedDate: "desc" },
        select: {
          id: true,
          serialNumber: true,
          finalScore: true,
          issuedDate: true,
          status: true,
          fileUrl: true,
        },
      },
    },
  });

  if (!full) {
    notFound();
  }

  const nominationSource = full.submittedById
    ? `أخصائي الاختبارات (${full.submittedBy?.name ?? "—"})`
    : "الجهة التعليمية";

  const latestSession = full.examSessions[0] ?? null;
  const finalAssessment = latestSession?.assessments.find(
    (a) => a.status === "NOTIFIED" || a.status === "ACCEPTED" || a.status === "APPROVED"
  ) ?? latestSession?.assessments[0] ?? null;

  const certificate = full.certificates[0] ?? null;

  const isReviewConcluded = REVIEW_CONCLUDED_STATUSES.includes(full.status);
  const hasCommittee = Boolean(full.committeeId);
  const hasExamSession = full.examSessions.length > 0;
  const hasFinalScore = Boolean(finalAssessment && finalAssessment.finalScore > 0);
  const isFinalApproved =
    Boolean(full.finalizedAt) || FINAL_APPROVAL_STATUSES.includes(full.status);
  const hasCertificate = full.certificates.length > 0;

  const steps: TimelineStep[] = [
    {
      id: "nomination",
      title: "ترشيح الطالب",
      date: full.createdAt,
      description: `بواسطة: ${nominationSource} — الجهة: ${full.institution?.name ?? "—"}`,
      done: true,
      icon: "nomination",
    },
    {
      id: "nomination-review",
      title: "مراجعة الترشيح",
      date: full.approvedAt,
      description: isReviewConcluded
        ? "انتهت مراجعة الترشيح من أخصائي الاختبارات"
        : "بانتظار الترشيح — في انتظار مراجعة أخصائي الاختبارات",
      done: isReviewConcluded,
      icon: "waiting",
    },
    {
      id: "approval",
      title: "قبول الترشيح",
      date: full.approvedAt,
      description:
        full.status === StudentStatus.REJECTED || full.status === StudentStatus.REJECTED_BY_HEAD
          ? "تم رفض الترشيح"
          : "قرار أخصائي الاختبارات",
      done: isReviewConcluded && full.status !== StudentStatus.REJECTED && full.status !== StudentStatus.REJECTED_BY_HEAD,
      icon: "approval",
    },
    {
      id: "assignment",
      title: "التوزيع على لجنة",
      date: full.assignedAt,
      description: full.committee?.name
        ? `اللجنة: ${full.committee.name}`
        : "تشكيل لجنة الاختبار",
      done: hasCommittee,
      icon: "assignment",
    },
    {
      id: "exam",
      title: "الاختبار (الجلسة)",
      date: latestSession?.examDate ?? null,
      description: latestSession
        ? `الفترة: ${latestSession.period}`
        : "لم تُسجَّل جلسة اختبار بعد",
      done: hasExamSession,
      icon: "exam",
    },
    {
      id: "score",
      title: "الدرجة النهائية",
      date: finalAssessment?.updatedAt ?? null,
      description: finalAssessment
        ? `الدرجة: ${finalAssessment.finalScore.toFixed(2)} / 100`
        : undefined,
      done: hasFinalScore,
      icon: "score",
    },
    {
      id: "final",
      title: "الاعتماد النهائي",
      date: full.finalizedAt,
      description: "اعتماد رئيس الشؤون التعليمية",
      done: isFinalApproved,
      icon: "final",
    },
    {
      id: "certificate",
      title: "إصدار الشهادة",
      date: certificate?.issuedDate ?? null,
      description: certificate
        ? `رقم الشهادة: ${certificate.serialNumber} — الحالة: ${CERT_STATUS_LABELS[certificate.status] ?? certificate.status}`
        : undefined,
      done: hasCertificate,
      icon: "certificate",
    },
  ];

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold">{full.name}</h1>
        <p className="mt-1 text-muted-foreground">
          عرض الخط الزمني الكامل للطالب داخل جهتك التعليمية
        </p>
      </div>

      <div className="grid gap-6 lg:grid-cols-3">
        <div className="space-y-6 lg:col-span-2">
          <Card>
            <CardHeader>
              <CardTitle className="text-base">الخط الزمني</CardTitle>
              <CardDescription>
                مراحل رحلة الطالب من الترشيح حتى الشهادة
              </CardDescription>
            </CardHeader>
            <CardContent>
              <StudentTimeline steps={steps} />
            </CardContent>
          </Card>
        </div>

        <div className="space-y-6">
          <Card>
            <CardHeader>
              <CardTitle className="text-base">بيانات الطالب</CardTitle>
            </CardHeader>
            <CardContent className="space-y-3 text-sm">
              <div className="flex justify-between gap-2">
                <span className="text-muted-foreground">الحالة</span>
                <span className="inline-flex rounded-full bg-secondary-100 px-2 py-0.5 text-xs font-medium text-primary-700">
                  {STATUS_LABELS[full.status] ?? full.status}
                </span>
              </div>
              <div className="flex justify-between gap-2">
                <span className="text-muted-foreground">العمر</span>
                <span>{full.age} سنة</span>
              </div>
              <div className="flex justify-between gap-2">
                <span className="text-muted-foreground">الفرع</span>
                <span>{getBranchLabel(full.branch)}</span>
              </div>
              <div className="flex justify-between gap-2">
                <span className="text-muted-foreground">الجنسية</span>
                <span>{full.nationality || "—"}</span>
              </div>
              <div className="flex justify-between gap-2">
                <span className="text-muted-foreground">اسم المعلم</span>
                <span>{full.teacherName}</span>
              </div>
              <div className="flex justify-between gap-2">
                <span className="text-muted-foreground">رقم ولي الأمر</span>
                <span dir="ltr">{full.parentPhone}</span>
              </div>
              {full.phone && (
                <div className="flex justify-between gap-2">
                  <span className="text-muted-foreground">رقم الطالب</span>
                  <span dir="ltr">{full.phone}</span>
                </div>
              )}
              {full.address && (
                <div className="flex justify-between gap-2">
                  <span className="text-muted-foreground">العنوان</span>
                  <span>{full.address}</span>
                </div>
              )}
              <div className="flex justify-between gap-2">
                <span className="text-muted-foreground">الجهة التعليمية</span>
                <span>{full.institution?.name ?? "—"}</span>
              </div>
              <div className="flex justify-between gap-2">
                <span className="text-muted-foreground">من رشّح</span>
                <span>{nominationSource}</span>
              </div>
            </CardContent>
          </Card>

          {certificate && certificate.fileUrl && (
            <Card>
              <CardHeader>
                <CardTitle className="text-base">الشهادة</CardTitle>
              </CardHeader>
              <CardContent className="space-y-2">
                <p className="text-sm text-muted-foreground">
                  الحالة: {CERT_STATUS_LABELS[certificate.status] ?? certificate.status}
                </p>
                <p className="text-sm text-muted-foreground">
                  تاريخ الإصدار: {formatTimelineDate(certificate.issuedDate)}
                </p>
                <a
                  href={certificate.fileUrl}
                  target="_blank"
                  rel="noreferrer"
                  className="inline-flex items-center rounded-md bg-primary px-3 py-2 text-sm font-medium text-primary-foreground hover:bg-primary/90"
                >
                  عرض / تحميل الشهادة (PDF)
                </a>
              </CardContent>
            </Card>
          )}
        </div>
      </div>
    </div>
  );
}