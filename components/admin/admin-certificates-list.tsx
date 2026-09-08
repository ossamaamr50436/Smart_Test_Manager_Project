"use client";

import { useState, useEffect, useCallback, useTransition, useRef } from "react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Label } from "@/components/ui/label";
import { getAdminCertificates } from "@/lib/actions/admin-panel-actions";
import { signCertificate } from "@/lib/actions/certificate-actions";
import { CertificateStatus } from "@prisma/client";

type Cert = {
  id: string;
  serialNumber: string;
  finalScore: number;
  status: CertificateStatus;
  issuedDate: Date | null;
  signedAt: Date | null;
  student: { id: string; name: string; institution: { name: string } | null } | null;
  issuedBy: { name: string } | null;
  signedById: string | null;
};

type CertsResult = {
  certificates: Cert[];
  total: number;
  totalPages: number;
  page: number;
};

const STATUS_LABELS: Record<CertificateStatus, string> = {
  PENDING: "بانتظار التوقيع",
  SIGNED: "تم التوقيع",
  UPLOADED: "تم رفعه",
  SENT: "أُرسل",
};

export function AdminCertificatesList() {
  const [isPending, startTransition] = useTransition();
  const [result, setResult] = useState<CertsResult | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [page, setPage] = useState(1);
  const [status, setStatus] = useState("");
  const [signFile, setSignFile] = useState<Record<string, File>>({});
  const [signingId, setSigningId] = useState<string | null>(null);
  const [signError, setSignError] = useState("");
  const fileInputs = useRef<Record<string, HTMLInputElement | null>>({});

  const load = useCallback(async () => {
    startTransition(async () => {
      try {
        setResult(await getAdminCertificates({ page, status: status || undefined }));
        setError("");
      } catch (e) {
        setError(e instanceof Error ? e.message : "تعذر تحميل الشهادات");
      }
    });
  }, [page, status]);

  useEffect(() => {
    if (!loading) load();
  }, [load, loading]);

  useEffect(() => {
    setLoading(false);
  }, []);

  async function handleSign(certificateId: string) {
    const file = signFile[certificateId];
    if (!file) {
      setSignError("اختر صورة توقيع أولاً");
      return;
    }
    setSignError("");
    setSigningId(certificateId);
    startTransition(async () => {
      try {
        const buffer = await file.arrayBuffer();
        await signCertificate(certificateId, buffer);
        setSignFile((p) => {
          const next = { ...p };
          delete next[certificateId];
          return next;
        });
        if (fileInputs.current[certificateId]) fileInputs.current[certificateId]!.value = "";
        load();
      } catch (e) {
        setSignError(e instanceof Error ? e.message : "تعذر توقيع الشهادة");
      } finally {
        setSigningId(null);
      }
    });
  }

  return (
    <div className="space-y-4">
      {error && (
        <p className="rounded-md border border-destructive/20 bg-destructive/10 px-4 py-3 text-sm text-destructive">{error}</p>
      )}
      {signError && (
        <p className="rounded-md border border-destructive/20 bg-destructive/10 px-4 py-3 text-sm text-destructive">{signError}</p>
      )}
      {loading ? (
        <div className="py-12 text-center text-muted-foreground">جارٍ تحميل الشهادات...</div>
      ) : (
        <>
          <Card>
            <CardHeader><CardTitle className="text-base">التصفية</CardTitle></CardHeader>
            <CardContent>
              <div className="max-w-xs space-y-1">
                <Label>الحالة</Label>
                <select value={status} onChange={(e) => { setStatus(e.target.value); setPage(1); }} className="w-full rounded-md border bg-background px-3 py-2 text-sm">
                  <option value="">جميع الحالات</option>
                  {Object.values(CertificateStatus).map((s) => (
                    <option key={s} value={s}>{STATUS_LABELS[s]}</option>
                  ))}
                </select>
              </div>
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle className="text-base">الشهادات</CardTitle>
              <CardDescription>{result?.total ?? 0} شهادة</CardDescription>
            </CardHeader>
            <CardContent>
              {isPending && <p className="py-4 text-center text-sm text-muted-foreground">جارٍ التحميل...</p>}
              {!isPending && result && result.certificates.length === 0 && (
                <p className="py-8 text-center text-muted-foreground">لا توجد شهادات</p>
              )}
              {!isPending && result && result.certificates.length > 0 && (
                <div className="space-y-2">
                  {result.certificates.map((c) => {
                    const signedFile = signFile[c.id];
                    return (
                    <div key={c.id} className="flex flex-wrap items-center justify-between gap-3 rounded-lg border px-4 py-3">
                      <div className="space-y-1">
                        <p className="font-medium">
                          {c.student?.name ?? "—"}{" "}
                          <span className="text-xs text-muted-foreground" dir="ltr">({c.serialNumber})</span>
                        </p>
                        <p className="text-xs text-muted-foreground">
                          الجهة: {c.student?.institution?.name ?? "—"} — الدرجة: {c.finalScore} / 20
                        </p>
                        <p className="text-xs text-muted-foreground">
                          أصدرها: {c.issuedBy?.name ?? "—"}
                        </p>
                      </div>
                      <div className="flex flex-col items-end gap-1">
                        <span className="inline-flex items-center rounded-full bg-secondary-100 px-2 py-0.5 text-xs font-medium text-primary-700">
                          {STATUS_LABELS[c.status]}
                        </span>
                        {c.issuedDate && (
                          <span className="text-xs text-muted-foreground">
                            {new Date(c.issuedDate).toLocaleDateString("ar-SA")}
                          </span>
                        )}
                        {c.status === "PENDING" && (
                          <div className="mt-1 flex flex-col items-end gap-1">
                            <div className="flex items-center gap-2">
                              <input
                                ref={(el) => { fileInputs.current[c.id] = el; }}
                                type="file"
                                accept="image/png,image/jpeg"
                                className="max-w-[160px] text-xs"
                                onChange={(e) => {
                                  const f = e.target.files?.[0];
                                  if (f) setSignFile((p) => ({ ...p, [c.id]: f }));
                                }}
                              />
                              <Button
                                size="sm"
                                disabled={signingId === c.id}
                                onClick={() => handleSign(c.id)}
                              >
                                {signingId === c.id ? "جارٍ التوقيع..." : "توقيع"}
                              </Button>
                            </div>
                            {signedFile && (
                              <span className="text-xs text-muted-foreground">
                                {signedFile.name}
                              </span>
                            )}
                          </div>
                        )}
                      </div>
                    </div>
                    );
                  })}
                </div>
              )}

              {result && result.totalPages > 1 && (
                <div className="mt-4 flex items-center justify-center gap-2">
                  <Button size="sm" variant="outline" disabled={result.page <= 1} onClick={() => setPage((p) => p - 1)}>السابق</Button>
                  <span className="text-sm text-muted-foreground">صفحة {result.page} من {result.totalPages}</span>
                  <Button size="sm" variant="outline" disabled={result.page >= result.totalPages} onClick={() => setPage((p) => p + 1)}>التالي</Button>
                </div>
              )}
            </CardContent>
          </Card>
        </>
      )}
    </div>
  );
}
