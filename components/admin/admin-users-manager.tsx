"use client";

import { useState, useEffect, useCallback, useTransition } from "react";
import { useRouter } from "next/navigation";
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
import { Role } from "@prisma/client";
import {
  getAdminUsers,
  createAdminUser,
  updateAdminUser,
  resetAdminUserPassword,
  adminDeleteUser,
  getInstitutionsOptions,
} from "@/lib/actions/admin-panel-actions";
import { ROLE_LABELS } from "@/lib/roles";

type AdminUser = {
  id: string;
  name: string;
  email: string;
  role: Role;
  birthDate: Date | null;
  institutionId: string | null;
  createdAt: Date;
  institution?: { name: string } | null;
};

type UserResult = {
  users: AdminUser[];
  total: number;
  totalPages: number;
  page: number;
};

const ROLE_ORDER: Role[] = [
  Role.ADMIN,
  Role.HEAD_OF_AFFAIRS,
  Role.CERTIFICATE_SOURCE,
  Role.TEST_SPECIALIST,
  Role.EXAMINER,
  Role.INSTITUTION,
];

export function AdminUsersManager() {
  const router = useRouter();
  const [isPending, startTransition] = useTransition();
  const [result, setResult] = useState<UserResult | null>(null);
  const [institutions, setInstitutions] = useState<{ id: string; name: string }[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [success, setSuccess] = useState("");

  const [filters, setFilters] = useState({ page: 1, search: "", role: "", institutionId: "" });

  // نموذج الإضافة
  const [showCreate, setShowCreate] = useState(false);
  const [form, setForm] = useState({
    name: "",
    email: "",
    password: "",
    role: Role.EXAMINER as string,
    birthDate: "",
    institutionId: "",
  });

  // بيانات المستخدم قيد التعديل
  const [editing, setEditing] = useState<AdminUser | null>(null);
  const [editForm, setEditForm] = useState({
    name: "",
    email: "",
    role: Role.EXAMINER as string,
    birthDate: "",
    institutionId: "",
  });

  useEffect(() => {
    loadInstitutions();
  }, []);

  const loadUsers = useCallback(async () => {
    startTransition(async () => {
      try {
        const data = await getAdminUsers({
          page: filters.page,
          search: filters.search || undefined,
          role: filters.role || undefined,
          institutionId: filters.institutionId || undefined,
        });
        setResult(data);
        setError("");
      } catch (e) {
        setError(e instanceof Error ? e.message : "تعذر تحميل المستخدمين");
      }
    });
  }, [filters]);

  useEffect(() => {
    if (!loading) loadUsers();
  }, [loadUsers, loading]);

  async function loadInstitutions() {
    try {
      setInstitutions(await getInstitutionsOptions());
    } catch {
      setInstitutions([]);
    } finally {
      setLoading(false);
    }
  }

  function handleFilterChange(key: keyof typeof filters, value: string) {
    setFilters((prev) => ({ ...prev, [key]: value, page: 1 }));
  }

  async function handleCreate() {
    setError("");
    setSuccess("");
    startTransition(async () => {
      try {
        await createAdminUser({
          name: form.name,
          email: form.email,
          password: form.password,
          role: form.role,
          birthDate: form.birthDate || undefined,
          institutionId: form.role === Role.INSTITUTION ? form.institutionId || undefined : undefined,
        });
        setSuccess("تم إنشاء المستخدم بنجاح");
        setShowCreate(false);
        setForm({ name: "", email: "", password: "", role: Role.EXAMINER, birthDate: "", institutionId: "" });
        loadUsers();
      } catch (e) {
        setError(e instanceof Error ? e.message : "فشل إنشاء المستخدم");
      }
    });
  }

  function openEdit(u: AdminUser) {
    setEditing(u);
    setError("");
    setSuccess("");
    setEditForm({
      name: u.name,
      email: u.email,
      role: u.role,
      birthDate: u.birthDate ? u.birthDate.toISOString().slice(0, 10) : "",
      institutionId: u.institutionId ?? "",
    });
  }

  async function handleSaveEdit() {
    if (!editing) return;
    setError("");
    setSuccess("");
    startTransition(async () => {
      try {
        await updateAdminUser(editing.id, {
          name: editForm.name,
          email: editForm.email,
          role: editForm.role,
          birthDate: editForm.birthDate || null,
          institutionId: editForm.role === Role.INSTITUTION ? editForm.institutionId || null : null,
        });
        setSuccess("تم حفظ التعديلات");
        setEditing(null);
        loadUsers();
      } catch (e) {
        setError(e instanceof Error ? e.message : "فشل حفظ التعديلات");
      }
    });
  }

  const [passwordTarget, setPasswordTarget] = useState<AdminUser | null>(null);
  const [passwordValue, setPasswordValue] = useState("");

  async function handleResetPassword() {
    if (!passwordTarget) return;
    setError("");
    setSuccess("");
    startTransition(async () => {
      try {
        await resetAdminUserPassword(passwordTarget.id, passwordValue);
        setSuccess(`تم تغيير كلمة مرور ${passwordTarget.name}`);
        setPasswordTarget(null);
        setPasswordValue("");
      } catch (e) {
        setError(e instanceof Error ? e.message : "فشل تغيير كلمة المرور");
      }
    });
  }

  async function handleDelete(u: AdminUser) {
    if (!confirm(`هل أنت متأكد من حذف المستخدم "${u.name}"؟`)) return;
    setError("");
    setSuccess("");
    startTransition(async () => {
      try {
        await adminDeleteUser(u.id);
        setSuccess("تم حذف المستخدم");
        loadUsers();
      } catch (e) {
        setError(e instanceof Error ? e.message : "فشل حذف المستخدم");
      }
    });
  }

  if (loading) {
    return (
      <div className="py-12 text-center text-muted-foreground">
        جارٍ تحميل المستخدمين...
      </div>
    );
  }

  return (
    <div className="space-y-4">
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

      {/* أزرار + نموذج إضافة */}
      <div className="flex flex-wrap gap-2">
        <Button onClick={() => setShowCreate((v) => !v)}>
          {showCreate ? "إغلاق" : "+ إضافة مستخدم"}
        </Button>
      </div>

      {showCreate && (
        <Card>
          <CardHeader>
            <CardTitle className="text-base">إضافة مستخدم جديد</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="grid gap-3 sm:grid-cols-2">
              <div className="space-y-1">
                <Label>الاسم</Label>
                <Input
                  value={form.name}
                  onChange={(e) => setForm({ ...form, name: e.target.value })}
                  dir="rtl"
                />
              </div>
              <div className="space-y-1">
                <Label>البريد الإلكتروني</Label>
                <Input
                  type="email"
                  value={form.email}
                  onChange={(e) => setForm({ ...form, email: e.target.value })}
                  dir="ltr"
                />
              </div>
              <div className="space-y-1">
                <Label>كلمة المرور (12 حرفاً على الأقل)</Label>
                <Input
                  type="password"
                  value={form.password}
                  onChange={(e) => setForm({ ...form, password: e.target.value })}
                  dir="ltr"
                />
              </div>
              <div className="space-y-1">
                <Label>الدور</Label>
                <select
                  value={form.role}
                  onChange={(e) => setForm({ ...form, role: e.target.value })}
                  className="w-full rounded-md border bg-background px-3 py-2 text-sm"
                >
                  {ROLE_ORDER.map((r) => (
                    <option key={r} value={r}>
                      {ROLE_LABELS[r]}
                    </option>
                  ))}
                </select>
              </div>
              <div className="space-y-1">
                <Label>تاريخ الميلاد</Label>
                <Input
                  type="date"
                  value={form.birthDate}
                  onChange={(e) => setForm({ ...form, birthDate: e.target.value })}
                />
              </div>
              {form.role === Role.INSTITUTION && (
                <div className="space-y-1">
                  <Label>الجهة التعليمية</Label>
                  <select
                    value={form.institutionId}
                    onChange={(e) => setForm({ ...form, institutionId: e.target.value })}
                    className="w-full rounded-md border bg-background px-3 py-2 text-sm"
                  >
                    <option value="">اختر الجهة...</option>
                    {institutions.map((i) => (
                      <option key={i.id} value={i.id}>
                        {i.name}
                      </option>
                    ))}
                  </select>
                </div>
              )}
            </div>
            <div className="mt-4 flex justify-end">
              <Button disabled={isPending} onClick={handleCreate}>
                إنشاء
              </Button>
            </div>
          </CardContent>
        </Card>
      )}

      {/* الفلاتر */}
      <Card>
        <CardHeader>
          <CardTitle className="text-base">التصفية والبحث</CardTitle>
        </CardHeader>
        <CardContent>
          <div className="grid gap-3 sm:grid-cols-3">
            <div className="space-y-1">
              <Label>بحث</Label>
              <Input
                value={filters.search}
                onChange={(e) => handleFilterChange("search", e.target.value)}
                placeholder="الاسم أو البريد..."
                dir="rtl"
              />
            </div>
            <div className="space-y-1">
              <Label>الدور</Label>
              <select
                value={filters.role}
                onChange={(e) => handleFilterChange("role", e.target.value)}
                className="w-full rounded-md border bg-background px-3 py-2 text-sm"
              >
                <option value="">جميع الأدوار</option>
                {ROLE_ORDER.map((r) => (
                  <option key={r} value={r}>
                    {ROLE_LABELS[r]}
                  </option>
                ))}
              </select>
            </div>
            <div className="space-y-1">
              <Label>الجهة</Label>
              <select
                value={filters.institutionId}
                onChange={(e) => handleFilterChange("institutionId", e.target.value)}
                className="w-full rounded-md border bg-background px-3 py-2 text-sm"
              >
                <option value="">جميع الجهات</option>
                {institutions.map((i) => (
                  <option key={i.id} value={i.id}>
                    {i.name}
                  </option>
                ))}
              </select>
            </div>
          </div>
        </CardContent>
      </Card>

      {/* نموذج تعديل */}
      {editing && (
        <Card>
          <CardHeader>
            <CardTitle className="text-base">تعديل: {editing.name}</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="grid gap-3 sm:grid-cols-2">
              <div className="space-y-1">
                <Label>الاسم</Label>
                <Input value={editForm.name} onChange={(e) => setEditForm({ ...editForm, name: e.target.value })} dir="rtl" />
              </div>
              <div className="space-y-1">
                <Label>البريد الإلكتروني</Label>
                <Input type="email" value={editForm.email} onChange={(e) => setEditForm({ ...editForm, email: e.target.value })} dir="ltr" />
              </div>
              <div className="space-y-1">
                <Label>الدور</Label>
                <select value={editForm.role} onChange={(e) => setEditForm({ ...editForm, role: e.target.value })} className="w-full rounded-md border bg-background px-3 py-2 text-sm">
                  {ROLE_ORDER.map((r) => (
                    <option key={r} value={r}>{ROLE_LABELS[r]}</option>
                  ))}
                </select>
              </div>
              <div className="space-y-1">
                <Label>تاريخ الميلاد</Label>
                <Input type="date" value={editForm.birthDate} onChange={(e) => setEditForm({ ...editForm, birthDate: e.target.value })} />
              </div>
              {editForm.role === Role.INSTITUTION && (
                <div className="space-y-1">
                  <Label>الجهة التعليمية</Label>
                  <select value={editForm.institutionId} onChange={(e) => setEditForm({ ...editForm, institutionId: e.target.value })} className="w-full rounded-md border bg-background px-3 py-2 text-sm">
                    <option value="">اختر الجهة...</option>
                    {institutions.map((i) => (
                      <option key={i.id} value={i.id}>{i.name}</option>
                    ))}
                  </select>
                </div>
              )}
            </div>
            <div className="mt-4 flex gap-2">
              <Button disabled={isPending} onClick={handleSaveEdit}>حفظ</Button>
              <Button variant="outline" onClick={() => setEditing(null)}>إلغاء</Button>
            </div>
          </CardContent>
        </Card>
      )}

      {/* نموذج تغيير كلمة المرور */}
      {passwordTarget && (
        <Card>
          <CardHeader>
            <CardTitle className="text-base">
              تغيير كلمة مرور: {passwordTarget.name}
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="space-y-1">
              <Label>كلمة المرور الجديدة (12 حرفاً على الأقل)</Label>
              <Input
                type="password"
                value={passwordValue}
                onChange={(e) => setPasswordValue(e.target.value)}
                dir="ltr"
              />
            </div>
            <div className="mt-4 flex gap-2">
              <Button disabled={isPending} onClick={handleResetPassword}>تغيير</Button>
              <Button variant="outline" onClick={() => setPasswordTarget(null)}>إلغاء</Button>
            </div>
          </CardContent>
        </Card>
      )}

      {/* الجدول */}
      <Card>
        <CardHeader>
          <CardTitle className="text-base">قائمة المستخدمين</CardTitle>
          <CardDescription>{result?.total ?? 0} مستخدم</CardDescription>
        </CardHeader>
        <CardContent>
          {isPending && (
            <p className="py-4 text-center text-sm text-muted-foreground">جارٍ التحميل...</p>
          )}
          {!isPending && result && result.users.length === 0 && (
            <p className="py-8 text-center text-muted-foreground">لا يوجد مستخدمون</p>
          )}
          {!isPending && result && result.users.length > 0 && (
            <div className="space-y-2">
              {result.users.map((u) => (
                <div key={u.id} className="flex flex-wrap items-center justify-between gap-3 rounded-lg border px-4 py-3">
                  <div className="space-y-1">
                    <p className="font-medium">{u.name}</p>
                    <p className="text-xs text-muted-foreground" dir="ltr">
                      {u.email}
                    </p>
                    <div className="flex items-center gap-2 text-xs text-muted-foreground">
                      <span className="inline-flex items-center rounded-full bg-secondary-100 px-2 py-0.5 font-medium text-primary-700">
                        {ROLE_LABELS[u.role]}
                      </span>
                      {u.institution?.name && <span>{u.institution.name}</span>}
                      <span>
                        {new Date(u.createdAt).toLocaleDateString("ar-SA")}
                      </span>
                    </div>
                  </div>
                  <div className="flex flex-wrap gap-2">
                    <Button size="sm" variant="outline" onClick={() => openEdit(u)}>
                      تعديل
                    </Button>
                    <Button size="sm" variant="outline" onClick={() => setPasswordTarget(u)}>
                      تغيير كلمة المرور
                    </Button>
                    <Button size="sm" variant="destructive" onClick={() => handleDelete(u)}>
                      حذف
                    </Button>
                  </div>
                </div>
              ))}
            </div>
          )}

          {result && result.totalPages > 1 && (
            <div className="mt-4 flex items-center justify-center gap-2">
              <Button
                size="sm"
                variant="outline"
                disabled={result.page <= 1}
                onClick={() => setFilters((p) => ({ ...p, page: p.page - 1 }))}
              >
                السابق
              </Button>
              <span className="text-sm text-muted-foreground">
                صفحة {result.page} من {result.totalPages}
              </span>
              <Button
                size="sm"
                variant="outline"
                disabled={result.page >= result.totalPages}
                onClick={() => setFilters((p) => ({ ...p, page: p.page + 1 }))}
              >
                التالي
              </Button>
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
