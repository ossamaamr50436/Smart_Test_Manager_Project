import type { Metadata } from "next";
import { LoginForm } from "@/components/auth/login-form";

export const metadata: Metadata = {
  title: "تسجيل الدخول",
};

export default function LoginPage() {
  return (
    <main className="flex min-h-screen items-center justify-center bg-muted p-4">
      <div className="w-full max-w-md">
        <div className="mb-8 text-center">
          <div className="mx-auto mb-4 flex h-16 w-16 items-center justify-center rounded-2xl bg-primary text-3xl text-primary-foreground">
            📖
          </div>
          <h1 className="text-2xl font-bold text-foreground">
            منصة مدير الاختبارات الذكي الشامل
          </h1>
          <p className="mt-2 text-sm text-muted-foreground">
            جمعية تعليم القرآن وعلومه — فرع المدينة المنورة
          </p>
        </div>
        <LoginForm />
      </div>
    </main>
  );
}