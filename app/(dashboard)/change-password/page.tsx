import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { auth } from "@/auth";
import { ChangePasswordForm } from "@/components/auth/change-password-form";

export const metadata: Metadata = {
  title: "تغيير كلمة المرور",
};

export default async function ChangePasswordPage() {
  const session = await auth();
  if (!session?.user) {
    redirect("/login");
  }

  // مصدر الحقيقة: الجلسة (تُملأ من DB عند التوقيع وتُحدَّث فوراً بعد التغيير)
  const mustChange = session.user.mustChangePassword === true;

  return (
    <div className="mx-auto flex max-w-2xl flex-col items-center gap-4 py-8">
      <div className="w-full max-w-md space-y-1 text-center">
        <h1 className="text-2xl font-bold">
          {mustChange ? "تغيير كلمة المرور الإلزامي" : "تغيير كلمة المرور"}
        </h1>
        <p className="text-sm text-muted-foreground">
          {mustChange
            ? "لأسباب أمنية يجب تغيير كلمة المرور المؤقتة قبل متابعة استخدام النظام"
            : "حدّث كلمة مرورك في أي وقت"}
        </p>
      </div>
      <ChangePasswordForm forced={mustChange} />
    </div>
  );
}