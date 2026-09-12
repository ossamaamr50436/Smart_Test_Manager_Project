"use client";

import { useState, useTransition } from "react";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  createTenantAdmin,
  deleteTenantAdmin,
  getTenantAuditLog,
  getTenantSessions,
  resetTenantAdminPassword,
  updateTenant,
} from "@/lib/actions/super-admin-actions";

interface TenantDetail {
  id: string;
  name: string;
  slug: string;
  driveFolderId: string | null;
  driveFolderUrl: string | null;
  primaryColor: string;
  secondaryColor: string;
  isActive: boolean;
  createdAt: Date;
  updatedAt: Date;
  users: { id: string; name: string; email: string; role: string; createdAt: Date }[];
  institutions: { id: string; name: string; district: string; licenseNumber: string }[];
  _count: {
    students: number;
    examSeasons: number;
    examModels: number;
    committees: number;
    examSessions: number;
    certificates: number;
  };
}

interface AuditLogEntry {
  id: string;
  action: string;
  details: unknown;
  timestamp: Date;
  user: { name: string; email: string } | null;
}

interface SessionEntry {
  id: string;
  examDate: Date;
  period: string;
  status: string;
  student: { name: string; branch: string } | null;
  teacher1: { name: string } | null;
  teacher2: { name: string } | null;
  season: { name: string } | null;
}

export function TenantDetailsClient({ tenant }: { tenant: TenantDetail }) {
  return (
    <div className="space-y-6">
      <TenantHeader tenant={tenant} />
      <div className="grid gap-6 lg:grid-cols-2">
        <TenantUpdateForm tenant={tenant} />
        <TenantUsersSection tenant={tenant} />
      </div>
      <div className="grid gap-6 lg:grid-cols-2">
        <TenantInstitutions tenant={tenant} />
        <TenantSessionsSection tenantId={tenant.id} />
      </div>
      <TenantAuditSection tenantId={tenant.id} />
    </div>
  );
}

function TenantHeader({ tenant }: { tenant: TenantDetail }) {
  const stats = [
    { label: "الطلاب", value: tenant._count.students },
    { label: "المواسم", value: tenant._count.examSeasons },
    { label: "النماذج", value: tenant._count.examModels },
    { label: "اللجان", value: tenant._count.committees },
    { label: "الجلسات", value: tenant._count.examSessions },
    { label: "الشهادات", value: tenant._count.certificates },
  ];

  return (
    <Card>
      <CardHeader>
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div>
            <CardTitle className="text-xl">{tenant.name}</CardTitle>
            <CardDescription dir="ltr" className="mt-1 text-right">
              {tenant.slug}
            </CardDescription>
          </div>
          <span
            className={`rounded-full px-3 py-1 text-sm font-medium ${
              tenant.isActive ? "bg-green-100 text-green-700" : "bg-red-100 text-red-700"
            }`}
          >
            {tenant.isActive ? "نشطة" : "معطّلة"}
          </span>
        </div>
      </CardHeader>
      <CardContent className="space-y-4">
        <div className="flex items-center gap-2">
          <span
            className="h-8 w-8 rounded-full border"
            style={{ backgroundColor: tenant.primaryColor }}
            aria-label="اللون الأساسي"
          />
          <span
            className="h-8 w-8 rounded-full border"
            style={{ backgroundColor: tenant.secondaryColor }}
            aria-label="اللون الثانوي"
          />
          <span className="text-xs text-muted-foreground">
            ألوان المؤسسة — تنعكس على واجهات مستخدميها تلقائياً.
          </span>
        </div>

        <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-6">
          {stats.map((s) => (
            <div key={s.label} className="rounded-lg border p-3 text-center">
              <p className="text-2xl font-bold">{s.value}</p>
              <p className="text-xs text-muted-foreground">{s.label}</p>
            </div>
          ))}
        </div>

        <p className="text-xs text-muted-foreground">
          أُنشئت في {new Date(tenant.createdAt).toLocaleDateString("ar-SA")} — آخر تحديث{" "}
          {new Date(tenant.updatedAt).toLocaleDateString("ar-SA")}
        </p>
      </CardContent>
    </Card>
  );
}

