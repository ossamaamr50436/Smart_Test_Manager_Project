"use client";

import { useEffect, useState } from "react";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { getSuperAdminDashboardStats } from "@/lib/actions/super-admin-actions";

type AlertLog = {
  id: string;
  action: string;
  details: unknown;
  timestamp: Date;
  user: { name: string; email: string } | null;
};

interface SecurityAlertsListProps {
  initialAlerts: AlertLog[];
}

const ALERT_LABELS: Record<string, string> = {
  TLS_CHANGED: "تغيير مفتاح TLS",
  SHARE_LINK_ACCESSED: "تسجيل دخول عبر رابط مشاركة",
  SPAM_LOGIN_ATTEMPT: "محاولة تسجيل دخول مشبوهة",
  TRANSFER_TRIAL: "محاولة نقل بيانات محظورة",
};

export function SecurityAlertsList({ initialAlerts }: SecurityAlertsListProps) {
  const [alerts, setAlerts] = useState<AlertLog[]>(initialAlerts);
  const [loading, setLoading] = useState(false);

  async function refresh() {
    setLoading(true);
    try {
      const data = await getSuperAdminDashboardStats();
      setAlerts(data.recentAlerts);
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    const interval = setInterval(refresh, 30000);
    return () => clearInterval(interval);
  }, []);

  return (
    <Card>
      <CardHeader>
        <CardTitle>التنبيهات الأمنية ({alerts.length})</CardTitle>
        <CardDescription>
          تُحدَّث تلقائياً كل 30 ثانية — سجلات مستوى المنصة.
        </CardDescription>
      </CardHeader>
      <CardContent>
        <div className="mb-4 flex justify-end">
          <Button type="button" variant="outline" size="sm" disabled={loading} onClick={refresh}>
            {loading ? "جارٍ التحديث..." : "تحديث"}
          </Button>
        </div>

        {alerts.length === 0 ? (
          <p className="text-sm text-muted-foreground">لا توجد تنبيهات أمنية.</p>
        ) : (
          <ul className="divide-y">
            {alerts.map((alert) => (
              <li key={alert.id} className="flex items-start justify-between gap-4 py-3">
                <div>
                  <p className="font-medium">
                    {ALERT_LABELS[alert.action] ?? alert.action}
                  </p>
                  <p className="text-xs text-muted-foreground">
                    {alert.user
                      ? `${alert.user.name} (${alert.user.email})`
                      : "النظام"}
                  </p>
                  {typeof alert.details === "object" &&
                    alert.details !== null &&
                    Object.keys(alert.details).length > 0 && (
                      <p className="mt-1 text-xs text-muted-foreground" dir="ltr">
                        {JSON.stringify(alert.details)}
                      </p>
                    )}
                </div>
                <span className="whitespace-nowrap text-xs text-muted-foreground">
                  {new Date(alert.timestamp).toLocaleString("ar-SA", {
                    dateStyle: "short",
                    timeStyle: "short",
                  })}
                </span>
              </li>
            ))}
          </ul>
        )}
      </CardContent>
    </Card>
  );
}