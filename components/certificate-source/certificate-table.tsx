"use client";

import { getBranchLabel } from "@/lib/utils";
import { useState } from "react";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { UploadButton } from "@/lib/uploadthing";
import {
  generateCertificate,
  sendCertificateToInstitution,
  attachCertificateFile,
} from "@/lib/actions/certificate-actions";

type ReadyStudent = {
  id: string;
  name: string;
  branch: string;
  institutionName: string;
  finalScore: number | null;
};

const STATUS_LABELS: Record<string, string> = {
  PENDING: "بانتظار التوقيع",
  SIGNED: "موقّعة",
  UPLOADED: "مرفوعة",
  SENT: "أُرسلت للجهة",
};

type IssuedCertificate = {
  id: string;
  serialNumber: string;
  studentName: string;
  branch: string;
  finalScore: number;
  fileUrl: string | null;
  /** ملف مرفوع يدوياً — الملف المولّد تلقائياً من generateCertificate لا يحمل fileId */
  fileId: string | null;
  issuedDate: Date | null;
  status: string;
};

/** المهلة القصوى قبل افتراض انتهاء العملية (30 ثانية) — تمنع تعليق الواجهة */
const ISSUE_TIMEOUT_MS = 30_000;
const UPLOAD_MAX_MB = 8;

/**
 * حد زمني للعمليات الطويلة (توليد PDF + الرفع).
 * عند التجاوز يُبلَّغ المستخدم برسالة عربية بدل تركه ينتظر بلا نهاية.
 */
async function withTimeout<T>(
  promise: Promise<T>,
  ms: number,
  message: string
): Promise<T> {
  let timer: ReturnType<typeof setTimeout> | null = null;
  const timeout = new Promise<never>((_, reject) => {
    timer = setTimeout(() => reject(new Error(message)), ms);
  });
  try {
    return await Promise.race([promise, timeout]);
  } finally {
    if (timer) clearTimeout(timer);
  }
}

