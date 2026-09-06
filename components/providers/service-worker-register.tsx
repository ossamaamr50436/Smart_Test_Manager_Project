"use client";

import { useEffect } from "react";

/**
 * تسجيل Service Worker لتطبيق الويب التقدمي (PWA).
 * يعمل فقط في بيئة المتصفح (client) ويسجّل `/sw.js` بعد تحميل الصفحة.
 */
export function ServiceWorkerRegister() {
  useEffect(() => {
    if (
      typeof window === "undefined" ||
      !("serviceWorker" in navigator) ||
      process.env.NODE_ENV !== "production"
    ) {
      return;
    }
    const register = async () => {
      try {
        await navigator.serviceWorker.register("/sw.js", { scope: "/" });
      } catch {
        // فشل التسجيل لا يُسقط التطبيق — نكتفي بالرصد
      }
    };
    window.addEventListener("load", register);
    return () => window.removeEventListener("load", register);
  }, []);

  return null;
}
