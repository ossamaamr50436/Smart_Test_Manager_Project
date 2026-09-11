import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { auth } from "@/auth";
import { ChangePasswordForm } from "@/components/auth/change-password-form";

export const metadata: Metadata = { title: "إعدادات المستخدم" };

export const dynamic = "force-dynamic";

export default async function SettingsPage() {
  const session = await auth();
  if (!session?.user) {
    redirect("/login");
  }

  return (
    <div className="mx-auto flex max-w-2xl flex-col items-center gap-6 py-4">
      <div className="w-full space-y-1 text-start">
        <h1 className="text-2xl font-bold">إعدادات المستخدم</h1>
        <p className="text-sm text-muted-foreground">
          تغيير كلمة المرور من هذه الصفحة
        </p>
      </div>
      <ChangePasswordForm />
    </div>
  );
}