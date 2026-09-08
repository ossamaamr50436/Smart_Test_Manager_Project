"use client";

import { useState, useEffect, useCallback, useTransition } from "react";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardHeader,
  CardTitle,
  CardDescription,
} from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  getAdminInstitutions,
  createAdminInstitution,
  updateAdminInstitution,
  adminDeleteInstitution,
} from "@/lib/actions/admin-panel-actions";

type Institution = {
  id: string;
  name: string;
  contactInfo: string | null;
  createdAt: Date;
  _count: { students: number; users: number; examModels: number };
};

type InstResult = {
  institutions: Institution[];
  total: number;
  totalPages: number;
  page: number;
};

export function AdminInstitutionsManager() {
  const [isPending, startTransition] = useTransition();
  const [result, setResult] = useState<InstResult | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [success, setSuccess] = useState("");
  const [search, setSearch] = useState("");
  const [page, setPage] = useState(1);

  const [showCreate, setShowCreate] = useState(false);
  const [form, setForm] = useState({ name: "", contactInfo: "" });

  const [editing, setEditing] = useState<Institution | null>(null);
  const [editForm, setEditForm] = useState({ name: "", contactInfo: "" });

  const load = useCallback(async () => {
    startTransition(async () => {
      try {
        const data = await getAdminInstitutions({
          page,
          search: search || undefined,
        });
        setResult(data);
        setError("");
      } catch (e) {
        setError(e instanceof Error ? e.message : "تعذر تحميل المؤسسات");
      }
    });
  }, [page, search]);

  useEffect(() => {
    if (!loading) load();
  }, [load, loading]);

  useEffect(() => {
    setLoading(false);
  }, []);

  const handleSearch = () => {
    setPage(1);
    load();
  };

  async function handleCreate() {
    setError("");
    setSuccess("");
    startTransition(async () => {
      try {
        await createAdminInstitution({ name: form.name, contactInfo: form.contactInfo });
        setSuccess("تم إنشاء المؤسسة");
        setShowCreate(false);
        setForm({ name: "", contactInfo: "" });
        setPage(1);
        load();
      } catch (e) {
        setError(e instanceof Error ? e.message : "فشل الإنشاء");
      }
    });
  }

  function openEdit(inst: Institution) {
    setEditing(inst);
    setEditForm({ name: inst.name, contactInfo: inst.contactInfo ?? "" });
  }

  async function handleSaveEdit() {
    if (!editing) return;
    setError("");
    setSuccess("");
    startTransition(async () => {
      try {
        await updateAdminInstitution(editing.id, {
          name: editForm.name,
          contactInfo: editForm.contactInfo,
        });
        setSuccess("تم حفظ التعديلات");
        setEditing(null);
        load();
      } catch (e) {
        setError(e instanceof Error ? e.message : "فشل الحفظ");
      }
    });
  }

  async function handleDelete(inst: Institution) {
    if (!confirm(`هل أنت متأكد من حذف المؤسسة "${inst.name}"؟`)) return;
    setError("");
    setSuccess("");
    startTransition(async () => {
      try {
        await adminDeleteInstitution(inst.id);
        setSuccess("تم حذف المؤسسة");
        load();
      } catch (e) {
        setError(e instanceof Error ? e.message : "فشل الحذف");
      }
    });
  }

  if (loading) {
    return <div className="py-12 text-center text-muted-foreground">جارٍ تحميل المؤسسات...</div>;
  }

  return (
    <div className="space-y-4">
      {error && (
        <p className="rounded-md border border-destructive/20 bg-destructive/10 px-4 py-3 text-sm text-destructive">{error}</p>
      )}
      {success && (
        <p className="rounded-md border border-primary/20 bg-primary/10 px-4 py-3 text-sm text-primary">{success}</p>
      )}

      <div className="flex flex-wrap items-center gap-2">
        <Button onClick={() => setShowCreate((v) => !v)}>
          {showCreate ? "إغلاق" : "+ إضافة مؤسسة"}
        </Button>
        <Input
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          placeholder="بحث بالاسم..."
          dir="rtl"
          className="max-w-xs"
        />
        <Button variant="outline" onClick={handleSearch}>بحث</Button>
      </div>

      {showCreate && (
        <Card>
          <CardHeader><CardTitle className="text-base">إضافة مؤسسة</CardTitle></CardHeader>
          <CardContent>
            <div className="grid gap-3 sm:grid-cols-2">
              <div className="space-y-1">
                <Label>اسم المؤسسة</Label>
                <Input value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} dir="rtl" />
              </div>
              <div className="space-y-1">
                <Label>بيانات التواصل (اختياري)</Label>
                <Input value={form.contactInfo} onChange={(e) => setForm({ ...form, contactInfo: e.target.value })} dir="rtl" />
              </div>
            </div>
            <div className="mt-4 flex justify-end">
              <Button disabled={isPending} onClick={handleCreate}>إنشاء</Button>
            </div>
          </CardContent>
        </Card>
      )}

      {editing && (
        <Card>
          <CardHeader><CardTitle className="text-base">تعديل: {editing.name}</CardTitle></CardHeader>
          <CardContent>
            <div className="grid gap-3 sm:grid-cols-2">
              <div className="space-y-1">
                <Label>اسم المؤسسة</Label>
                <Input value={editForm.name} onChange={(e) => setEditForm({ ...editForm, name: e.target.value })} dir="rtl" />
              </div>
              <div className="space-y-1">
                <Label>بيانات التواصل</Label>
                <Input value={editForm.contactInfo} onChange={(e) => setEditForm({ ...editForm, contactInfo: e.target.value })} dir="rtl" />
              </div>
            </div>
            <div className="mt-4 flex gap-2">
              <Button disabled={isPending} onClick={handleSaveEdit}>حفظ</Button>
              <Button variant="outline" onClick={() => setEditing(null)}>إلغاء</Button>
            </div>
          </CardContent>
        </Card>
      )}

      <Card>
        <CardHeader>
          <CardTitle className="text-base">قائمة المؤسسات</CardTitle>
          <CardDescription>{result?.total ?? 0} مؤسسة</CardDescription>
        </CardHeader>
        <CardContent>
          {isPending && <p className="py-4 text-center text-sm text-muted-foreground">جارٍ التحميل...</p>}
          {!isPending && result && result.institutions.length === 0 && (
            <p className="py-8 text-center text-muted-foreground">لا توجد مؤسسات</p>
          )}
          {!isPending && result && result.institutions.length > 0 && (
            <div className="space-y-2">
              {result.institutions.map((inst) => (
                <div key={inst.id} className="flex flex-wrap items-center justify-between gap-3 rounded-lg border px-4 py-3">
                  <div className="space-y-1">
                    <p className="font-medium">{inst.name}</p>
                    {inst.contactInfo && (
                      <p className="text-xs text-muted-foreground">{inst.contactInfo}</p>
                    )}
                    <p className="text-xs text-muted-foreground">
                      {inst._count.students} طالب — {inst._count.users} مستخدم —{" "}
                      {inst._count.examModels} نموذج
                    </p>
                  </div>
                  <div className="flex gap-2">
                    <Button size="sm" variant="outline" onClick={() => openEdit(inst)}>تعديل</Button>
                    <Button size="sm" variant="destructive" onClick={() => handleDelete(inst)}>حذف</Button>
                  </div>
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
    </div>
  );
}