export function CertificateTable({
  readyStudents,
  issuedCertificates,
}: {
  readyStudents: ReadyStudent[];
  issuedCertificates: IssuedCertificate[];
}) {
  const router = useRouter();
  const [busy, setBusy] = useState<{ kind: "issue" | "send"; id: string } | null>(null);
  const [error, setError] = useState("");
  const [success, setSuccess] = useState("");

  async function handleIssue(studentId: string) {
    setBusy({ kind: "issue", id: studentId });
    setError("");
    setSuccess("");
    try {
      const result = await withTimeout(
        generateCertificate(studentId),
        ISSUE_TIMEOUT_MS,
        "استغرق إصدار الشهادة أكثر من 30 ثانية — تحقّق من حالة الطالب ثم أعد المحاولة"
      );
      if (!result || result.success !== true) {
        throw new Error("تعذر إصدار الشهادة — راجع حالة الطالب");
      }
      setSuccess(`تم إصدار الشهادة بنجاح — الرقم التسلسلي ${result.serialNumber}`);
      router.refresh();
    } catch (e) {
      setError(e instanceof Error ? e.message : "تعذر إصدار الشهادة");
      // قد يكون الإصدار اكتمل في الخادم رغم انتهاء المهلة — نُعيد المزامنة
      router.refresh();
    } finally {
      setBusy(null);
    }
  }

  async function handleSend(certificateId: string) {
    setBusy({ kind: "send", id: certificateId });
    setError("");
    setSuccess("");
    try {
      const result = await withTimeout(
        sendCertificateToInstitution(certificateId),
        ISSUE_TIMEOUT_MS,
        "استغرق إرسال الشهادة أكثر من 30 ثانية — أعد المحاولة"
      );
      if (!result || result.success !== true) {
        throw new Error("تعذر إرسال الشهادة");
      }
      setSuccess("تم إرسال الشهادة للجهة — ستتلقى الجهة إشعاراً");
      router.refresh();
    } catch (e) {
      setError(e instanceof Error ? e.message : "تعذر إرسال الشهادة");
      router.refresh();
    } finally {
      setBusy(null);
    }
  }

  const isBusy = busy !== null;

  return (
    <div className="space-y-6">
      {error && (
        <p
          role="alert"
          className="rounded-md border border-destructive/20 bg-destructive/10 px-4 py-3 text-sm text-destructive"
        >
          {error}
        </p>
      )}
      {success && (
        <p
          role="status"
          className="rounded-md border border-primary/20 bg-primary/10 px-4 py-3 text-sm text-primary"
        >
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
              {readyStudents.map((student) => {
                const loading = busy?.kind === "issue" && busy.id === student.id;
                return (
                  <div
                    key={student.id}
                    className="flex flex-wrap items-center justify-between gap-3 rounded-lg border px-4 py-3"
                  >
                    <div>
                      <p className="font-medium">{student.name}</p>
                      <p className="text-xs text-muted-foreground">
                        {getBranchLabel(student.branch)} — {student.institutionName}
                      </p>
                    </div>
                    <div className="flex items-center gap-3">
                      <p className="text-sm font-semibold">
                        {student.finalScore !== null ? `${student.finalScore} / 100` : "—"}
                      </p>
                      <Button
                        size="sm"
                        disabled={isBusy}
                        aria-busy={loading}
                        onClick={() => handleIssue(student.id)}
                      >
                        {loading ? "جارٍ الإصدار..." : "إصدار الشهادة"}
                      </Button>
                    </div>
                  </div>
                );
              })}
              {isBusy && (
                <p className="text-xs text-muted-foreground">
                  جارٍ توليد الشهادة ورفعها — لا تُغلق الصفحة حتى تظهر النتيجة
                </p>
              )}
            </div>
          )}
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle className="text-base">الشهادات الصادرة مؤخراً</CardTitle>
          <CardDescription>
            محفوظة في التخزين السحابي (المادة 3) — أرفق نسخة الشهادة الموقّعة ثم أرسلها للجهة
          </CardDescription>
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
                      {getBranchLabel(cert.branch)} — {cert.finalScore} / 100 —
                      {cert.issuedDate
                        ? new Date(cert.issuedDate).toLocaleDateString("ar-SA")
                        : "—"}
                      {" — "}
                      <span className="font-medium">
                        {STATUS_LABELS[cert.status] ?? cert.status}
                      </span>
                    </p>
                  </div>
                  <div className="flex flex-wrap items-center gap-2">
                    {/* إرفاق الشهادة الموقّعة — يظهر ما لم يكن هناك ملف مرفوع يدوياً.
                        الملف المولّد تلقائياً من generateCertificate لا يحمل fileId،
                        لذلك كان الشرط السابق (!cert.fileUrl) يخفي الواجهة دائماً. */}
                    {!cert.fileId && cert.status !== "SENT" && (
                      <div className="flex flex-col items-end gap-1">
                        <UploadButton
                          endpoint="certificateUploader"
                          disabled={isBusy}
                          className="inline-flex h-9 items-center justify-center rounded-md border border-input bg-background px-4 text-xs font-medium shadow-sm transition-colors hover:bg-accent hover:text-accent-foreground disabled:pointer-events-none disabled:opacity-50"
                          content={{
                            button: "رفع الشهادة (PDF)",
                            allowedContent: `PDF فقط — بحد أقصى ${UPLOAD_MAX_MB}MB`,
                          }}
                          onClientUploadComplete={async (res) => {
                            const file = res[0];
                            if (!file) return;
                            try {
                              const attached = await attachCertificateFile({
                                certificateId: cert.id,
                                url: file.ufsUrl,
                                fileId: file.key,
                              });
                              if (!attached || attached.success !== true) {
                                throw new Error("تعذر ربط ملف الشهادة");
                              }
                              setSuccess("تم ربط ملف الشهادة بنجاح");
                              setError("");
                              router.refresh();
                            } catch (e) {
                              setError(
                                e instanceof Error ? e.message : "تعذر ربط ملف الشهادة"
                              );
                            }
                          }}
                          onUploadError={(err) =>
                            setError(
                              err.message ||
                                `تعذر رفع الملف — يُقبل PDF فقط وبحد أقصى ${UPLOAD_MAX_MB}MB`
                            )
                          }
                        />
                      </div>
                    )}
                    {cert.status === "SIGNED" && (
                      <Button
                        size="sm"
                        disabled={isBusy}
                        aria-busy={busy?.kind === "send" && busy.id === cert.id}
                        onClick={() => handleSend(cert.id)}
                      >
                        {busy?.kind === "send" && busy.id === cert.id
                          ? "جارٍ الإرسال..."
                          : "إرسال للجهة"}
                      </Button>
                    )}
                    {cert.fileUrl && (
                      <Button asChild size="sm" variant="outline">
                        <a href={cert.fileUrl} target="_blank" rel="noopener noreferrer">
                          عرض الشهادة
                        </a>
                      </Button>
                    )}
                  </div>
                </div>
              ))}
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