function TenantUpdateForm({ tenant }: { tenant: TenantDetail }) {
  const [isPending, startTransition] = useTransition();
  const [message, setMessage] = useState("");
  const [error, setError] = useState("");
  const [form, setForm] = useState({
    name: tenant.name,
    driveFolderId: tenant.driveFolderId ?? "",
    driveFolderUrl: tenant.driveFolderUrl ?? "",
    primaryColor: tenant.primaryColor,
    secondaryColor: tenant.secondaryColor,
  });

  function update(field: keyof typeof form, value: string) {
    setForm((prev) => ({ ...prev, [field]: value }));
  }

  function handleSubmit() {
    setMessage("");
    setError("");
    startTransition(async () => {
      const result = await updateTenant(tenant.id, {
        name: form.name,
        driveFolderId: form.driveFolderId.trim() || undefined,
        driveFolderUrl: form.driveFolderUrl.trim() || undefined,
        primaryColor: form.primaryColor,
        secondaryColor: form.secondaryColor,
      });
      if (!result.success) {
        setError(result.error);
        return;
      }
      setMessage("تم تحديث بيانات المؤسسة.");
    });
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle>تعديل بيانات المؤسسة</CardTitle>
        <CardDescription>الاسم، مجلد Drive، والألوان.</CardDescription>
      </CardHeader>
      <CardContent className="space-y-4">
        <div className="space-y-2">
          <Label htmlFor="c-name">اسم المؤسسة</Label>
          <Input id="c-name" value={form.name} onChange={(e) => update("name", e.target.value)} />
        </div>
        <div className="grid gap-4 sm:grid-cols-2">
          <div className="space-y-2">
            <Label htmlFor="c-driveId">معرّف مجلد Drive</Label>
            <Input
              id="c-driveId"
              value={form.driveFolderId}
              onChange={(e) => update("driveFolderId", e.target.value)}
              dir="ltr"
            />
          </div>
          <div className="space-y-2">
            <Label htmlFor="c-driveUrl">رابط مجلد Drive</Label>
            <Input
              id="c-driveUrl"
              value={form.driveFolderUrl}
              onChange={(e) => update("driveFolderUrl", e.target.value)}
              dir="ltr"
            />
          </div>
        </div>
        <div className="grid gap-4 sm:grid-cols-2">
          <div className="space-y-2">
            <Label htmlFor="c-primary">اللون الأساسي</Label>
            <div className="flex items-center gap-2">
              <Input
                id="c-primary"
                value={form.primaryColor}
                onChange={(e) => update("primaryColor", e.target.value)}
                dir="ltr"
              />
              <input
                type="color"
                value={form.primaryColor}
                onChange={(e) => update("primaryColor", e.target.value)}
                className="h-9 w-10 cursor-pointer rounded-md border"
                aria-label="اختيار اللون الأساسي"
              />
            </div>
          </div>
          <div className="space-y-2">
            <Label htmlFor="c-secondary">اللون الثانوي</Label>
            <div className="flex items-center gap-2">
              <Input
                id="c-secondary"
                value={form.secondaryColor}
                onChange={(e) => update("secondaryColor", e.target.value)}
                dir="ltr"
              />
              <input
                type="color"
                value={form.secondaryColor}
                onChange={(e) => update("secondaryColor", e.target.value)}
                className="h-9 w-10 cursor-pointer rounded-md border"
                aria-label="اختيار اللون الثانوي"
              />
            </div>
          </div>
        </div>

        {error && <p className="rounded-md bg-red-50 px-3 py-2 text-sm text-red-700">{error}</p>}
        {message && (
          <p className="rounded-md bg-green-50 px-3 py-2 text-sm text-green-700">{message}</p>
        )}

        <Button type="button" disabled={isPending} onClick={handleSubmit}>
          {isPending ? "جارٍ الحفظ..." : "حفظ التعديلات"}
        </Button>
      </CardContent>
    </Card>
  );
}

