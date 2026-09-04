"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { generateCertificate } from "@/lib/actions/certificate-actions";

type ReadyStudent = {
  id: string;
  name: string;
  branch: string;
  institutionName: string;
  finalScore: number | null;
};

type IssuedCertificate = {
  id: string;
  serialNumber: string;
  studentName: string;
  branch: string;
  finalScore: number;
  fileUrl: string | null;
  issuedDate: Date | null;
};

export function CertificateTable({
  readyStudents,
  issuedCertificates,
}: {
  readyStudents: ReadyStudent[];
  issuedCertificates: IssuedCertificate[];
}) {
  const router = useRouter();
  const [isPending, startTransition] = useTransition();
  const [pendingId, setPendingId] = useState<string | null>(null);
  const [error, setError] = useState("");
  const [success, setSuccess] = useState("");

  async function handleIssue(studentId: string) {
    setPendingId(studentId);
    setError("");
    setSuccess("");
    startTransition(async () => {
      try {
        const result = await generateCertificate(studentId);
        setSuccess(`تم إصدار الشهادة بنجاح ${result.serialNumber}`);
        router.refresh();
      } catch (e) {
        setError(e instanceof Error ? e.message : "تعذر إصدار الشهادة");
      } finally {
        setPendingId(null);
      }
    });
  }

  return (
    <div className="space-y-6">
      {error && (
        <p className="rounded-md border border-destructive/20 bg-destructive/10 px-4 py-3 text-sm text-destructive">
          {error}
        </p>
      )}
      {success && (
        <p className="rounded-md border border-primary/20 bg-primary/10 px-4 py-3 text-sm text-primary">
          {success}
        </p>
      )}

      <Card>
        <CardHeader>
          <CardTitle className="text-base">بانتظار إصدار الشهادة</CardTitle>
          <CardDescription>
            {readyStudents.length} طالب جاهز لإصدار الشهادة
          </CardDescription>
        </CardHeader>
        <CardContent>
          {readyStudents.length === 0 ? (
            <p className="py-8 text-center text-sm text-muted-foreground">
              لا يوجد طلاب جاهزون لإصدار الشهادة حالياً
            </p>
          ) : (
            <div className="space-y-2">
              {readyStudents.map((student) => (
                <div
                  key={student.id}
                  className="flex flex-wrap items-center justify-between gap-3 rounded-lg border px-4 py-3"
                >
                  <div>
                    <p className="font-medium">{student.name}</p>
                    <p className="text-xs text-muted-foreground">
                      {student.branch} أجزاء — {student.institutionName}
                    </p>
                  </div>
                  <div className="flex items-center gap-3">
                    <p className="text-sm font-semibold">
                      {student.finalScore !== null
                        ? `${student.finalScore} / 20`
                        : "—"}
                    </p>
                    <Button
                      size="sm"
                      disabled={isPending}
                      onClick={() => handleIssue(student.id)}
                    >
                      {isPending && pendingId === student.id
                        ? "جارٍ الإصدار..."
                        : "إصدار الشهادة"}
                    </Button>
                  </div>
                </div>
              ))}
            </div>
          )}
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle className="text-base">الشهادات الصادرة مؤخراً</CardTitle>
          <CardDescription>محفوظة على Google Drive (المادة 3)</CardDescription>
        </CardHeader>
        <CardContent>
          {issuedCertificates.length === 0 ? (
            <p className="py-8 text-center text-sm text-muted-foreground">
              لم تصدر أي شهادة بعد
            </p>
          ) : (
            <div className="space-y-2">
              {issuedCertificates.map((cert) => (
                <div
                  key={cert.id}
                  className="flex flex-wrap items-center justify-between gap-3 rounded-lg border px-4 py-3"
                >
                  <div>
                    <p className="font-medium">
                      {cert.studentName}{" "}
                      <span className="text-xs text-muted-foreground">
                        ({cert.serialNumber})
                      </span>
                    </p>
                    <p className="text-xs text-muted-foreground">
                      {cert.branch} أجزاء — {cert.finalScore} / 20 —
                      {cert.issuedDate
                        ? new Date(cert.issuedDate).toLocaleDateString("ar-SA")
                        : "—"}
                    </p>
                  </div>
                  {cert.fileUrl && (
                    <Button asChild size="sm" variant="outline">
                      <a
                        href={cert.fileUrl}
                        target="_blank"
                        rel="noopener noreferrer"
                      >
                        عرض الشهادة
                      </a>
                    </Button>
                  )}
                </div>
              ))}
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}