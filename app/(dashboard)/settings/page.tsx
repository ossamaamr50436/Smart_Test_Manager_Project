import type { Metadata } from "next";
import Link from "next/link";
import { redirect } from "next/navigation";
import { auth } from "@/auth";
import { ChangePasswordForm } from "@/components/auth/change-password-form";
import { getPlatformSettings } from "@/lib/actions/settings-actions";

export const metadata: Metadata = { title: "إعدادات المستخدم" };

export const dynamic = "force-dynamic";

export default async function SettingsPage() {
  const session = await auth();
  if (!session?.user) {
    redirect("/login");
  }

  const settings = await getPlatformSettings();

  return (
    <div className="mx-auto flex max-w-2xl flex-col items-center gap-6 py-4">
      <div className="w-full space-y-1 text-start">
        <h1 className="text-2xl font-bold">إعدادات المستخدم</h1>
        <p className="text-sm text-muted-foreground">
          تغيير كلمة المرور من هذه الصفحة
        </p>
      </div>

      {settings.showTutorialSection && (
        <Link
          href="/settings/tutorial"
          className="flex w-full items-center justify-between gap-4 rounded-lg border bg-card p-4 transition-colors hover:bg-secondary-50"
        >
          <div>
            <p className="font-medium">قسم التعليم والدور</p>
            <p className="mt-1 text-sm text-muted-foreground">
              دليل استخدام المنصة حسب دورك
            </p>
          </div>
          <span className="text-lg text-secondary-700">انقر هنا ←</span>
        </Link>
      )}

      <ChangePasswordForm />
    </div>
  );
}