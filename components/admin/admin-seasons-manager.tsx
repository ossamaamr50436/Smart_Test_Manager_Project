"use client";

import { useState, useEffect, useTransition } from "react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  getAdminSeasons,
  createAdminSeason,
  updateAdminSeason,
} from "@/lib/actions/admin-panel-actions";

type Season = {
  id: string;
  name: string;
  startDate: Date;
  endDate: Date;
  isActive: boolean;
  createdAt: Date;
  _count: { sessions: number; models: number };
};

export function AdminSeasonsManager() {
  const [isPending, startTransition] = useTransition();
  const [seasons, setSeasons] = useState<Season[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [success, setSuccess] = useState("");

  const [showCreate, setShowCreate] = useState(false);
  const [form, setForm] = useState({ name: "", startDate: "", endDate: "", isActive: false });

  async function load() {
    try {
      setSeasons(await getAdminSeasons());
    } catch (e) {
      setError(e instanceof Error ? e.message : "تعذر تحميل المواسم");
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    load();
  }, []);

  async function handleCreate() {
    setError("");
    setSuccess("");
    startTransition(async () => {
      try {
        await createAdminSeason({
          name: form.name,
          startDate: form.startDate,
          endDate: form.endDate,
          isActive: form.isActive,
        });
        setSuccess("تم إنشاء الموسم");
        setShowCreate(false);
        setForm({ name: "", startDate: "", endDate: "", isActive: false });
        load();
      } catch (e) {
        setError(e instanceof Error ? e.message : "فشل الإنشاء");
      }
    });
  }

  async function toggleActive(season: Season) {
    setError("");
    setSuccess("");
    startTransition(async () => {
      try {
        await updateAdminSeason(season.id, { isActive: !season.isActive });
        setSuccess(season.isActive ? "تم إلغاء تفعيل الموسم" : "تم تفعيل الموسم");
        load();
      } catch (e) {
        setError(e instanceof Error ? e.message : "فشل التحديث");
      }
    });
  }

  if (loading) {
    return <div className="py-12 text-center text-muted-foreground">جارٍ تحميل المواسم...</div>;
  }

  return (
    <div className="space-y-4">
      {error && (
        <p className="rounded-md border border-destructive/20 bg-destructive/10 px-4 py-3 text-sm text-destructive">{error}</p>
      )}
      {success && (
        <p className="rounded-md border border-primary/20 bg-primary/10 px-4 py-3 text-sm text-primary">{success}</p>
      )}

      <Button onClick={() => setShowCreate((v) => !v)}>
        {showCreate ? "إغلاق" : "+ إضافة موسم"}
      </Button>

      {showCreate && (
        <Card>
          <CardHeader><CardTitle className="text-base">إضافة موسم اختبارات</CardTitle></CardHeader>
          <CardContent>
            <div className="grid gap-3 sm:grid-cols-2">
              <div className="space-y-1">
                <Label>اسم الموسم</Label>
                <Input value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} placeholder="مثال: 1446-الفصل الأول" dir="rtl" />
              </div>
              <div className="space-y-1">
                <Label>تاريخ البداية</Label>
                <Input type="date" value={form.startDate} onChange={(e) => setForm({ ...form, startDate: e.target.value })} />
              </div>
              <div className="space-y-1">
                <Label>تاريخ النهاية</Label>
                <Input type="date" value={form.endDate} onChange={(e) => setForm({ ...form, endDate: e.target.value })} />
              </div>
              <div className="flex items-end space-x-2 space-x-reverse pb-2">
                <label className="flex items-center gap-2 text-sm">
                  <input
                    type="checkbox"
                    checked={form.isActive}
                    onChange={(e) => setForm({ ...form, isActive: e.target.checked })}
                    className="h-4 w-4"
                  />
                  تفعيل الموسم
                </label>
              </div>
            </div>
            <div className="mt-4 flex justify-end">
              <Button disabled={isPending} onClick={handleCreate}>إنشاء</Button>
            </div>
          </CardContent>
        </Card>
      )}

      <Card>
        <CardHeader>
          <CardTitle className="text-base">المواسم</CardTitle>
          <CardDescription>{seasons.length} موسم</CardDescription>
        </CardHeader>
        <CardContent>
          {seasons.length === 0 ? (
            <p className="py-8 text-center text-muted-foreground">لا توجد مواسم بعد</p>
          ) : (
            <div className="space-y-2">
              {seasons.map((season) => (
                <div key={season.id} className="flex flex-wrap items-center justify-between gap-3 rounded-lg border px-4 py-3">
                  <div className="space-y-1">
                    <div className="flex items-center gap-2">
                      <p className="font-medium">{season.name}</p>
                      {season.isActive && (
                        <span className="inline-flex items-center rounded-full bg-gradient-to-r from-emerald-500 to-emerald-600 px-2 py-0.5 text-xs font-medium text-white">
                          نشط
                        </span>
                      )}
                    </div>
                    <p className="text-xs text-muted-foreground">
                      {new Date(season.startDate).toLocaleDateString("ar-SA")} —{" "}
                      {new Date(season.endDate).toLocaleDateString("ar-SA")}
                    </p>
                    <p className="text-xs text-muted-foreground">
                      {season._count.sessions} جلسة — {season._count.models} نموذج
                    </p>
                  </div>
                  <Button size="sm" variant={season.isActive ? "outline" : "default"} disabled={isPending} onClick={() => toggleActive(season)}>
                    {season.isActive ? "إلغاء التفعيل" : "تفعيل"}
                  </Button>
                </div>
              ))}
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
