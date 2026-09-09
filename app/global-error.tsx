"use client";

import { useEffect } from "react";

// ============================================================
// حدّ الأخطاء العام للتطبيق — يعرض رسالة ودية مع زر إعادة المحاولة
// ويُسجّل خطأ إلى وحدة التحكم للتحقق
// ============================================================
export default function GlobalError({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  useEffect(() => {
    console.error("[Global Error]", error);
  }, [error]);

  return (
    <html lang="ar" dir="rtl">
      <body>
        <div
          style={{
            minHeight: "100vh",
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            padding: "2rem",
            background: "#0f172a",
            color: "#f8fafc",
            fontFamily: "system-ui, sans-serif",
            textAlign: "center",
          }}
        >
          <div style={{ maxWidth: "28rem" }}>
            <h1 style={{ fontSize: "1.5rem", fontWeight: 700, marginBottom: "0.5rem" }}>
              حدث خطأ غير متوقع
            </h1>
            <p style={{ color: "#94a3b8", marginBottom: "1.5rem" }}>
              نعتذر عن هذا العطل، يرجى إعادة المحاولة أو العودة لاحقاً.
              <br />
              (رمز الخطأ: {error.digest ?? "غير معروف"})
            </p>
            <button
              onClick={reset}
              style={{
                padding: "0.6rem 1.4rem",
                borderRadius: "0.5rem",
                border: "none",
                background: "#16a34a",
                color: "#fff",
                fontWeight: 600,
                cursor: "pointer",
              }}
            >
              إعادة المحاولة
            </button>
          </div>
        </div>
      </body>
    </html>
  );
}