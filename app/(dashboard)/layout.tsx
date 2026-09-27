import { redirect } from "next/navigation";
import { headers } from "next/headers";
import { auth } from "@/auth";
import { resolvePasswordGate } from "@/lib/password-gate";
import { DashboardShell } from "@/components/dashboard/dashboard-shell";
import { SessionProvider } from "@/components/providers/session-provider";
import { SettingsProvider } from "@/components/providers/settings-provider";

export default async function DashboardLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const session = await auth();
  if (!session?.user) {
    redirect("/login");
  }

  // بوابة إجبار تغيير كلمة المرور على الخادم (RSC) — طبقة إلزام ثانية
  // بجانب Middleware: أي مستخدم يحمل mustChangePassword لا يستخدم
  // لوحة التحكم إلا عبر /change-password (بلا حلقة إعادة توجيه).
  const pathname = (await headers()).get("x-pathname") ?? "";
  const gate = resolvePasswordGate({
    mustChangePassword: session.user.mustChangePassword,
    pathname,
  });
  if (gate) {
    redirect(gate);
  }

  return (
    <SessionProvider session={session}>
      <SettingsProvider>
        <DashboardShell>{children}</DashboardShell>
      </SettingsProvider>
    </SessionProvider>
  );
}
