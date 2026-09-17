"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
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
import { createTenant } from "@/lib/actions/super-admin-actions";

export function CreateTenantForm() {
  const router = useRouter();
  const [isPending, startTransition] = useTransition();
  const [error, setError] = useState("");
  const [form, setForm] = useState({
    name: "",
    slug: "",
    uploadthingToken: "",
    primaryColor: "#015e63",
    secondaryColor: "#d3bb8b",
  });

  function update(field: keyof typeof form, value: string) {
    setForm((prev) => ({ ...prev, [field]: value }));
  }

  function handleSubmit() {
    setError("");
    startTransition(async () => {
      const result = await createTenant({
        name: form.name,
        slug: form.slug,
        uploadthingToken: form.uploadthingToken.trim(),
        primaryColor: form.primaryColor,
        secondaryColor: form.secondaryColor,
      });
      if (!result.success) {
        setError(result.error);
        return;
      }
      router.push(`/super-admin/tenants/${result.tenantId}`);
      router.refresh();
    });
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle>بيانات المؤسسة</CardTitle>
        <CardDescription>
          المعرّف (slug) يُستخدم كرمز تأكيد للحذف القسري لاحقاً.
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-4">
        <div className="grid gap-4 sm:grid-cols-2">
          <div className="space-y-2">
            <Label htmlFor="name">اسم المؤسسة</Label>
            <Input
              id="name"
              value={form.name}
              onChange={(e) => update("name", e.target.value)}
              placeholder="مثال: مركز الإبداع التعليمي"
            />
          </div>
          <div className="space-y-2">
            <Label htmlFor="slug">المعرّف (slug)</Label>
            <Input
              id="slug"
              value={form.slug}
              onChange={(e) => update("slug", e.target.value)}
              placeholder="مثال: riyadh-quran"
              dir="ltr"
            />
          </div>
        </div>

        <div className="space-y-2">
          <Label htmlFor="uploadthingToken">مفتاح UploadThing (sk_live_...)</Label>
          <Input
            id="uploadthingToken"
            type="password"
            value={form.uploadthingToken}
            onChange={(e) => update("uploadthingToken", e.target.value)}
            placeholder="sk_live_..."
            dir="ltr"
            autoComplete="off"
          />
          <p className="text-xs text-muted-foreground">
            يُخزَّن المفتاح بتجزئة SHA256 للأمان، ويُعرض للمشرفين عند الطلب.
          </p>
        </div>

        <div className="grid gap-4 sm:grid-cols-2">
          <div className="space-y-2">
            <Label htmlFor="primaryColor">اللون الأساسي</Label>
            <div className="flex items-center gap-2">
              <Input
                id="primaryColor"
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
            <Label htmlFor="secondaryColor">اللون الثانوي</Label>
            <div className="flex items-center gap-2">
              <Input
                id="secondaryColor"
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

        {error && (
          <p className="rounded-md bg-red-50 px-3 py-2 text-sm text-red-700">{error}</p>
        )}

        <div className="flex justify-end gap-2">
          <Button
            type="button"
            variant="outline"
            onClick={() => router.push("/super-admin/tenants")}
          >
            إلغاء
          </Button>
          <Button type="button" disabled={isPending} onClick={handleSubmit}>
            {isPending ? "جارٍ الإنشاء..." : "إنشاء المؤسسة"}
          </Button>
        </div>
      </CardContent>
    </Card>
  );
}