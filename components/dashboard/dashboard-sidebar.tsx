"use client";

import { useSession, signOut } from "next-auth/react";
import { Button } from "@/components/ui/button";
import { ROLE_LABELS } from "@/lib/roles";

export function DashboardSidebar() {
  const { data: session } = useSession();
  const user = session?.user;
  const role = (user?.role as keyof typeof ROLE_LABELS | undefined) ?? undefined;
  const roleLabel = role ? ROLE_LABELS[role] : "مستخدم";

  return (
    <aside className="flex w-64 flex-col border-l bg-card">
      <div className="border-b p-4">
        <p className="text-lg font-bold text-primary">منصة مدير الاختبارات</p>
      </div>

      <div className="flex-1 p-4">
        <div className="rounded-lg bg-muted p-3">
          <p className="font-medium text-foreground">{user?.name}</p>
          <p className="mt-1 text-xs text-muted-foreground">{roleLabel}</p>
        </div>
      </div>

      <div className="border-t p-4">
        <Button
          variant="outline"
          className="w-full"
          onClick={() => signOut({ callbackUrl: "/login" })}
        >
          تسجيل الخروج
        </Button>
      </div>
    </aside>
  );
}