"use client";

import { useState, useEffect } from "react";
import { useSession } from "next-auth/react";
import { getUnreadCount } from "@/lib/actions/notification-actions";
import { subscribeToUserNotifications } from "@/lib/realtime-client";

// ============================================================
// عداد الإشعارات غير المقروءة
// يظهر بجانب أيقونة الإشعارات في الشريط الجانبي.
// - يقوم بتحديث لحظي عبر قناة Pusher الخاصة بالمستخدم
// - مع تحديث دوري كخطة احتياطية عند انقطاع المزامنة
// ============================================================

export function NotificationBadge() {
  const { data: session } = useSession();
  const currentUserId = session?.user?.id;
  const [count, setCount] = useState(0);

  useEffect(() => {
    let mounted = true;

    async function fetchCount() {
      try {
        const c = await getUnreadCount();
        if (mounted) setCount(c);
      } catch {
        // تجاهل الأخطاء بهدوء
      }
    }

    // عند وصول إشعار جديد عبر الدفع: نزيد العداد ونعاود الجلب من الخادم
    const unsubscribe =
      currentUserId
        ? subscribeToUserNotifications(currentUserId, () => {
            setCount((prev) => prev + 1);
            fetchCount();
          })
        : undefined;

    fetchCount();

    // تحديث دوري كخطة احتياطية
    const interval = setInterval(fetchCount, 30000);

    return () => {
      mounted = false;
      clearInterval(interval);
      unsubscribe?.();
    };
  }, [currentUserId]);

  if (count === 0) return null;

  return (
    <span className="absolute -left-1 -top-1 flex h-4 min-w-4 items-center justify-center rounded-full bg-destructive px-1 text-[10px] font-bold text-destructive-foreground">
      {count > 99 ? "99+" : count}
    </span>
  );
}