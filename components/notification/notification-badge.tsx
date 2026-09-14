"use client";

import { useState, useEffect } from "react";
import { useSession } from "next-auth/react";
import { getUnreadCount } from "@/lib/actions/notification-actions";
import {
  subscribeToUserNotifications,
  subscribeToUserNotificationRead,
} from "@/lib/realtime-client";

// ============================================================
// عداد الإشعارات غير المقروءة
// يظهر بجانب أيقونة الإشعارات في الشريط الجانبي.
// - تحديث لحظي عبر قناة Pusher الخاصة بالمستخدم
//   · notification:new  → زيادة + إعادة جلب
//   · notification:read → نقصان فوري (Optimistic) + إعادة جلب
// - مزامنة فورية عبر حدث محلي عند القراءة في نفس التبويب
// ============================================================

export function NotificationBadge() {
  const { data: session } = useSession();
  const currentUserId = session?.user?.id;
  const [count, setCount] = useState(0);

  useEffect(() => {
    let mounted = true;

    async function refetch() {
      try {
        const c = await getUnreadCount();
        if (mounted) setCount(c);
      } catch {
        // تجاهل الأخطاء بهدوء
      }
    }

    // وصول إشعار جديد عبر الدفع: نزيد العداد ونعاود الجلب
    const unsubscribeNew =
      currentUserId
        ? subscribeToUserNotifications(currentUserId, () => {
            setCount((prev) => prev + 1);
            refetch();
          })
        : undefined;

    // تمييز إشعار كمقروء في تبويب/جهاز آخر: نقصان فوري (Optimistic)
    const unsubscribeRead =
      currentUserId
        ? subscribeToUserNotificationRead(currentUserId, (payload) => {
            if (payload.all) {
              setCount(0);
            } else {
              setCount((prev) => Math.max(0, prev - 1));
            }
            refetch();
          })
        : undefined;

    // مزامنة محلية فورية عند القراءة/الحذف في نفس التبويب
    function onLocalRead(event: Event) {
      const detail = (event as CustomEvent<{ all?: boolean }>).detail;
      if (detail?.all) {
        setCount(0);
      } else {
        setCount((prev) => Math.max(0, prev - 1));
      }
    }
    function onLocalClear() {
      setCount(0);
    }

    window.addEventListener("notification:read", onLocalRead);
    window.addEventListener("notification:clear", onLocalClear);

    refetch();

    return () => {
      mounted = false;
      unsubscribeNew?.();
      unsubscribeRead?.();
      window.removeEventListener("notification:read", onLocalRead);
      window.removeEventListener("notification:clear", onLocalClear);
    };
  }, [currentUserId]);

  if (count === 0) return null;

  return (
    <span className="absolute -left-1 -top-1 flex h-4 min-w-4 items-center justify-center rounded-full bg-destructive px-1 text-[10px] font-bold text-destructive-foreground">
      {count > 99 ? "99+" : count}
    </span>
  );
}