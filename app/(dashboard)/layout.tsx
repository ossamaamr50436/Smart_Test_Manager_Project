import { redirect } from "next/navigation";
import { auth } from "@/auth";
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

  return (
    <SessionProvider session={session}>
      <SettingsProvider>
        <DashboardShell>{children}</DashboardShell>
      </SettingsProvider>
    </SessionProvider>
  );
}
