"use client";

import { useEffect, useState } from "react";
import { AlertTriangle, X } from "lucide-react";
import {
  getPlatformAlert,
  dismissPlatformAlert,
  type PlatformAlert,
} from "@/lib/actions/notification-actions";

export function PlatformAlertBanner() {
  const [alert, setAlert] = useState<PlatformAlert | null>(null);
  const [dismissed, setDismissed] = useState(false);

  useEffect(() => {
    let cancelled = false;
    getPlatformAlert()
      .then((result) => {
        if (!cancelled) setAlert(result);
      })
      .catch(() => {
        /* تجاهل الخطأ — الشريط اختياري */
      });
    return () => {
      cancelled = true;
    };
  }, []);

  if (!alert || dismissed) return null;

  function handleDismiss() {
    const current = alert;
    if (!current) return;
    setDismissed(true);
    setAlert(null);
    dismissPlatformAlert(current.id).catch(() => {
      /* لا حاجة لاتخاذ إجراء إضافي — ستُنعش الشارة عند إعادة التحميل */
    });
  }

  return (
    <div
      role="alert"
      className="sticky top-0 z-[100] flex items-center gap-3 border-b border-amber-300/60 bg-gradient-to-l from-amber-500 to-orange-500 px-4 py-2.5 text-white shadow-md dark:border-amber-500/40"
    >
      <AlertTriangle className="h-5 w-5 shrink-0" />
      <p className="flex-1 text-sm font-medium">
        تنبيه من مالك النظام: <span className="font-bold">{alert.message}</span>
      </p>
      <button
        type="button"
        onClick={handleDismiss}
        aria-label="إغلاق التنبيه"
        className="flex h-8 w-8 shrink-0 items-center justify-center rounded-md text-white/90 transition-colors hover:bg-white/20 hover:text-white focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-white"
      >
        <X className="h-5 w-5" />
      </button>
    </div>
  );
}