function TenantUsersSection({ tenant }: { tenant: TenantDetail }) {
  const admins = tenant.users.filter((u) => u.role === "ADMIN");
  const others = tenant.users.filter((u) => u.role !== "ADMIN");

  return (
    <Card>
      <CardHeader>
        <CardTitle>مستخدمون ({tenant.users.length})</CardTitle>
        <CardDescription>المشرفون والعاملون في المؤسسة.</CardDescription>
      </CardHeader>
      <CardContent className="space-y-4">
        {tenant.users.length === 0 ? (
          <p className="text-sm text-muted-foreground">لا يوجد مستخدمون بعد.</p>
        ) : (
          <>
            {admins.map((user) => (
              <UserRow key={user.id} tenantId={tenant.id} user={user} isAdmin />
            ))}
            {others.map((user) => (
              <UserRow key={user.id} tenantId={tenant.id} user={user} />
            ))}
          </>
        )}
        <CreateAdminForm tenantId={tenant.id} />
      </CardContent>
    </Card>
  );
}

function UserRow({
  tenantId,
  user,
  isAdmin = false,
}: {
  tenantId: string;
  user: { id: string; name: string; email: string; role: string; createdAt: Date };
  isAdmin?: boolean;
}) {
  const [isPending, startTransition] = useTransition();
  const [feedback, setFeedback] = useState("");
  const [resetPassword, setResetPassword] = useState("");

  function handleReset() {
    setFeedback("");
    if (!resetPassword.trim()) {
      setFeedback("أدخل كلمة مرور جديدة أولاً.");
      return;
    }
    startTransition(async () => {
      const result = await resetTenantAdminPassword({
        tenantId,
        adminUserId: user.id,
        newPassword: resetPassword,
      });
      if (!result.success) {
        setFeedback(result.error);
        return;
      }
      setFeedback("تم تحديث كلمة المرور.");
      setResetPassword("");
    });
  }

  function handleDelete() {
    setFeedback("");
    startTransition(async () => {
      const result = await deleteTenantAdmin({ tenantId, adminUserId: user.id });
      if (!result.success) {
        setFeedback(result.error);
        return;
      }
      setFeedback("تم حذف المشرف.");
      location.reload();
    });
  }

  return (
    <div className="rounded-lg border p-3">
      <div className="flex items-center justify-between gap-3">
        <div>
          <p className="font-medium">
            {user.name}
            {isAdmin && (
              <span className="mr-2 rounded-full bg-primary/10 px-2 py-0.5 text-xs text-primary">
                مشرف
              </span>
            )}
          </p>
          <p className="text-xs text-muted-foreground" dir="ltr">
            {user.email}
          </p>
        </div>
        {isAdmin && (
          <div className="flex items-center gap-2">
            <Input
              value={resetPassword}
              onChange={(e) => setResetPassword(e.target.value)}
              placeholder="كلمة مرور جديدة"
              className="h-8 w-40 text-xs"
              dir="ltr"
            />
            <Button type="button" size="sm" variant="outline" disabled={isPending} onClick={handleReset}>
              تغيير
            </Button>
            <Button type="button" size="sm" variant="destructive" disabled={isPending} onClick={handleDelete}>
              حذف
            </Button>
          </div>
        )}
      </div>
      {feedback && <p className="mt-2 text-xs text-muted-foreground">{feedback}</p>}
    </div>
  );
}

