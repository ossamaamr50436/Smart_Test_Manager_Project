"use client";

import Link from "next/link";
import { useSession, signOut } from "next-auth/react";
import { usePathname } from "next/navigation";
import { Button } from "@/components/ui/button";
import { ROLE_LABELS, type RoleKey } from "@/lib/roles";
import { cn } from "@/lib/utils";
import { usePlatformSettings } from "@/components/providers/settings-provider";
import { NotificationBadge } from "@/components/notification/notification-badge";

type NavLink = {
  href: string;
  label: string;
  showBadge?: boolean;
};

// روابط التنقل لكل دور (عزل الصلاحيات — كل دور يرى مساراته فقط)
const ROLE_LINKS: Partial<Record<RoleKey, NavLink[]>> = {
  ADMIN: [
    { href: "/dashboard/admin", label: "لوحة المسؤول" },
    { href: "/dashboard/admin/settings", label: "إعدادات المنصة" },
    { href: "/dashboard/audit-log", label: "سجل التدقيق" },
  ],
  HEAD_OF_AFFAIRS: [
    { href: "/dashboard/head-of-affairs", label: "الاعتماد الإداري النهائي" },
  ],
  CERTIFICATE_SOURCE: [
    { href: "/dashboard/certificate-source", label: "إصدار الشهادات" },
  ],
  TEST_SPECIALIST: [
    { href: "/dashboard/test-specialist/requests", label: "طلبات الترشيح" },
    { href: "/dashboard/test-specialist/committees", label: "تشكيل اللجان" },
    {
      href: "/dashboard/test-specialist/final-review",
      label: "مراجعة التقييمات النهائية",
    },
    { href: "/dashboard/audit-log", label: "سجل التدقيق" },
  ],
  EXAMINER: [
    { href: "/dashboard/examiner", label: "طلاب لجانك" },
  ],
  INSTITUTION: [
    { href: "/dashboard/institution", label: "طلاب جهتي" },
    { href: "/dashboard/institution/students/new", label: "ترشيح طالب جديد" },
  ],
};

// رابط الإشعارات يظهر لجميع المستخدمين
const NOTIFICATIONS_LINK: NavLink = {
  href: "/dashboard/notifications",
  label: "الإشعارات",
  showBadge: true,
};

export function DashboardSidebar() {
  const { data: session } = useSession();
  const pathname = usePathname();
  const { settings } = usePlatformSettings();
  const user = session?.user;
  const role = (user?.role as RoleKey | undefined) ?? undefined;
  const roleLabel = role ? ROLE_LABELS[role] : "مستخدم";
  const links = role ? ROLE_LINKS[role] ?? [] : [];
  const platformName = settings?.platformName ?? "تطبيق الاختبارات";

  return (
    <aside className="flex w-64 flex-col border-l bg-card">
      <div className="border-b bg-gradient-to-l from-primary-800 to-primary-500 p-4">
        <div className="flex items-center gap-2">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img
            src={settings?.logoUrl || "/logo.png"}
            alt={platformName}
            className="h-9 w-9 rounded-lg bg-white/90 object-contain p-0.5"
          />
          <p className="text-lg font-bold text-white">{platformName}</p>
        </div>
      </div>

      <div className="flex-1 overflow-y-auto p-4">
        <div className="mb-4 rounded-lg border-l-4 border-secondary-300 bg-muted p-3">
          <p className="font-medium text-foreground">{user?.name}</p>
          <p className="mt-1 text-xs text-muted-foreground">{roleLabel}</p>
        </div>

        {/* رابط الإشعارات لجميع المستخدمين */}
        <nav className="mb-4 space-y-1">
          <Link
            href={NOTIFICATIONS_LINK.href}
            className={cn(
              "relative flex items-center gap-2 rounded-md px-3 py-2 text-sm transition-colors",
              pathname === NOTIFICATIONS_LINK.href
                ? "bg-primary-600 font-medium text-white shadow-sm"
                : "text-foreground hover:bg-secondary-100 hover:text-primary-700"
            )}
          >
            <NotificationBadge />
            {NOTIFICATIONS_LINK.label}
          </Link>
        </nav>

        {links.length > 0 && (
          <nav className="space-y-1">
            {links.map((link) => {
              const active = pathname === link.href || pathname.startsWith(link.href + "/");
              return (
                <Link
                  key={link.href}
                  href={link.href}
                  className={cn(
                    "block rounded-md px-3 py-2 text-sm transition-colors",
                    active
                      ? "bg-primary-600 font-medium text-white shadow-sm"
                      : "text-foreground hover:bg-secondary-100 hover:text-primary-700"
                  )}
                >
                  {link.label}
                </Link>
              );
            })}
          </nav>
        )}
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
