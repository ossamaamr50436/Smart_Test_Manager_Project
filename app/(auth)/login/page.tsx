import type { Metadata } from "next";
import { LoginForm } from "@/components/auth/login-form";
import { getPlatformSettings } from "@/lib/actions/settings-actions";
import { DEFAULT_PLATFORM_LOGO, PLATFORM_LOGO_ALT } from "@/lib/platform-brand";

export const metadata: Metadata = {
  title: "تسجيل الدخول",
};

export default async function LoginPage() {
  const settings = await getPlatformSettings();

  return (
    <main className="relative flex min-h-svh items-center justify-center overflow-hidden bg-[var(--login-bg)] p-4 sm:p-6">
      <div
        aria-hidden="true"
        className="pointer-events-none absolute inset-0 bg-[linear-gradient(160deg,var(--login-gradient-from)_0%,var(--login-gradient-to)_100%)]"
      />
      <div
        aria-hidden="true"
        className="pointer-events-none absolute -bottom-32 -left-24 h-96 w-96 rounded-full bg-[var(--login-gradient-to)] opacity-20 blur-3xl"
      />
      <div
        aria-hidden="true"
        className="pointer-events-none absolute -top-24 -right-24 h-72 w-72 rounded-full bg-[var(--login-gradient-to)] opacity-10 blur-3xl"
      />
      <div className="relative w-full max-w-md">
        <div className="mb-8 text-center">
          <div className="mx-auto mb-6 flex h-44 w-44 items-center justify-center overflow-hidden rounded-full border border-border/40 bg-card shadow-xl shadow-black/25">
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img
              src={settings.logoUrl || DEFAULT_PLATFORM_LOGO}
              alt={PLATFORM_LOGO_ALT}
              height={176}
              width={176}
              className="h-full w-full object-cover"
            />
          </div>
          <h1 className="text-3xl font-bold leading-tight text-primary-foreground drop-shadow-sm">
            <span className="block">
              {settings.platformNameLine1 || settings.platformName}
            </span>
            {settings.platformNameLine2 && (
              <span className="block">{settings.platformNameLine2}</span>
            )}
          </h1>
        </div>
        <LoginForm />
      </div>
    </main>
  );
}