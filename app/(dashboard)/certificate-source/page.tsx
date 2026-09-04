import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { getCurrentUser } from "@/lib/actions/auth-actions";
import { prisma } from "@/lib/prisma";
import { Role, StudentStatus } from "@prisma/client";
import { CertificateTable } from "@/components/certificate-source/certificate-table";

export const metadata: Metadata = {
  title: "إصدار الشهادات",
};

export default async function CertificateSourceDashboardPage() {
  const user = await getCurrentUser();

  // عزل الصلاحيات: صفحة خاصة بمصدر الشهادات (المادة 8/5)
  if (!user || user.role !== Role.CERTIFICATE_SOURCE) {
    redirect("/dashboard");
  }

  // الطلاب الجاهزون لإصدار الشهادة (أكملوا جميع المراحل)
  const readyStudents = await prisma.student.findMany({
    where: { status: StudentStatus.READY_FOR_CERTIFICATE },
    include: {
      institution: { select: { name: true } },
      examSessions: {
        include: {
          assessments: {
            where: {
              status: {
                in: ["FINALIZED", "ACCEPTED", "NOTIFIED"],
              },
            },
            select: { finalScore: true },
            orderBy: { updatedAt: "desc" },
            take: 1,
          },
        },
      },
    },
    orderBy: { updatedAt: "desc" },
  });

  const rows = readyStudents.map((student) => {
    const assessment = student.examSessions[0]?.assessments[0];
    return {
      id: student.id,
      name: student.name,
      branch: student.branch,
      institutionName: student.institution.name,
      finalScore: assessment?.finalScore ?? null,
    };
  });

  // الشهادات الصادرة مؤخراً (عرض مباشر من قاعدة البيانات — بدون بيانات وهمية)
  const issuedCertificates = await prisma.certificate.findMany({
    where: { status: { in: ["UPLOADED", "SIGNED", "SENT"] } },
    include: {
      student: {
        select: { name: true, branch: true },
      },
    },
    orderBy: { createdAt: "desc" },
    take: 50,
  });

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold">لوحة مصدر الشهادات</h1>
        <p className="mt-1 text-muted-foreground">
          الطلاب الذين أكملوا جميع المراحل فقط — إصدار الشهادات ورفعها على Google Drive
        </p>
      </div>

      <CertificateTable
        readyStudents={rows}
        issuedCertificates={issuedCertificates.map((c) => ({
          id: c.id,
          serialNumber: c.serialNumber,
          studentName: c.student.name,
          branch: c.student.branch,
          finalScore: c.finalScore,
          fileUrl: c.fileUrl,
          issuedDate: c.issuedDate,
        }))}
      />
    </div>
  );
}