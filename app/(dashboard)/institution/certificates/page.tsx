import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { getCurrentUser } from "@/lib/actions/auth-actions";
import { prisma } from "@/lib/prisma";
import { Role, CertificateStatus } from "@prisma/client";
import { InstitutionCertificatesClient } from "@/components/certificates/institution-certificates-client";

export const metadata: Metadata = {
  title: "شهادات الطلاب",
};

export const dynamic = "force-dynamic";

export type CertificateRow = {
  id: string;
  serialNumber: string;
  finalScore: number;
  issuedDate: Date | null;
  status: CertificateStatus;
  fileUrl: string | null;
  studentName: string;
  branch: string;
};

export default async function InstitutionCertificatesPage() {
  const user = await getCurrentUser();

  if (!user || user.role !== Role.INSTITUTION) {
    redirect("/");
  }

  const certificates = user.institutionId
    ? await prisma.certificate.findMany({
        where: { student: { institutionId: user.institutionId } },
        orderBy: [{ issuedDate: "desc" }, { createdAt: "desc" }],
        select: {
          id: true,
          serialNumber: true,
          finalScore: true,
          issuedDate: true,
          status: true,
          fileUrl: true,
          student: { select: { name: true, branch: true } },
        },
      })
    : [];

  const rows: CertificateRow[] = certificates.map((c) => ({
    id: c.id,
    serialNumber: c.serialNumber,
    finalScore: c.finalScore,
    issuedDate: c.issuedDate,
    status: c.status,
    fileUrl: c.fileUrl,
    studentName: c.student.name,
    branch: c.student.branch,
  }));

  const total = rows.length;
  const pendingSignature = rows.filter((c) => c.status === CertificateStatus.PENDING).length;
  const sent = rows.filter((c) => c.status === CertificateStatus.SENT).length;

  const years = Array.from(
    new Set(
      rows
        .map((c) => c.issuedDate?.getFullYear())
        .filter((y): y is number => typeof y === "number")
        .sort((a, b) => b - a)
    )
  );

  const branches = Array.from(new Set(rows.map((c) => c.branch))).sort();

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold">شهادات الطلاب</h1>
        <p className="mt-1 text-muted-foreground">
          عرض شهادات طلاب جهتك التعليمية وفلترتها وتحميلها
        </p>
      </div>

      <InstitutionCertificatesClient
        certificates={rows}
        stats={{ total, pendingSignature, sent }}
        years={years}
        branches={branches}
      />
    </div>
  );
}