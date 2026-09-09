// ============================================================
// صفحة 404 — يعرضها Next.js عند عدم إيجاد مسار
// ============================================================
import Link from "next/link";
import { Home } from "lucide-react";
import { Button } from "@/components/ui/button";

export default function NotFound() {
  return (
    <div className="flex min-h-[50vh] flex-col items-center justify-center gap-4 p-8 text-center">
      <h1 className="text-5xl font-black text-muted-foreground">404</h1>
      <h2 className="text-xl font-bold">الصفحة غير موجودة</h2>
      <p className="max-w-md text-sm text-muted-foreground">
        الرابط الذي تحاول الوصول إليه غير متاح، أو أن الصفحة لم تُنشأ بعد.
      </p>
      <Button asChild>
        <Link href="/">
          <Home className="ml-2 h-4 w-4" />
          العودة للرئيسية
        </Link>
      </Button>
    </div>
  );
}