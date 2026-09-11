"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { createInstitutionBySpecialist } from "@/lib/actions/entity-actions";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { PhoneInput } from "@/components/ui/phone-input";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Copy, Check } from "lucide-react";

const EMPTY_FORM = {
  name: "",
  managerName: "",
  supervisorName: "",
  managerPhone: "+9665",
  supervisorPhone: "+9665",
  licenseNumber: "",
  district: "",
  email: "",
};

export function EntityCreateForm() {
  const router = useRouter();
  const [form, setForm] = useState(EMPTY_FORM);
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);
  const [created, setCreated] = useState<{
    password: string;
    email: string;
  } | null>(null);
  const [copied, setCopied] = useState(false);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError("");
    setCopied(false);
    setLoading(true);
    try {
      const result = await createInstitutionBySpecialist(form);
      if (result.success) {
        setCreated({ password: result.password, email: result.email });
        setForm(EMPTY_FORM);
        router.refresh();
      } else {
        setError(result.error);
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : "حدث خطأ غير متوقع");
    } finally {
      setLoading(false);
    }
  }

  async function handleCopy() {
    if (!created) return;
    try {
      await navigator.clipboard.writeText(created.password);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch {
      // تجاهل فشل النسخ في المتصفحات غير المدعومة
    }
  }

  return (
    <div className="space-y-6">
      <Card className="w-full max-w-2xl">
        <CardHeader>
          <CardTitle>إنشاء جهة تعليمية</CardTitle>
          <CardDescription>
            كلمة المرور التلقائية للجهة = رقم التصريح، وسيُطلب منها التغيير عند أول تسجيل دخول
          </CardDescription>
        </CardHeader>
        <CardContent>
          <form onSubmit={handleSubmit} className="space-y-4">
            <div className="grid gap-4 sm:grid-cols-2">
              <div className="space-y-2 sm:col-span-2">
                <Label htmlFor="instName">اسم الجهة *</Label>
                <Input
                  id="instName"
                  value={form.name}
                  onChange={(e) => setForm({ ...form, name: e.target.value })}
                  placeholder="اسم الجهة التعليمية"
                  dir="rtl"
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="managerName">اسم مدير الجهة *</Label>
                <Input
                  id="managerName"
                  value={form.managerName}
                  onChange={(e) => setForm({ ...form, managerName: e.target.value })}
                  dir="rtl"
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="supervisorName">اسم مشرف الجهة *</Label>
                <Input
                  id="supervisorName"
                  value={form.supervisorName}
                  onChange={(e) => setForm({ ...form, supervisorName: e.target.value })}
                  dir="rtl"
                />
              </div>
              <div className="space-y-2">
                <PhoneInput
                  id="managerPhone"
                  label="رقم هاتف مدير الجهة"
                  value={form.managerPhone}
                  onChange={(v) => setForm({ ...form, managerPhone: v })}
                  required
                />
              </div>
              <div className="space-y-2">
                <PhoneInput
                  id="supervisorPhone"
                  label="رقم هاتف مشرف الجهة"
                  value={form.supervisorPhone}
                  onChange={(v) => setForm({ ...form, supervisorPhone: v })}
                  required
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="licenseNumber">رقم التصريح * (كلمة المرور التلقائية)</Label>
                <Input
                  id="licenseNumber"
                  value={form.licenseNumber}
                  onChange={(e) => setForm({ ...form, licenseNumber: e.target.value })}
                  dir="ltr"
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="district">الحي *</Label>
                <Input
                  id="district"
                  value={form.district}
                  onChange={(e) => setForm({ ...form, district: e.target.value })}
                  dir="rtl"
                />
              </div>
              <div className="space-y-2 sm:col-span-2">
                <Label htmlFor="instEmail">البريد الإلكتروني *</Label>
                <Input
                  id="instEmail"
                  type="email"
                  value={form.email}
                  onChange={(e) => setForm({ ...form, email: e.target.value })}
                  placeholder="inst@example.com"
                  dir="ltr"
                />
              </div>
            </div>

            {error && (
              <p className="rounded-md bg-destructive/10 px-3 py-2 text-sm text-destructive">
                {error}
              </p>
            )}

            <Button type="submit" disabled={loading}>
              {loading ? "جارٍ الإنشاء..." : "إنشاء الجهة"}
            </Button>
          </form>
        </CardContent>
      </Card>

      {created && (
        <Card className="w-full max-w-2xl border-emerald-300 bg-emerald-50">
          <CardHeader>
            <CardTitle className="text-emerald-700">
              تم إنشاء الجهة بنجاح
            </CardTitle>
            <CardDescription>
              اعرض بيانات الدخول للجهة الآن — لا يمكن استرجاع كلمة المرور بعد إغلاق هذه الصفحة
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="rounded-lg border border-emerald-200 bg-white p-4">
              <p className="text-sm text-muted-foreground">بيانات الدخول</p>
              <div className="mt-1 space-y-2">
                <p className="text-sm" dir="ltr">
                  البريد: <span dir="ltr" className="font-medium">{created.email}</span>
                </p>
                <div className="flex flex-wrap items-center gap-2">
                  <p className="text-sm" dir="ltr">
                    كلمة المرور:{" "}
                    <span dir="ltr" className="font-mono font-semibold">
                      {created.password}
                    </span>
                  </p>
                  <Button
                    type="button"
                    variant="outline"
                    size="sm"
                    onClick={handleCopy}
                  >
                    {copied ? (
                      <Check className="ml-1 h-4 w-4 text-emerald-600" />
                    ) : (
                      <Copy className="ml-1 h-4 w-4" />
                    )}
                    {copied ? "تم النسخ" : "نسخ"}
                  </Button>
                </div>
                <p className="text-xs text-emerald-700">
                  ستُجبر الجهة على تغيير كلمة المرور عند أول تسجيل دخول.
                </p>
              </div>
            </div>
          </CardContent>
        </Card>
      )}
    </div>
  );
}