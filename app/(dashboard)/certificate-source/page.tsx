import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { getCurrentUser } from "@/lib/actions/auth-actions";
import { prisma } from "@/lib/prisma";
import { Role, StudentStatus } from "@prisma/client";
import { getTenantFilter } from "@/lib/tenancy";
import { CertificateTable } from "@/components/certificate-source/certificate-table";

export const metadata: Metadata = {
  title: "إصدار الشهادات",
};

export default async function CertificateSourceDashboardPage() {
  const user = await getCurrentUser();

  // عزل الصلاحيات: صفحة خاصة بمصدر الشهادات (المادة 8/5)
  if (!user || user.role !== Role.CERTIFICATE_SOURCE) {
    redirect("/");
  }

  // 1) الطلاب الجاهزون — بانتظار رفع الشهادة من مصدر الشهادات
  const readyStudents = await prisma.student.findMany({
    where: { ...getTenantFilter(user), status: StudentStatus.READY_FOR_CERTIFICATE },
    include: {
      institution: { select: { name: true } },
      examSessions: {
        include: {
          assessments: {
            where: {
              status: {
                in: ["APPROVED", "ACCEPTED", "NOTIFIED"],
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

  const readyRows = readyStudents.map((student) => {
    const assessment = student.examSessions[0]?.assessments[0];
    return {
      id: student.id,
      name: student.name,
      branch: student.branch,
      institutionName: student.institution.name,
      finalScore: assessment?.finalScore ?? null,
    };
  });

  // 2) الشهادات المرفوعة فعلياً — بانتظار الإرسال للجهة
  const uploaded = await prisma.certificate.findMany({
    where: { ...getTenantFilter(user), status: "UPLOADED" },
    include: { student: { select: { name: true, branch: true } } },
    orderBy: { issuedDate: "desc" },
    take: 50,
  });

  // 3) الشهادات المُرسَلة — أرشيف
  const sent = await prisma.certificate.findMany({
    where: { ...getTenantFilter(user), status: "SENT" },
    include: { student: { select: { name: true, branch: true } } },
    orderBy: { sentAt: "desc" },
    take: 50,
  });

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold">لوحة مصدر الشهادات</h1>
        <p className="mt-1 text-muted-foreground">
          النظام وسيط إرسال فقط — الشهادة تُصدر من الجمعية، تُرفع هنا ثم تُرسَل للجهة التعليمية
        </p>
      </div>

      <CertificateTable
        readyStudents={readyRows}
        uploadedCertificates={uploaded.map((c) => ({
          id: c.id,
          serialNumber: c.serialNumber,
          studentName: c.student.name,
          branch: c.student.branch,
          finalScore: c.finalScore,
          fileUrl: c.fileUrl,
          issuedDate: c.issuedDate,
          sentAt: c.sentAt,
        }))}
        sentCertificates={sent.map((c) => ({
          id: c.id,
          serialNumber: c.serialNumber,
          studentName: c.student.name,
          branch: c.student.branch,
          finalScore: c.finalScore,
          fileUrl: c.fileUrl,
          issuedDate: c.issuedDate,
          sentAt: c.sentAt,
        }))}
      />
    </div>
  );
}
