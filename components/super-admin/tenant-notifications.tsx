"use client";

import { useState, useTransition } from "react";
import { NotificationType } from "@prisma/client";
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
  notifyAllAdmins,
  notifyAllTenantUsers,
  notifyTenantAdmins,
  broadcastToAllUsers,
} from "@/lib/actions/super-admin-actions";

interface TenantNotificationsProps {
  tenantId: string;
}

const NOTIFICATION_TYPES: { value: NotificationType; label: string }[] = [
  { value: NotificationType.INFO, label: "عام" },
  { value: NotificationType.SUCCESS, label: "مهمة/ناجحة" },
  { value: NotificationType.WARNING, label: "تحذير" },
  { value: NotificationType.ERROR, label: "خطأ/عاجل" },
];

export function TenantNotifications({ tenantId }: TenantNotificationsProps) {
  const [isPending, startTransition] = useTransition();
  const [message, setMessage] = useState("");
  const [type, setType] = useState<NotificationType>(NotificationType.INFO);
  const [result, setResult] = useState("");

  function run(action: () => Promise<{ success?: boolean; error?: string }>) {
    setResult("");
    if (!message.trim()) {
      setResult("اكتب نص الإشعار أولاً.");
      return;
    }
    startTransition(async () => {
      const res = await action();
      if (!res.success) {
        setResult(res.error ?? "حدث خطأ أثناء الإرسال.");
        return;
      }
      setResult("تم إرسال الإشعار بنجاح.");
      setMessage("");
    });
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle>إرسال إشعارات</CardTitle>
        <CardDescription>إشعارات فورية عبر البلاغات وواجهة التطبيق وقنوات الإشعارات.</CardDescription>
      </CardHeader>
      <CardContent className="space-y-4">
        <div className="space-y-2">
          <Label htmlFor="notifMessage">نص الإشعار</Label>
          <Input
            id="notifMessage"
            value={message}
            onChange={(e) => setMessage(e.target.value)}
            placeholder="مثال: سيتم تحديث النظام يوم الجمعة..."
          />
        </div>

        <div className="space-y-2">
          <Label htmlFor="notifType">نوع الإشعار</Label>
          <div className="flex flex-wrap gap-2">
            {NOTIFICATION_TYPES.map((t) => (
              <button
                key={t.value}
                type="button"
                onClick={() => setType(t.value)}
                className={`rounded-md border px-3 py-1.5 text-sm transition-colors ${
                  type === t.value
                    ? "border-primary bg-primary text-primary-foreground"
                    : "hover:bg-accent"
                }`}
              >
                {t.label}
              </button>
            ))}
          </div>
        </div>

        {result && (
          <p
            className={`rounded-md px-3 py-2 text-sm ${
              result == "اكتب نص الإشعار أولاً."
                ? "bg-red-50 text-red-700"
                : result.startsWith("حدث")
                  ? "bg-red-50 text-red-700"
                  : "bg-green-50 text-green-700"
            }`}
          >
            {result}
          </p>
        )}

        <div className="grid gap-2 sm:grid-cols-2">
          <Button
            type="button"
            variant="outline"
            disabled={isPending}
            onClick={() =>
              run(() => notifyTenantAdmins(tenantId, message, type))
            }
          >
            إشعار مديري المؤسسة
          </Button>
          <Button
            type="button"
            variant="outline"
            disabled={isPending}
            onClick={() =>
              run(() => notifyAllTenantUsers(tenantId, message, type))
            }
          >
            إشعار كل مستخدمي المؤسسة
          </Button>
          <Button
            type="button"
            variant="outline"
            disabled={isPending}
            onClick={() => run(() => notifyAllAdmins(message, type))}
          >
            إشعار كل مديري المنصة
          </Button>
          <Button
            type="button"
            variant="default"
            disabled={isPending}
            onClick={() => run(() => broadcastToAllUsers(message, type))}
          >
            بث لكل المستخدمين
          </Button>
        </div>
      </CardContent>
    </Card>
  );
}