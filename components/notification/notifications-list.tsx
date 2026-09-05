"use client";

import { useState, useEffect, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import {
  getUserNotifications,
  markNotificationAsRead,
  markAllNotificationsAsRead,
  clearAllNotifications,
} from "@/lib/actions/notification-actions";

type Notification = {
  id: string;
  message: string;
  type: string;
  isRead: boolean;
  createdAt: Date;
};

const TYPE_LABELS: Record<string, string> = {
  INFO: "معلومات",
  SUCCESS: "نجاح",
  WARNING: "تحذير",
  ERROR: "خطأ",
  RECRUITMENT: "ترشيح",
  APPROVAL: "موافقة",
  SCHEDULE: "موعد",
  ASSESSMENT: "تقييم",
  CERTIFICATE: "شهادة",
};

const TYPE_COLORS: Record<string, string> = {
  INFO: "bg-blue-100 text-blue-800 border-blue-200",
  SUCCESS: "bg-green-100 text-green-800 border-green-200",
  WARNING: "bg-yellow-100 text-yellow-800 border-yellow-200",
  ERROR: "bg-red-100 text-red-800 border-red-200",
  RECRUITMENT: "bg-purple-100 text-purple-800 border-purple-200",
  APPROVAL: "bg-indigo-100 text-indigo-800 border-indigo-200",
  SCHEDULE: "bg-cyan-100 text-cyan-800 border-cyan-200",
  ASSESSMENT: "bg-orange-100 text-orange-800 border-orange-200",
  CERTIFICATE: "bg-emerald-100 text-emerald-800 border-emerald-200",
};

export function NotificationsList() {
  const router = useRouter();
  const [notifications, setNotifications] = useState<Notification[]>([]);
  const [loading, setLoading] = useState(true);
  const [isPending, startTransition] = useTransition();
  const [error, setError] = useState("");
  const [success, setSuccess] = useState("");

  useEffect(() => {
    loadNotifications();
  }, []);

  async function loadNotifications() {
    try {
      const data = await getUserNotifications();
      setNotifications(data.notifications as Notification[]);
    } catch {
      setError("تعذر تحميل الإشعارات");
    } finally {
      setLoading(false);
    }
  }

  function handleMarkAsRead(id: string) {
    startTransition(async () => {
      try {
        await markNotificationAsRead(id);
        setNotifications((prev) =>
          prev.map((n) => (n.id === id ? { ...n, isRead: true } : n))
        );
      } catch {
        setError("تعذر تحديث الإشعار");
      }
    });
  }

  function handleMarkAllAsRead() {
    startTransition(async () => {
      try {
        await markAllNotificationsAsRead();
        setNotifications((prev) => prev.map((n) => ({ ...n, isRead: true })));
        setSuccess("تم تحديد الكل كمقروء");
      } catch {
        setError("تعذر تحديث الإشعارات");
      }
    });
  }

  function handleClearAll() {
    if (!confirm("هل أنت متأكد من حذف جميع الإشعارات؟")) return;
    startTransition(async () => {
      try {
        await clearAllNotifications();
        setNotifications([]);
        setSuccess("تم حذف جميع الإشعارات");
      } catch {
        setError("تعذر حذف الإشعارات");
      }
    });
  }

  const unreadCount = notifications.filter((n) => !n.isRead).length;

  if (loading) {
    return (
      <div className="py-12 text-center text-muted-foreground">
        جارٍ تحميل الإشعارات...
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

      <div className="flex flex-wrap items-center gap-3">
        <span className="text-sm text-muted-foreground">
          {unreadCount > 0
            ? `${unreadCount} إشعار غير مقروء`
            : "لا توجد إشعارات غير مقروءة"}
        </span>
        <div className="flex gap-2">
          {unreadCount > 0 && (
            <Button
              size="sm"
              variant="outline"
              disabled={isPending}
              onClick={handleMarkAllAsRead}
            >
              تحديد الكل كمقروء
            </Button>
          )}
          {notifications.length > 0 && (
            <Button
              size="sm"
              variant="destructive"
              disabled={isPending}
              onClick={handleClearAll}
            >
              حذف الكل
            </Button>
          )}
        </div>
      </div>

      {notifications.length === 0 ? (
        <Card>
          <CardContent className="py-12">
            <p className="text-center text-muted-foreground">
              لا توجد إشعارات
            </p>
          </CardContent>
        </Card>
      ) : (
        <div className="space-y-2">
          {notifications.map((notification) => (
            <div
              key={notification.id}
              className={`flex items-center justify-between gap-4 rounded-lg border px-4 py-3 transition-colors ${
                notification.isRead
                  ? "bg-background"
                  : "border-primary/20 bg-primary/5"
              }`}
            >
              <div className="flex-1 space-y-1">
                <div className="flex items-center gap-2">
                  <span
                    className={`inline-flex items-center rounded-full border px-2 py-0.5 text-xs font-medium ${
                      TYPE_COLORS[notification.type] ?? "bg-gray-100 text-gray-800 border-gray-200"
                    }`}
                  >
                    {TYPE_LABELS[notification.type] ?? notification.type}
                  </span>
                  {!notification.isRead && (
                    <span className="h-2 w-2 rounded-full bg-primary" />
                  )}
                </div>
                <p className="text-sm">{notification.message}</p>
                <p className="text-xs text-muted-foreground">
                  {new Date(notification.createdAt).toLocaleDateString("ar-SA", {
                    year: "numeric",
                    month: "long",
                    day: "numeric",
                    hour: "2-digit",
                    minute: "2-digit",
                  })}
                </p>
              </div>
              {!notification.isRead && (
                <Button
                  size="sm"
                  variant="ghost"
                  disabled={isPending}
                  onClick={() => handleMarkAsRead(notification.id)}
                >
                  تحديد كمقروء
                </Button>
              )}
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
