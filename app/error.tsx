"use client";

import { useEffect } from "react";
import { AlertTriangle, RotateCcw } from "lucide-react";
import { Button } from "@/components/ui/button";

// ============================================================
// حدّ أخطاء للمقاطع (Route Segment Error Boundary)
// يعرض رسائل ودية مع زر إعادة المحاولة
// ============================================================
export default function SegmentError({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  useEffect(() => {
    console.error("[Route Error]", error);
  }, [error]);

  return (
    <div className="flex min-h-[50vh] flex-col items-center justify-center gap-4 rounded-xl border border-destructive/30 bg-destructive/5 p-8 text-center">
      <AlertTriangle className="h-10 w-10 text-destructive" />
      <h2 className="text-xl font-bold">تعذّر تحميل هذه الصفحة</h2>
      <p className="max-w-md text-sm text-muted-foreground">
        حدث خطأ غير متوقع أثناء عرض البيانات. لا تقلق، بياناتك محفوظة — حاول مرة أخرى.
      </p>
      {error.digest ? (
        <p dir="ltr" className="text-xs text-muted-foreground">
          digest: {error.digest}
        </p>
      ) : null}
      <Button onClick={reset} variant="outline">
        <RotateCcw className="ml-2 h-4 w-4" />
        إعادة المحاولة
      </Button>
    </div>
  );
}