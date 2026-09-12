"use client";

import Link from "next/link";
import Image from "next/image";
import { useSession } from "next-auth/react";
import { usePathname } from "next/navigation";
import { MessageCircle, GraduationCap, X } from "lucide-react";
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
// الترتيب وفق المادة 12 (متسلسلة منطقياً)، والجهات للأخصائي فقط (المادة 14)
const ROLE_LINKS: Partial<Record<RoleKey, NavLink[]>> = {
  ADMIN: [
    { href: "/admin", label: "لوحة التحكم" },
    { href: "/admin/users", label: "المستخدمون" },
    { href: "/admin/students", label: "الطلاب" },
    { href: "/admin/seasons", label: "المواسم" },
    { href: "/admin/models", label: "النماذج" },
    { href: "/admin/sessions", label: "الجلسات" },
    { href: "/admin/certificates", label: "الشهادات" },
    { href: "/admin/reports", label: "التقارير والتحليلات" },
    { href: "/admin/settings", label: "إعدادات المنصة" },
    { href: "/audit-log", label: "سجل التدقيق" },
  ],
  HEAD_OF_AFFAIRS: [
    { href: "/head-of-affairs", label: "الاعتماد الإداري النهائي" },
    { href: "/admin/reports", label: "التقارير والتحليلات" },
  ],
  CERTIFICATE_SOURCE: [
    { href: "/certificate-source", label: "إصدار الشهادات" },
  ],
  TEST_SPECIALIST: [
    { href: "/test-specialist", label: "لوحة التحكم" },
    { href: "/test-specialist/requests", label: "طلبات الترشيح" },
    { href: "/test-specialist/committees", label: "تشكيل اللجان" },
    { href: "/test-specialist/teachers", label: "المعلمون" },
    { href: "/test-specialist/models", label: "إدارة النماذج" },
    { href: "/specialist/entities", label: "إدارة الجهات" },
    { href: "/specialist/entities/create", label: "إنشاء جهة تعليمية" },
    { href: "/test-specialist/assessment-settings", label: "إعدادات التقييم" },
    {
      href: "/test-specialist/final-review",
      label: "مراجعة التقييمات النهائية",
    },
    { href: "/admin/reports", label: "التقارير والتحليلات" },
  ],
  EXAMINER: [
    { href: "/examiner", label: "لوحة التحكم" },
    { href: "/examiner/reports", label: "تقاريري" },
  ],
  INSTITUTION: [
    { href: "/institution", label: "طلاب جهتي" },
    { href: "/institution/students/new", label: "ترشيح طالب جديد" },
    { href: "/institution/reports", label: "تقارير الجهة" },
  ],
};

// رابط الإشعارات يظهر لجميع المستخدمين
const NOTIFICATIONS_LINK: NavLink = {
  href: "/notifications",
  label: "الإشعارات",
  showBadge: true,
};

export function DashboardSidebar({
  open,
  onClose,
}: {
  open: boolean;
  onClose: () => void;
}) {
  const { data: session } = useSession();
  const pathname = usePathname();
  const { settings } = usePlatformSettings();
  const user = session?.user;
  const role = (user?.role as RoleKey | undefined) ?? undefined;
  const roleLabel = role ? ROLE_LABELS[role] : "مستخدم";
  const links = role ? ROLE_LINKS[role] ?? [] : [];
  const platformName = settings?.platformName ?? "تطبيق الاختبارات";
  const whatsappNumber = settings?.whatsappNumber ?? null;
  const showTutorialSection = settings?.showTutorialSection ?? true;

  return (
    <>
      {/* خلفية معتمة للجوال — تُغلق القائمة عند الضغط عليها */}
      {open && (
        <div
          className="fixed inset-0 z-40 bg-black/50 backdrop-blur-sm md:hidden"
          onClick={onClose}
          aria-hidden
        />
      )}

      <aside
        className={cn(
          "fixed inset-y-0 right-0 z-50 flex w-64 shrink-0 flex-col border-l bg-gradient-to-b from-primary-700 to-primary-900 transition-transform duration-300 md:static md:z-auto md:translate-x-0 md:transition-none",
          open ? "translate-x-0" : "translate-x-full md:translate-x-0"
        )}
      >
        <div className="flex items-center justify-between border-b border-white/10 p-4">
          <div className="flex items-center gap-2">
            <Image
              src={settings?.logoUrl || "/logo.png"}
              alt={platformName}
              width={36}
              height={36}
              className="h-9 w-9 rounded-lg bg-white/90 object-contain p-0.5"
            />
            <p className="text-lg font-bold text-white">{platformName}</p>
          </div>
          <button
            type="button"
            onClick={onClose}
            aria-label="إغلاق القائمة"
            className="flex h-11 w-11 items-center justify-center rounded-md text-white/80 hover:bg-white/10 hover:text-white md:hidden"
          >
            <X className="h-5 w-5" />
          </button>
        </div>

      {/* منطقة التنقل — قابلة للتمرير */}
      <div className="flex-1 overflow-y-auto p-4">
        {/* رابط الإشعارات لجميع المستخدمين */}
        <nav className="mb-4 space-y-1 animate-slide-in">
          <Link
            href={NOTIFICATIONS_LINK.href}
            className={cn(
              "relative flex items-center gap-2 rounded-md px-3 py-2 text-sm transition-all duration-150",
              pathname === NOTIFICATIONS_LINK.href
                ? "bg-gradient-to-r from-primary-500 to-primary-600 font-medium text-white shadow-md"
                : "text-white/80 hover:bg-white/10 hover:text-white"
            )}
          >
            <NotificationBadge />
            {NOTIFICATIONS_LINK.label}
          </Link>

          {showTutorialSection && (
            <Link
              href="/settings/tutorial"
              className={cn(
                "flex items-center gap-2 rounded-md px-3 py-2 text-sm transition-all duration-150",
                pathname === "/settings/tutorial"
                  ? "bg-gradient-to-r from-primary-500 to-primary-600 font-medium text-white shadow-md"
                  : "text-white/80 hover:bg-white/10 hover:text-white"
              )}
            >
              <GraduationCap className="h-4 w-4" />
              التعليم والدور
            </Link>
          )}
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
                    "block rounded-md px-3 py-2 text-sm transition-all duration-150",
                    active
                      ? "bg-gradient-to-r from-primary-500 to-primary-600 font-medium text-white shadow-md"
                      : "text-white/80 hover:bg-white/10 hover:text-white"
                  )}
                >
                  {link.label}
                </Link>
              );
            })}
          </nav>
        )}

        {whatsappNumber && (
          <Link
            href={`https://wa.me/${whatsappNumber}`}
            target="_blank"
            rel="noopener noreferrer"
            className="mt-4 flex items-center gap-2 rounded-md bg-white/10 px-3 py-2 text-sm font-medium text-white transition-colors hover:bg-white/20"
          >
            <MessageCircle className="h-4 w-4" />
            تواصل مع الدعم الفني
          </Link>
        )}
      </div>
      </aside>
    </>
  );
}