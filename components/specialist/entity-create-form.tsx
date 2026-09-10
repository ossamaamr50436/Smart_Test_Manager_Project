"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { createInstitutionBySpecialist } from "@/lib/actions/entity-actions";
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
import { Copy, Check } from "lucide-react";

export function EntityCreateForm() {
  const router = useRouter();
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
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
      const result = await createInstitutionBySpecialist({ name, email });
      setCreated({ password: result.password, email: result.email });
      setName("");
      setEmail("");
      router.refresh();
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
      <Card className="w-full max-w-xl">
        <CardHeader>
          <CardTitle>إنشاء جهة تعليمية</CardTitle>
          <CardDescription>
            أنشئ جهة تعليمية جديدة — سيتم توليد كلمة مرور تلقائياً لبيانها للجهة
          </CardDescription>
        </CardHeader>
        <CardContent>
          <form onSubmit={handleSubmit} className="space-y-4">
            <div className="space-y-2">
              <Label htmlFor="institutionName">اسم الجهة *</Label>
              <Input
                id="institutionName"
                value={name}
                onChange={(e) => setName(e.target.value)}
                placeholder="اسم الجهة التعليمية"
                dir="rtl"
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="institutionEmail">البريد الإلكتروني *</Label>
              <Input
                id="institutionEmail"
                type="email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                placeholder="inst@example.com"
                dir="ltr"
              />
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
        <Card className="w-full max-w-xl border-emerald-300 bg-emerald-50">
          <CardHeader>
            <CardTitle className="text-emerald-700">
              تم إنشاء الجهة بنجاح
            </CardTitle>
            <CardDescription>
              اعرض كلمة المرور للجهة الآن — لا يمكن استرجاعها مرة أخرى بعد إغلاق هذه الصفحة
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="rounded-lg border border-emerald-200 bg-white p-4">
              <p className="text-sm text-muted-foreground">بيانات الدخول</p>
              <div className="mt-1 space-y-1">
                <p className="text-sm" dir="ltr">
                  البريد: <span dir="ltr" className="font-medium">{created.email}</span>
                </p>
                <div className="flex items-center gap-2">
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
              </div>
            </div>
          </CardContent>
        </Card>
      )}
    </div>
  );
}