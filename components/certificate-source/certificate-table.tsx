"use client";

import { getBranchLabel } from "@/lib/utils";
import { useState } from "react";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { UploadButton } from "@/lib/uploadthing";
import {
  createCertificateFromUpload,
  sendCertificateToInstitution,
} from "@/lib/actions/certificate-actions";

type ReadyStudent = {
  id: string;
  name: string;
  branch: string;
  institutionName: string;
  finalScore: number | null;
};

type CertificateRow = {
  id: string;
  serialNumber: string;
  studentName: string;
  branch: string;
  finalScore: number;
  fileUrl: string | null;
  issuedDate: Date | string | null;
  sentAt: Date | string | null;
};

/** المهلة القصوى قبل افتراض انتهاء العملية — تمنع تعليق الواجهة */
const ACTION_TIMEOUT_MS = 30_000;
const UPLOAD_MAX_MB = 8;

function fmtDate(d: Date | string | null): string {
  if (!d) return "—";
  return new Date(d).toLocaleDateString("ar-SA");
}

/**
 * حد زمني للعمليات الطويلة (رفع أو إرسال).
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

const UPLOAD_BUTTON_CLASS =
  "inline-flex h-9 items-center justify-center rounded-md border border-input bg-background px-4 text-xs font-medium shadow-sm transition-colors hover:bg-accent hover:text-accent-foreground disabled:pointer-events-none disabled:opacity-50";

export function CertificateTable({
  readyStudents,
  uploadedCertificates,
  sentCertificates,
}: {
  readyStudents: ReadyStudent[];
  uploadedCertificates: CertificateRow[];
  sentCertificates: CertificateRow[];
}) {
  const router = useRouter();
  const [busy, setBusy] = useState<{ kind: "upload" | "send"; id: string } | null>(null);
  const [error, setError] = useState("");
  const [success, setSuccess] = useState("");

  async function handleSend(certificateId: string) {
    setBusy({ kind: "send", id: certificateId });
    setError("");
    setSuccess("");
    try {
      const result = await withTimeout(
        sendCertificateToInstitution(certificateId),
        ACTION_TIMEOUT_MS,
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

  async function handleUploadComplete(
    studentId: string,
    res: Array<{ ufsUrl: string; key: string }>
  ) {
    const file = res[0];
    if (!file) return;
    setBusy({ kind: "upload", id: studentId });
    setError("");
    setSuccess("");
    try {
      const result = await createCertificateFromUpload({
        studentId,
        url: file.ufsUrl,
        fileId: file.key,
      });
      if (!result || result.success !== true) {
        throw new Error(result?.error ?? "تعذر تسجيل ملف الشهادة");
      }
      setSuccess(`تم تسجيل الشهادة المرفوعة بنجاح — الرقم التسلسلي ${result.serialNumber}`);
      router.refresh();
    } catch (e) {
      setError(e instanceof Error ? e.message : "تعذر رفع ملف الشهادة");
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
          <CardTitle className="text-base">طلاب بانتظار رفع الشهادة</CardTitle>
          <CardDescription>
            {readyStudents.length} طالب — الشهادة تُصدر من الجمعية خارجياً، والنظام وسيط
            فقط: ارفع ملف PDF ثم أرسله للجهة
          </CardDescription>
        </CardHeader>
        <CardContent>
          {readyStudents.length === 0 ? (
            <p className="py-8 text-center text-sm text-muted-foreground">
              لا يوجد طلاب بانتظار رفع الشهادة حالياً
            </p>
          ) : (
            <div className="space-y-2">
              {readyStudents.map((student) => {
                const loading = busy?.kind === "upload" && busy.id === student.id;
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
                      <UploadButton
                        endpoint="certificateUploader"
                        disabled={isBusy}
                        className={UPLOAD_BUTTON_CLASS}
                        content={{
                          button: loading ? "جارٍ الرفع..." : "رفع شهادة PDF",
                          allowedContent: `PDF فقط — بحد أقصى ${UPLOAD_MAX_MB}MB`,
                        }}
                        onClientUploadComplete={(res) => handleUploadComplete(student.id, res)}
                        onUploadError={(err) =>
                          setError(
                            err.message ||
                              `تعذر رفع الملف — يُقبل PDF فقط وبحد أقصى ${UPLOAD_MAX_MB}MB`
                          )
                        }
                      />
                    </div>
                  </div>
                );
              })}
              {isBusy && (
                <p className="text-xs text-muted-foreground">
                  جارٍ تنفيذ العملية — لا تُغلق الصفحة حتى تظهر النتيجة
                </p>
              )}
            </div>
          )}
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle className="text-base">الشهادات المرفوعة — بانتظار الإرسال</CardTitle>
          <CardDescription>
            {uploadedCertificates.length} شهادة مرفوعة — جاهزة للإرسال إلى الجهة التعليمية
          </CardDescription>
        </CardHeader>
        <CardContent>
          {uploadedCertificates.length === 0 ? (
            <p className="py-8 text-center text-sm text-muted-foreground">
              لا توجد شهادات مرفوعة بانتظار الإرسال
            </p>
          ) : (
            <div className="space-y-2">
              {uploadedCertificates.map((cert) => {
                const loading = busy?.kind === "send" && busy.id === cert.id;
                return (
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
                        {getBranchLabel(cert.branch)} — {cert.finalScore} / 100 —{" "}
                        {fmtDate(cert.issuedDate)}
                      </p>
                    </div>
                    <div className="flex flex-wrap items-center gap-2">
                      {cert.fileUrl && (
                        <Button asChild size="sm" variant="outline">
                          <a href={cert.fileUrl} target="_blank" rel="noopener noreferrer">
                            عرض الشهادة
                          </a>
                        </Button>
                      )}
                      <Button
                        size="sm"
                        disabled={isBusy}
                        aria-busy={loading}
                        onClick={() => handleSend(cert.id)}
                      >
                        {loading ? "جارٍ الإرسال..." : "إرسال للجهة"}
                      </Button>
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle className="text-base">الشهادات المُرسَلة</CardTitle>
          <CardDescription>
            {sentCertificates.length} شهادة أُرسلت إلى الجهة التعليمية
          </CardDescription>
        </CardHeader>
        <CardContent>
          {sentCertificates.length === 0 ? (
            <p className="py-8 text-center text-sm text-muted-foreground">
              لم تُرسل أي شهادة بعد
            </p>
          ) : (
            <div className="space-y-2">
              {sentCertificates.map((cert) => (
                <div
                  key={cert.id}
                  className="flex flex-wrap items-center justify-between gap-3 rounded-lg border px-4 py-3"
                >
                  <div>
                    <p className="font-medium">
                      {cert.studentName}{" "}
                      <span className="text-xs text-muted-foreground">({cert.serialNumber})</span>
                    </p>
                    <p className="text-xs text-muted-foreground">
                      {getBranchLabel(cert.branch)} — {cert.finalScore} / 100 —{" "}
                      {fmtDate(cert.sentAt)}
                    </p>
                  </div>
                  {cert.fileUrl && (
                    <Button asChild size="sm" variant="outline">
                      <a href={cert.fileUrl} target="_blank" rel="noopener noreferrer">
                        تحميل الشهادة
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
