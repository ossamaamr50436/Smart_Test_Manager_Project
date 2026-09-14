"use client";

import { useState, useEffect, useTransition } from "react";
import { Trash2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogFooter,
  DialogClose,
} from "@/components/ui/dialog";
import {
  getAdminSeasons,
  createAdminSeason,
  updateAdminSeason,
  deleteAdminSeason,
} from "@/lib/actions/admin-panel-actions";

type Season = {
  id: string;
  name: string;
  startDate: Date;
  endDate: Date;
  isActive: boolean;
  createdAt: Date;
  _count: {
    sessions: number;
    models: number;
    committees: number;
    modelAllocations: number;
  };
};

export function AdminSeasonsManager() {
  const [isPending, startTransition] = useTransition();
  const [seasons, setSeasons] = useState<Season[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [success, setSuccess] = useState("");

  const [showCreate, setShowCreate] = useState(false);
  const [seasonToDelete, setSeasonToDelete] = useState<Season | null>(null);
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

  function handleDeleteClick(season: Season) {
    setError("");
    setSuccess("");
    setSeasonToDelete(season);
  }

  async function handleDeleteConfirm() {
    if (!seasonToDelete || isPending) return;
    startTransition(async () => {
      try {
        await deleteAdminSeason(seasonToDelete.id);
        setSuccess(`تم حذف الموسم «${seasonToDelete.name}» بنجاح`);
        setSeasonToDelete(null);
        load();
      } catch (e) {
        setError(e instanceof Error ? e.message : "فشل حذف الموسم");
        setSeasonToDelete(null);
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
                  <div className="flex flex-wrap items-center gap-2">
                    <Button size="sm" variant={season.isActive ? "outline" : "default"} disabled={isPending} onClick={() => toggleActive(season)}>
                      {season.isActive ? "إلغاء التفعيل" : "تفعيل"}
                    </Button>
                    <Button
                      size="sm"
                      variant="destructive"
                      disabled={isPending}
                      onClick={() => handleDeleteClick(season)}
                    >
                      <Trash2 className="h-4 w-4" />
                      حذف
                    </Button>
                  </div>
                </div>
              ))}
            </div>
          )}
        </CardContent>
      </Card>

      <Dialog open={Boolean(seasonToDelete)} onOpenChange={(open) => !open && setSeasonToDelete(null)}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>حذف الموسم</DialogTitle>
            <DialogDescription>
              {seasonToDelete && (
                <>
                  هل أنت متأكد من حذف الموسم «{seasonToDelete.name}»؟ لا يمكن التراجع عن
                  هذا الإجراء.
                  {seasonToDelete._count.sessions +
                    seasonToDelete._count.models +
                    seasonToDelete._count.committees +
                    seasonToDelete._count.modelAllocations >
                    0 && (
                    <span className="mt-3 block rounded-md border border-amber-200 bg-amber-50 px-3 py-2 text-sm text-amber-800">
                      ⚠️ الموسم مرتبط ببيانات:
                      {[
                        seasonToDelete._count.sessions > 0 &&
                          `${seasonToDelete._count.sessions} جلسة`,
                        seasonToDelete._count.models > 0 &&
                          `${seasonToDelete._count.models} نموذج`,
                        seasonToDelete._count.committees > 0 &&
                          `${seasonToDelete._count.committees} لجنة`,
                        seasonToDelete._count.modelAllocations > 0 &&
                          `${seasonToDelete._count.modelAllocations} تخصيص`,
                      ]
                        .filter(Boolean)
                        .join("، ")}{" "}
                      — لا يمكن الحذف حتى تُحذف هذه البيانات أولاً.
                    </span>
                  )}
                </>
              )}
            </DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <DialogClose asChild>
              <Button variant="outline">إلغاء</Button>
            </DialogClose>
            <Button variant="destructive" disabled={isPending} onClick={handleDeleteConfirm}>
              {isPending ? "جارٍ الحذف..." : "حذف نهائي"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
