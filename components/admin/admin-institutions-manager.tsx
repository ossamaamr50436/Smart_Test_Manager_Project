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
  managerName: string;
  supervisorName: string;
  managerPhone: string;
  supervisorPhone: string;
  licenseNumber: string;
  district: string;
  createdAt: Date;
  _count: { students: number; users: number; examModels: number };
};

type InstResult = {
  institutions: Institution[];
  total: number;
  totalPages: number;
  page: number;
};

const EMPTY_FORM = {
  name: "",
  managerName: "",
  supervisorName: "",
  managerPhone: "",
  supervisorPhone: "",
  licenseNumber: "",
  district: "",
  email: "",
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
  const [form, setForm] = useState(EMPTY_FORM);

  const [createdPass, setCreatedPass] = useState<{
    password: string;
    email: string;
  } | null>(null);

  const [editing, setEditing] = useState<Institution | null>(null);
  const [editForm, setEditForm] = useState({
    name: "",
    managerName: "",
    supervisorName: "",
    managerPhone: "",
    supervisorPhone: "",
    licenseNumber: "",
    district: "",
  });

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
        setError(e instanceof Error ? e.message : "تعذر تحميل الجهات");
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
        const created = await createAdminInstitution(form);
        setSuccess("تم إنشاء الجهة بنجاح");
        setCreatedPass({ password: created.password, email: created.email });
        setShowCreate(false);
        setForm(EMPTY_FORM);
        setPage(1);
        load();
      } catch (e) {
        setError(e instanceof Error ? e.message : "فشل الإنشاء");
      }
    });
  }

  function openEdit(inst: Institution) {
    setEditing(inst);
    setEditForm({
      name: inst.name,
      managerName: inst.managerName,
      supervisorName: inst.supervisorName,
      managerPhone: inst.managerPhone,
      supervisorPhone: inst.supervisorPhone,
      licenseNumber: inst.licenseNumber,
      district: inst.district,
    });
  }

  async function handleSaveEdit() {
    if (!editing) return;
    setError("");
    setSuccess("");
    startTransition(async () => {
      try {
        await updateAdminInstitution(editing.id, editForm);
        setSuccess("تم حفظ التعديلات");
        setEditing(null);
        load();
      } catch (e) {
        setError(e instanceof Error ? e.message : "فشل الحفظ");
      }
    });
  }

  async function handleDelete(inst: Institution) {
    if (!confirm(`هل أنت متأكد من حذف الجهة "${inst.name}"؟`)) return;
    setError("");
    setSuccess("");
    startTransition(async () => {
      try {
        await adminDeleteInstitution(inst.id);
        setSuccess("تم حذف الجهة");
        load();
      } catch (e) {
        setError(e instanceof Error ? e.message : "فشل الحذف");
      }
    });
  }

  if (loading) {
    return <div className="py-12 text-center text-muted-foreground">جارٍ تحميل الجهات...</div>;
  }

  return (
    <div className="space-y-4">
      {error && (
        <p className="rounded-md border border-destructive/20 bg-destructive/10 px-4 py-3 text-sm text-destructive">{error}</p>
      )}
      {success && (
        <p className="rounded-md border border-primary/20 bg-primary/10 px-4 py-3 text-sm text-primary">{success}</p>
      )}

      {createdPass && (
        <Card className="border-emerald-300 bg-emerald-50">
          <CardContent className="space-y-2 py-4">
            <p className="text-sm font-medium text-emerald-700">
              بيانات دخول الجهة — سلّمها للجهة (لا يمكن استرجاعها لاحقاً)
            </p>
            <p className="text-sm" dir="ltr">
              البريد: <span className="font-medium">{createdPass.email}</span>
            </p>
            <p className="text-sm" dir="ltr">
              كلمة المرور:{" "}
              <span className="font-mono font-semibold">{createdPass.password}</span>
            </p>
            <Button variant="outline" size="sm" onClick={() => setCreatedPass(null)}>
              إغلاق
            </Button>
          </CardContent>
        </Card>
      )}

      <div className="flex flex-wrap items-center gap-2">
        <Button onClick={() => setShowCreate((v) => !v)}>
          {showCreate ? "إغلاق" : "+ إضافة جهة"}
        </Button>
        <Input
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          placeholder="بحث بالاسم/رقم التصريح/الحي..."
          dir="rtl"
          className="max-w-xs"
        />
        <Button variant="outline" onClick={handleSearch}>بحث</Button>
      </div>

      {showCreate && (
        <Card>
          <CardHeader>
            <CardTitle className="text-base">إضافة جهة</CardTitle>
            <CardDescription>
              كلمة المرور التلقائية = رقم التصريح، مع إجبار التغيير بعد أول دخول
            </CardDescription>
          </CardHeader>
          <CardContent>
            <div className="grid gap-3 sm:grid-cols-2">
              <div className="space-y-1">
                <Label>اسم الجهة *</Label>
                <Input value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} dir="rtl" />
              </div>
              <div className="space-y-1">
                <Label>اسم مدير الجهة *</Label>
                <Input value={form.managerName} onChange={(e) => setForm({ ...form, managerName: e.target.value })} dir="rtl" />
              </div>
              <div className="space-y-1">
                <Label>اسم مشرف الجهة *</Label>
                <Input value={form.supervisorName} onChange={(e) => setForm({ ...form, supervisorName: e.target.value })} dir="rtl" />
              </div>
              <div className="space-y-1">
                <Label>رقم التصريح * (كلمة المرور التلقائية)</Label>
                <Input value={form.licenseNumber} onChange={(e) => setForm({ ...form, licenseNumber: e.target.value })} dir="ltr" />
              </div>
              <div className="space-y-1">
                <Label>رقم هاتف المدير *</Label>
                <Input value={form.managerPhone} onChange={(e) => setForm({ ...form, managerPhone: e.target.value })} dir="ltr" placeholder="+9665XXXXXXXX" />
              </div>
              <div className="space-y-1">
                <Label>رقم هاتف المشرف *</Label>
                <Input value={form.supervisorPhone} onChange={(e) => setForm({ ...form, supervisorPhone: e.target.value })} dir="ltr" placeholder="+9665XXXXXXXX" />
              </div>
              <div className="space-y-1">
                <Label>الحي *</Label>
                <Input value={form.district} onChange={(e) => setForm({ ...form, district: e.target.value })} dir="rtl" />
              </div>
              <div className="space-y-1">
                <Label>البريد الإلكتروني *</Label>
                <Input type="email" value={form.email} onChange={(e) => setForm({ ...form, email: e.target.value })} dir="ltr" />
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
                <Label>اسم الجهة</Label>
                <Input value={editForm.name} onChange={(e) => setEditForm({ ...editForm, name: e.target.value })} dir="rtl" />
              </div>
              <div className="space-y-1">
                <Label>اسم مدير الجهة</Label>
                <Input value={editForm.managerName} onChange={(e) => setEditForm({ ...editForm, managerName: e.target.value })} dir="rtl" />
              </div>
              <div className="space-y-1">
                <Label>اسم مشرف الجهة</Label>
                <Input value={editForm.supervisorName} onChange={(e) => setEditForm({ ...editForm, supervisorName: e.target.value })} dir="rtl" />
              </div>
              <div className="space-y-1">
                <Label>رقم التصريح</Label>
                <Input value={editForm.licenseNumber} onChange={(e) => setEditForm({ ...editForm, licenseNumber: e.target.value })} dir="ltr" />
              </div>
              <div className="space-y-1">
                <Label>رقم هاتف المدير</Label>
                <Input value={editForm.managerPhone} onChange={(e) => setEditForm({ ...editForm, managerPhone: e.target.value })} dir="ltr" />
              </div>
              <div className="space-y-1">
                <Label>رقم هاتف المشرف</Label>
                <Input value={editForm.supervisorPhone} onChange={(e) => setEditForm({ ...editForm, supervisorPhone: e.target.value })} dir="ltr" />
              </div>
              <div className="space-y-1">
                <Label>الحي</Label>
                <Input value={editForm.district} onChange={(e) => setEditForm({ ...editForm, district: e.target.value })} dir="rtl" />
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
          <CardTitle className="text-base">قائمة الجهات</CardTitle>
          <CardDescription>{result?.total ?? 0} جهة</CardDescription>
        </CardHeader>
        <CardContent>
          {isPending && <p className="py-4 text-center text-sm text-muted-foreground">جارٍ التحميل...</p>}
          {!isPending && result && result.institutions.length === 0 && (
            <p className="py-8 text-center text-muted-foreground">لا توجد جهات</p>
          )}
          {!isPending && result && result.institutions.length > 0 && (
            <div className="overflow-x-auto rounded-lg border">
              <table className="w-full text-sm">
                <thead className="bg-muted/60">
                  <tr className="text-right">
                    <th className="px-3 py-2 font-medium">الجهة</th>
                    <th className="px-3 py-2 font-medium">المدير</th>
                    <th className="px-3 py-2 font-medium">المشرف</th>
                    <th className="px-3 py-2 font-medium">رقم التصريح</th>
                    <th className="px-3 py-2 font-medium">الحي</th>
                    <th className="px-3 py-2 font-medium">إحصاءات</th>
                    <th className="px-3 py-2 font-medium">إجراءات</th>
                  </tr>
                </thead>
                <tbody>
                  {result.institutions.map((inst) => (
                    <tr key={inst.id} className="border-t">
                      <td className="px-3 py-2 font-medium">{inst.name}</td>
                      <td className="px-3 py-2">
                        <p>{inst.managerName}</p>
                        <p className="text-xs text-muted-foreground" dir="ltr">{inst.managerPhone}</p>
                      </td>
                      <td className="px-3 py-2">
                        <p>{inst.supervisorName}</p>
                        <p className="text-xs text-muted-foreground" dir="ltr">{inst.supervisorPhone}</p>
                      </td>
                      <td className="px-3 py-2 tabular-nums" dir="ltr">{inst.licenseNumber}</td>
                      <td className="px-3 py-2">{inst.district}</td>
                      <td className="px-3 py-2 text-xs text-muted-foreground">
                        {inst._count.students} طالب — {inst._count.users} مستخدم — {inst._count.examModels} نموذج
                      </td>
                      <td className="px-3 py-2">
                        <div className="flex gap-2">
                          <Button size="sm" variant="outline" onClick={() => openEdit(inst)}>تعديل</Button>
                          <Button size="sm" variant="destructive" onClick={() => handleDelete(inst)}>حذف</Button>
                        </div>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
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