function CreateAdminForm({ tenantId }: { tenantId: string }) {
  const [isPending, startTransition] = useTransition();
  const [error, setError] = useState("");
  const [message, setMessage] = useState("");
  const [form, setForm] = useState({ name: "", email: "", password: "" });

  function update(field: keyof typeof form, value: string) {
    setForm((prev) => ({ ...prev, [field]: value }));
  }

  function handleSubmit() {
    setError("");
    setMessage("");
    startTransition(async () => {
      const result = await createTenantAdmin({
        tenantId,
        name: form.name,
        email: form.email,
        password: form.password,
      });
      if (!result.success) {
        setError(result.error);
        return;
      }
      setMessage("تم إنشاء المشرف — سيُطلب منه تغيير كلمة المرور عند أول دخول.");
      setForm({ name: "", email: "", password: "" });
      location.reload();
    });
  }

  return (
    <div className="rounded-lg border border-dashed p-4">
      <p className="text-sm font-medium">إنشاء مشرف جديد</p>
      <div className="mt-3 grid gap-3 sm:grid-cols-3">
        <Input
          value={form.name}
          onChange={(e) => update("name", e.target.value)}
          placeholder="الاسم"
        />
        <Input
          value={form.email}
          onChange={(e) => update("email", e.target.value)}
          placeholder="البريد الإلكتروني"
          dir="ltr"
        />
        <Input
          type="password"
          value={form.password}
          onChange={(e) => update("password", e.target.value)}
          placeholder="كلمة المرور"
          dir="ltr"
        />
      </div>
      {error && <p className="mt-2 text-xs text-red-700">{error}</p>}
      {message && <p className="mt-2 text-xs text-green-700">{message}</p>}
      <Button type="button" size="sm" className="mt-3" disabled={isPending} onClick={handleSubmit}>
        {isPending ? "جارٍ الإنشاء..." : "إنشاء المشرف"}
      </Button>
    </div>
  );
}

function TenantInstitutions({ tenant }: { tenant: TenantDetail }) {
  return (
    <Card>
      <CardHeader>
        <CardTitle>الجهات التعليمية ({tenant.institutions.length})</CardTitle>
        <CardDescription>أول 200 جهة مسجلة في المؤسسة.</CardDescription>
      </CardHeader>
      <CardContent>
        {tenant.institutions.length === 0 ? (
          <p className="text-sm text-muted-foreground">لا توجد جهات تعليمية بعد.</p>
        ) : (
          <ul className="divide-y">
            {tenant.institutions.map((inst) => (
              <li key={inst.id} className="py-2">
                <p className="font-medium">{inst.name}</p>
                <p className="text-xs text-muted-foreground">
                  {inst.district || "—"} · {inst.licenseNumber || "بدون ترخيص"}
                </p>
              </li>
            ))}
          </ul>
        )}
      </CardContent>
    </Card>
  );
}

function TenantSessionsSection({ tenantId }: { tenantId: string }) {
  const [sessions, setSessions] = useState<SessionEntry[] | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");

  async function load() {
    setLoading(true);
    setError("");
    try {
      const result = await getTenantSessions(tenantId);
      setSessions(result);
    } catch {
      setError("تعذّر تحميل الجلسات.");
    } finally {
      setLoading(false);
    }
  }

  return (
    <Card>
      <CardHeader>
        <div className="flex items-center justify-between">
          <div>
            <CardTitle>أحدث الجلسات</CardTitle>
            <CardDescription>أحدث 100 جلسة اختبار في المؤسسة.</CardDescription>
          </div>
          {sessions === null && (
            <Button type="button" size="sm" variant="outline" disabled={loading} onClick={load}>
              {loading ? "جارٍ التحميل..." : "تحميل"}
            </Button>
          )}
        </div>
      </CardHeader>
      <CardContent>
        {error && <p className="text-sm text-red-700">{error}</p>}
        {sessions === null && !error && (
          <p className="text-sm text-muted-foreground">اضغط &quot;تحميل&quot; لعرض الجلسات.</p>
        )}
        {sessions !== null && sessions.length === 0 && (
          <p className="text-sm text-muted-foreground">لا توجد جلسات بعد.</p>
        )}
        {sessions !== null && sessions.length > 0 && (
          <ul className="divide-y">
            {sessions.map((s) => (
              <li key={s.id} className="flex items-center justify-between gap-3 py-2">
                <div>
                  <p className="font-medium">{s.student?.name ?? "طالب محذوف"}</p>
                  <p className="text-xs text-muted-foreground">
                    {s.season?.name ?? "—"} · {s.student?.branch ?? ""}
                  </p>
                </div>
                <div className="text-left text-xs text-muted-foreground">
                  <p>{new Date(s.examDate).toLocaleDateString("ar-SA")}</p>
                  {s.teacher1?.name && <p>{s.teacher1.name}</p>}
                </div>
              </li>
            ))}
          </ul>
        )}
      </CardContent>
    </Card>
  );
}

