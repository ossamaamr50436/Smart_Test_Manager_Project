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
import {
  activateTenant,
  deactivateTenant,
  deleteTenant,
  forceDeleteTenant,
} from "@/lib/actions/super-admin-actions";

interface TenantControlsProps {
  tenantId: string;
  tenantName: string;
  tenantSlug: string;
  isActive: boolean;
  emptyForDelete: boolean;
}

export function TenantControls({
  tenantId,
  tenantName,
  tenantSlug,
  isActive,
  emptyForDelete,
}: TenantControlsProps) {
  const router = useRouter();
  const [isPending, startTransition] = useTransition();
  const [message, setMessage] = useState("");
  const [error, setError] = useState("");
  const [deactivateReason, setDeactivateReason] = useState("");
  const [confirmToken, setConfirmToken] = useState("");

  function run(action: () => Promise<{ success?: boolean; error?: string }>) {
    setError("");
    setMessage("");
    startTransition(async () => {
      const result = await action();
      if (!result.success) {
        setError(result.error ?? "حدث خطأ");
        return;
      }
      setMessage("تمت العملية بنجاح.");
      router.refresh();
    });
  }

  function handleDeactivate() {
    setError("");
    setMessage("");
    if (!deactivateReason.trim()) {
      setError("سبب التعطيل مطلوب.");
      return;
    }
    startTransition(async () => {
      const result = await deactivateTenant(tenantId, deactivateReason);
      if (!result.success) {
        setError(result.error);
        return;
      }
      setMessage("تم تعطيل المؤسسة.");
      router.refresh();
    });
  }

  function handleForceDelete() {
    setError("");
    setMessage("");
    if (confirmToken.trim() !== tenantSlug) {
      setError(`اكتب المعرّف بشكل صحيح للحذف: ${tenantSlug}`);
      return;
    }
    startTransition(async () => {
      const result = await forceDeleteTenant(tenantId, confirmToken);
      if (!result.success) {
        setError(result.error);
        return;
      }
      setMessage("تم حذف المؤسسة نهائياً.");
      router.push("/super-admin/tenants");
      router.refresh();
    });
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle>التحكم في المؤسسة</CardTitle>
        <CardDescription>تفعيل وتعطيل، أو حذف المؤسسة.</CardDescription>
      </CardHeader>
      <CardContent className="space-y-6">
        {message && (
          <p className="rounded-md bg-green-50 px-3 py-2 text-sm text-green-700">{message}</p>
        )}
        {error && (
          <p className="rounded-md bg-red-50 px-3 py-2 text-sm text-red-700">{error}</p>
        )}

        {/* التفعيل / التعطيل */}
        <div className="space-y-3 rounded-lg border p-4">
          <p className="text-sm font-medium">
            الحالة: {isActive ? "نشطة" : "معطّلة"}{" "}
            <span className="text-muted-foreground">
              (تعطيل المؤسسة يمنع مديريها من العمل)
            </span>
          </p>
          {isActive ? (
            <div className="space-y-2">
              <Label htmlFor="deactivateReason">سبب التعطيل</Label>
              <Input
                id="deactivateReason"
                value={deactivateReason}
                onChange={(e) => setDeactivateReason(e.target.value)}
                placeholder="مثال: انتهاء الاشتراك"
              />
              <Button
                type="button"
                variant="outline"
                disabled={isPending}
                onClick={handleDeactivate}
              >
                تعطيل المؤسسة
              </Button>
            </div>
          ) : (
            <Button
              type="button"
              disabled={isPending}
              onClick={() => run(() => activateTenant(tenantId))}
            >
              تفعيل المؤسسة
            </Button>
          )}
        </div>

        {/* الحذف الآمن */}
        <div className="space-y-3 rounded-lg border border-red-100 p-4">
          <p className="text-sm font-semibold text-red-700">حذف المؤسسة</p>
          {emptyForDelete ? (
            <p className="text-xs text-muted-foreground">
              المؤسسة فارغة (لا مستخدمين أو جهات أو طلاب) — يمكن حذفها بأمان.
            </p>
          ) : (
            <p className="text-xs text-muted-foreground">
              الحذف الآمن متاح فقط للمؤسسات الفارغة. لحذف مؤسسة غير فارغة استخدم
              الحذف القسري بعناية.
            </p>
          )}
          <Button
            type="button"
            variant="outline"
            disabled={isPending || !emptyForDelete}
            onClick={() => run(() => deleteTenant(tenantId))}
          >
            حذف آمن
          </Button>

          {!emptyForDelete && (
            <div className="space-y-2 border-t border-dashed pt-3">
              <Label htmlFor="confirmToken">الحذف القسري — اكتب المعرّف للموافقة</Label>
              <Input
                id="confirmToken"
                value={confirmToken}
                onChange={(e) => setConfirmToken(e.target.value)}
                placeholder={tenantSlug}
                dir="ltr"
              />
              <Button
                type="button"
                variant="destructive"
                disabled={isPending}
                onClick={handleForceDelete}
              >
                حذف قسري نهائي
              </Button>
              <p className="text-xs text-muted-foreground">
                سيُحذف {tenantName} مع كل بياناته وطلابه وجلساته نهائياً — لا يمكن التراجع.
              </p>
            </div>
          )}
        </div>
      </CardContent>
    </Card>
  );
}