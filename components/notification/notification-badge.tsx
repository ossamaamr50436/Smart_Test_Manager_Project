"use client";

import { useState, useEffect } from "react";
import { getUnreadCount } from "@/lib/actions/notification-actions";

// ============================================================
// عداد الإشعارات غير المقروءة
// يظهر بجانب أيقونة الإشعارات في الشريط الجانبي
// ============================================================

export function NotificationBadge() {
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

    fetchCount();

    // تحديث العداد كل 30 ثانية
    const interval = setInterval(fetchCount, 30000);

    return () => {
      mounted = false;
      clearInterval(interval);
    };
  }, []);

  if (count === 0) return null;

  return (
    <span className="absolute -left-1 -top-1 flex h-4 min-w-4 items-center justify-center rounded-full bg-destructive px-1 text-[10px] font-bold text-destructive-foreground">
      {count > 99 ? "99+" : count}
    </span>
  );
}
