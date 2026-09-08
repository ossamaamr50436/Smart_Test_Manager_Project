"use client";

import { useState, useEffect, useCallback, useTransition } from "react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { getAdminModels, getInstitutionsOptions } from "@/lib/actions/admin-panel-actions";

type Model = {
  id: string;
  modelNumber: number;
  institution: { name: string } | null;
  season: { name: string } | null;
  _count: { assessments: number };
};

type ModelResult = {
  models: Model[];
  total: number;
  totalPages: number;
  page: number;
};

export function AdminModelsList() {
  const [isPending, startTransition] = useTransition();
  const [result, setResult] = useState<ModelResult | null>(null);
  const [institutions, setInstitutions] = useState<{ id: string; name: string }[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [page, setPage] = useState(1);
  const [search, setSearch] = useState("");
  const [institutionId, setInstitutionId] = useState("");

  const load = useCallback(async () => {
    startTransition(async () => {
      try {
        setResult(await getAdminModels({ page, search: search || undefined, institutionId: institutionId || undefined }));
        setError("");
      } catch (e) {
        setError(e instanceof Error ? e.message : "تعذر تحميل النماذج");
      }
    });
  }, [page, search, institutionId]);

  useEffect(() => {
    if (!loading) load();
  }, [load, loading]);

  useEffect(() => {
    (async () => {
      try {
        setInstitutions(await getInstitutionsOptions());
      } catch {
        setInstitutions([]);
      } finally {
        setLoading(false);
      }
    })();
  }, []);

  return (
    <div className="space-y-4">
      {error && (
        <p className="rounded-md border border-destructive/20 bg-destructive/10 px-4 py-3 text-sm text-destructive">{error}</p>
      )}
      {loading ? (
        <div className="py-12 text-center text-muted-foreground">جارٍ تحميل النماذج...</div>
      ) : (
        <>
          <Card>
            <CardHeader><CardTitle className="text-base">التصفية</CardTitle></CardHeader>
            <CardContent>
              <div className="grid gap-3 sm:grid-cols-2">
                <div className="space-y-1">
                  <Label>رقم النموذج</Label>
                  <Input value={search} onChange={(e) => { setSearch(e.target.value); setPage(1); }} placeholder="بحث برقم النموذج..." dir="rtl" />
                </div>
                <div className="space-y-1">
                  <Label>الجهة</Label>
                  <select value={institutionId} onChange={(e) => { setInstitutionId(e.target.value); setPage(1); }} className="w-full rounded-md border bg-background px-3 py-2 text-sm">
                    <option value="">جميع الجهات</option>
                    {institutions.map((i) => (
                      <option key={i.id} value={i.id}>{i.name}</option>
                    ))}
                  </select>
                </div>
              </div>
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle className="text-base">النماذج الاختبارية</CardTitle>
              <CardDescription>{result?.total ?? 0} نموذج</CardDescription>
            </CardHeader>
            <CardContent>
              {isPending && <p className="py-4 text-center text-sm text-muted-foreground">جارٍ التحميل...</p>}
              {!isPending && result && result.models.length === 0 && (
                <p className="py-8 text-center text-muted-foreground">لا توجد نماذج</p>
              )}
              {!isPending && result && result.models.length > 0 && (
                <div className="space-y-2">
                  {result.models.map((m) => (
                    <div key={m.id} className="flex flex-wrap items-center justify-between gap-3 rounded-lg border px-4 py-3">
                      <div className="space-y-1">
                        <p className="font-medium">النموذج رقم {m.modelNumber}</p>
                        <p className="text-xs text-muted-foreground">
                          الجهة: {m.institution?.name ?? "—"} — الموسم: {m.season?.name ?? "—"}
                        </p>
                      </div>
                      <p className="text-xs text-muted-foreground">{m._count.assessments} تقييم</p>
                    </div>
                  ))}
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
