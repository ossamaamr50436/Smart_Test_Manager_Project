import { redirect } from "next/navigation";
import { auth } from "@/auth";
import { DashboardSidebar } from "@/components/dashboard/dashboard-sidebar";
import { DashboardTopBar } from "@/components/dashboard/dashboard-topbar";
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
        <div className="flex h-screen overflow-hidden bg-gradient-to-br from-secondary-50 via-background to-primary-50">
          <DashboardSidebar />
          <div className="flex flex-1 flex-col">
            <DashboardTopBar />
            <main className="flex-1 overflow-y-auto p-6">{children}</main>
          </div>
        </div>
      </SettingsProvider>
    </SessionProvider>
  );
}
