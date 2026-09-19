import type { Metadata } from "next";
import { LoginForm } from "@/components/auth/login-form";
import { getPlatformSettings } from "@/lib/actions/settings-actions";

export const metadata: Metadata = {
  title: "تسجيل الدخول",
};

export default async function LoginPage() {
  const settings = await getPlatformSettings();

  return (
    <main className="relative flex min-h-svh items-center justify-center overflow-hidden bg-[linear-gradient(160deg,var(--primary)_0%,var(--accent)_100%)] p-4 sm:p-6">
      <div
        aria-hidden="true"
        className="pointer-events-none absolute -bottom-32 -left-24 h-96 w-96 rounded-full bg-secondary/20 blur-3xl"
      />
      <div
        aria-hidden="true"
        className="pointer-events-none absolute -top-24 -right-24 h-72 w-72 rounded-full bg-secondary/10 blur-3xl"
      />
      <div className="relative w-full max-w-md">
        <div className="mb-8 text-center">
          <div className="mx-auto mb-5 flex h-28 w-28 items-center justify-center overflow-hidden rounded-2xl border border-border/40 bg-card p-2 shadow-xl shadow-black/25">
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img
              src={settings.logoUrl || "/logo.svg"}
              alt={settings.platformName}
              height={96}
              width={96}
              className="h-full w-full object-contain"
            />
          </div>
          <h1 className="text-3xl font-bold text-primary-foreground drop-shadow-sm">
            {settings.platformName}
          </h1>
          <p className="mt-2 text-sm font-medium text-primary-foreground/85">
            منصة إدارة الاختبارات وتنظيم اللجان
          </p>
        </div>
        <LoginForm />
      </div>
    </main>
  );
}