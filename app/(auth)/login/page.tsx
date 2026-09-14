import type { Metadata } from "next";
import { LoginForm } from "@/components/auth/login-form";
import { getPlatformSettings } from "@/lib/actions/settings-actions";

export const metadata: Metadata = {
  title: "تسجيل الدخول",
};

export default async function LoginPage() {
  const settings = await getPlatformSettings();

  return (
    <main className="flex min-h-screen items-center justify-center bg-gradient-to-br from-primary-900 via-primary-500 to-primary-800 p-4">
      <div className="w-full max-w-md">
        <div className="mb-8 text-center">
          <div className="mx-auto mb-4 flex h-24 w-24 items-center justify-center overflow-hidden rounded-2xl bg-white p-1 shadow-lg shadow-primary-900/40">
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img
              src={settings.logoUrl || "/logo.svg"}
              alt={settings.platformName}
              height={96}
              width={96}
              className="h-full w-full object-contain"
            />
          </div>
          <h1 className="text-2xl font-bold text-white">
            {settings.platformName}
          </h1>
        </div>
        <LoginForm />
      </div>
    </main>
  );
}