function TenantAuditSection({ tenantId }: { tenantId: string }) {
  const [logs, setLogs] = useState<AuditLogEntry[] | null>(null);
  const [page, setPage] = useState(1);
  const [totalPages, setTotalPages] = useState(1);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");

  async function load(targetPage: number) {
    setLoading(true);
    setError("");
    try {
      const result = await getTenantAuditLog(tenantId, { page: targetPage, pageSize: 15 });
      setLogs(result.logs);
      setTotalPages(result.totalPages);
      setPage(result.page);
    } catch {
      setError("تعذّر تحميل سجل التدقيق.");
    } finally {
      setLoading(false);
    }
  }

  return (
    <Card>
      <CardHeader>
        <div className="flex items-center justify-between">
          <div>
            <CardTitle>سجل التدقيق</CardTitle>
            <CardDescription>كل العمليات المسجلة ضمن هذه المؤسسة.</CardDescription>
          </div>
          {logs === null && (
            <Button type="button" size="sm" variant="outline" disabled={loading} onClick={() => load(1)}>
              {loading ? "جارٍ التحميل..." : "تحميل"}
            </Button>
          )}
        </div>
      </CardHeader>
      <CardContent>
        {error && <p className="text-sm text-red-700">{error}</p>}
        {logs === null && !error && (
          <p className="text-sm text-muted-foreground">اضغط &quot;تحميل&quot; لعرض السجل.</p>
        )}
        {logs !== null && logs.length === 0 && (
          <p className="text-sm text-muted-foreground">لا توجد عمليات مسجلة.</p>
        )}
        {logs !== null && logs.length > 0 && (
          <>
            <ul className="divide-y">
              {logs.map((log) => (
                <li key={log.id} className="flex items-start justify-between gap-3 py-2">
                  <div>
                    <p className="text-sm font-medium">{log.action}</p>
                    <p className="text-xs text-muted-foreground">
                      {log.user ? `${log.user.name} (${log.user.email})` : "النظام"}
                    </p>
                    {typeof log.details === "object" &&
                      log.details !== null &&
                      Object.keys(log.details).length > 0 && (
                        <p className="mt-1 text-xs text-muted-foreground" dir="ltr">
                          {JSON.stringify(log.details)}
                        </p>
                      )}
                  </div>
                  <span className="whitespace-nowrap text-xs text-muted-foreground">
                    {new Date(log.timestamp).toLocaleString("ar-SA", {
                      dateStyle: "short",
                      timeStyle: "short",
                    })}
                  </span>
                </li>
              ))}
            </ul>
            <div className="mt-4 flex items-center justify-between">
              <Button
                type="button"
                size="sm"
                variant="outline"
                disabled={loading || page <= 1}
                onClick={() => load(page - 1)}
              >
                السابق
              </Button>
              <span className="text-xs text-muted-foreground">
                صفحة {page} من {totalPages}
              </span>
              <Button
                type="button"
                size="sm"
                variant="outline"
                disabled={loading || page >= totalPages}
                onClick={() => load(page + 1)}
              >
                التالي
              </Button>
            </div>
          </>
        )}
      </CardContent>
    </Card>
  );
}