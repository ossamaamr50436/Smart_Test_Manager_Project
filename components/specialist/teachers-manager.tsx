"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import {
  createExaminer,
  resetExaminerPassword,
  deleteExaminer,
  getExaminersList,
  type CreateExaminerInput,
} from "@/lib/actions/examiner-actions";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";

type ExaminerRow = {
  id: string;
  name: string;
  email: string;
  birthDate: Date;
  createdAt: Date;
  _count: {
    sessionsAsTeacher1: number;
    sessionsAsTeacher2: number;
    committeesAsTeacher1: number;
    committeesAsTeacher2: number;
  };
};

const EMPTY_FORM = { name: "", email: "", password: "", birthDate: "" };

export function TeachersManager({ initial }: { initial: ExaminerRow[] }) {
  const router = useRouter();
  const [examiners, setExaminers] = useState<ExaminerRow[]>(initial);
  const [form, setForm] = useState(EMPTY_FORM);
  const [error, setError] = useState("");
  const [success, setSuccess] = useState("");
  const [loading, setLoading] = useState(false);

  const [resetId, setResetId] = useState<string | null>(null);
  const [resetPassword, setResetPassword] = useState("");
  const [confirmDeleteId, setConfirmDeleteId] = useState<string | null>(null);

  function refresh() {
    router.refresh();
  }

  async function loadFromServer() {
    try {
      const list = await getExaminersList();
      setExaminers(list);
    } catch (e) {
      setError(e instanceof Error ? e.message : "تعذر تحميل المعلمين");
    }
  }

  async function handleCreate(e: React.FormEvent) {
    e.preventDefault();
    setError("");
    setSuccess("");
    setLoading(true);
    try {
      const input: CreateExaminerInput = {
        name: form.name,
        email: form.email,
        password: form.password,
        birthDate: new Date(form.birthDate),
      };
      const result = await createExaminer(input);
      if (result.success) {
        setSuccess(`تم إنشاء حساب المعلم «${form.name}» — كلمة المرور المؤقتة: ${form.password}`);
        setForm(EMPTY_FORM);
        await loadFromServer();
      } else {
        setError(result.error);
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : "حدث خطأ غير متوقع");
    } finally {
      setLoading(false);
    }
  }

  async function handleReset(examinerId: string) {
    setError("");
    setSuccess("");
    setLoading(true);
    try {
      const result = await resetExaminerPassword(examinerId, resetPassword);
      if (result.success) {
        setSuccess("تمت إعادة تعيين كلمة المرور وتحديث الحساب");
        setResetId(null);
        setResetPassword("");
      } else {
        setError(result.error);
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : "حدث خطأ غير متوقع");
    } finally {
      setLoading(false);
    }
  }

  async function handleDelete(examinerId: string) {
    setError("");
    setSuccess("");
    setLoading(true);
    try {
      const result = await deleteExaminer(examinerId);
      if (result.success) {
        setSuccess("تم حذف المعلم");
        setConfirmDeleteId(null);
        await loadFromServer();
      } else {
        setError(result.error);
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : "حدث خطأ غير متوقع");
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="space-y-6">
      {error && (
        <p className="rounded-md border border-destructive/20 bg-destructive/10 px-4 py-3 text-sm text-destructive">{error}</p>
      )}
      {success && (
        <p className="rounded-md border border-primary/20 bg-primary/10 px-4 py-3 text-sm text-primary">{success}</p>
      )}

      <Card>
        <CardHeader>
          <CardTitle className="text-base">إنشاء حساب معلم جديد</CardTitle>
          <CardDescription>
            كلمة المرور المؤقتة معروضة لك مرة واحدة بعد الإنشاء — سيُجبر المعلم على تغييرها عند أول دخول
          </CardDescription>
        </CardHeader>
        <CardContent>
          <form onSubmit={handleCreate} className="grid gap-4 sm:grid-cols-2">
            <div className="space-y-2">
              <Label htmlFor="exName">الاسم الكامل *</Label>
              <Input
                id="exName"
                value={form.name}
                onChange={(e) => setForm({ ...form, name: e.target.value })}
                dir="rtl"
                required
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="exEmail">البريد الإلكتروني *</Label>
              <Input
                id="exEmail"
                type="email"
                value={form.email}
                onChange={(e) => setForm({ ...form, email: e.target.value })}
                dir="ltr"
                required
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="exBirth">تاريخ الميلاد *</Label>
              <Input
                id="exBirth"
                type="date"
                value={form.birthDate}
                onChange={(e) => setForm({ ...form, birthDate: e.target.value })}
                required
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="exPassword">
                كلمة المرور المؤقتة * (5 أحرف + حرف كبير وصغير ورقم)
              </Label>
              <Input
                id="exPassword"
                value={form.password}
                onChange={(e) => setForm({ ...form, password: e.target.value })}
                dir="ltr"
                required
              />
            </div>
            <div className="sm:col-span-2">
              <Button type="submit" disabled={loading}>
                {loading ? "جارٍ الإنشاء..." : "إنشاء حساب المعلم"}
              </Button>
            </div>
          </form>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle className="text-base">المعلمون</CardTitle>
          <CardDescription>{examiners.length} معلم</CardDescription>
        </CardHeader>
        <CardContent>
          {examiners.length === 0 ? (
            <p className="py-8 text-center text-muted-foreground">لا يوجد معلمون بعد</p>
          ) : (
            <div className="overflow-x-auto rounded-lg border">
              <table className="w-full text-sm">
                <thead className="bg-muted/60">
                  <tr className="text-right">
                    <th className="px-3 py-2 font-medium">المعلم</th>
                    <th className="px-3 py-2 font-medium">الارتباط</th>
                    <th className="px-3 py-2 font-medium">إجراءات</th>
                  </tr>
                </thead>
                <tbody>
                  {examiners.map((ex) => (
                    <tr key={ex.id} className="border-t">
                      <td className="px-3 py-2">
                        <p className="font-medium">{ex.name}</p>
                        <p className="text-xs text-muted-foreground" dir="ltr">{ex.email}</p>
                      </td>
                      <td className="px-3 py-2 text-xs text-muted-foreground">
                        {ex._count.committeesAsTeacher1 + ex._count.committeesAsTeacher2} لجنة —{" "}
                        {ex._count.sessionsAsTeacher1 + ex._count.sessionsAsTeacher2} جلسة
                      </td>
                      <td className="px-3 py-2">
                        <div className="flex flex-wrap gap-2">
                          <Button
                            size="sm"
                            variant="outline"
                            onClick={() => {
                              setResetId(ex.id);
                              setResetPassword("");
                            }}
                          >
                            إعادة تعيين كلمة المرور
                          </Button>
                          {confirmDeleteId === ex.id ? (
                            <>
                              <Button size="sm" variant="destructive" disabled={loading} onClick={() => handleDelete(ex.id)}>
                                تأكيد الحذف
                              </Button>
                              <Button size="sm" variant="ghost" onClick={() => setConfirmDeleteId(null)}>
                                إلغاء
                              </Button>
                            </>
                          ) : (
                            <Button size="sm" variant="ghost" onClick={() => setConfirmDeleteId(ex.id)}>
                              حذف
                            </Button>
                          )}
                        </div>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}

          {resetId && (
            <div className="mt-4 rounded-lg border bg-muted/40 p-4">
              <Label htmlFor="resetPass">
                كلمة مرور جديدة (5 أحرف + حرف كبير وصغير ورقم)
              </Label>
              <div className="mt-2 flex flex-wrap items-center gap-2">
                <Input
                  id="resetPass"
                  value={resetPassword}
                  onChange={(e) => setResetPassword(e.target.value)}
                  dir="ltr"
                  className="max-w-xs"
                />
                <Button disabled={loading} onClick={() => handleReset(resetId)}>حفظ</Button>
                <Button variant="outline" onClick={() => setResetId(null)}>إلغاء</Button>
              </div>
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}