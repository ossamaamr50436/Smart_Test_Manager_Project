"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
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

type NavSection = {
  title: string;
  links: NavLink[];
};

type AdminContext = {
  id: "exams" | "institution";
  label: string;
  sections: NavSection[];
};

// سياقات ADMIN المزدوجة — الروابط نفسها التي تُعرض حسب الصلاحيات فقط
const ADMIN_CONTEXTS: AdminContext[] = [
  {
    id: "exams",
    label: "الاختبارات",
    sections: [
      {
        title: "رئيسية",
        links: [
          { href: "/admin", label: "لوحة التحكم" },
          { href: "/admin/students", label: "الطلاب" },
          { href: "/admin/accepted-students", label: "الطلاب المقبولون" },
        ],
      },
      {
        title: "عمل",
        links: [
          { href: "/test-specialist/requests", label: "طلبات الترشيح" },
          { href: "/test-specialist/students/new", label: "الترشيح" },
          { href: "/test-specialist/committees", label: "اللجان" },
          { href: "/admin/sessions", label: "الجلسات" },
          { href: "/admin/models", label: "النماذج" },
          { href: "/admin/question-bank", label: "الأسئلة" },
          { href: "/test-specialist/teachers", label: "المختبرون" },
          { href: "/test-specialist/final-review", label: "المراجعة" },
          { href: "/test-specialist/rejected-students", label: "الطلاب المرفوضون" },
          { href: "/test-specialist", label: "لوحة الأخصائي" },
        ],
      },
      {
        title: "مخرجات",
        links: [{ href: "/admin/certificates", label: "الشهادات" }],
      },
    ],
  },
  {
    id: "institution",
    label: "المؤسسة",
    sections: [
      {
        title: "رئيسية",
        links: [{ href: "/admin/institutions", label: "لوحة المؤسسة" }],
      },
      {
        title: "إدارة",
        links: [
          { href: "/admin/users", label: "المستخدمون" },
          { href: "/admin/seasons", label: "المواسم" },
          { href: "/specialist/entities", label: "الجهات" },
          { href: "/specialist/entities/create", label: "إنشاء جهة" },
          { href: "/test-specialist/assessment-settings", label: "إعدادات التقييم" },
          { href: "/admin/settings", label: "الإعدادات" },
        ],
      },
      {
        title: "مخرجات",
        links: [{ href: "/admin/reports", label: "التقارير" }],
      },
      {
        title: "حوكمة",
        links: [{ href: "/audit-log", label: "سجل التدقيق" }],
      },
    ],
  },
];

// روابط التنقل لكل دور (عزل الصلاحيات — كل دور يرى مساراته فقط)
// الترتيب وفق المادة 12 (متسلسلة منطقياً)، والجهات للأخصائي فقط (المادة 14)
const ROLE_SECTIONS: Partial<Record<RoleKey, NavSection[]>> = {
  SUPER_ADMIN: [
    {
      title: "رئيسية",
      links: [{ href: "/super-admin", label: "لوحة المالك" }],
    },
    {
      title: "إدارة",
      links: [
        { href: "/super-admin/tenants", label: "المؤسسات" },
        { href: "/super-admin/tenants/new", label: "إنشاء مؤسسة" },
        { href: "/super-admin/alerts", label: "التنبيهات" },
        { href: "/super-admin/settings", label: "الإعدادات" },
        { href: "/super-admin/design-settings", label: "إعدادات التصميم" },
      ],
    },
  ],
  HEAD_OF_AFFAIRS: [
    {
      title: "رئيسية",
      links: [{ href: "/head-of-affairs", label: "الاعتماد الإداري النهائي" }],
    },
    {
      title: "عمل",
      links: [{ href: "/head-of-affairs/rejected", label: "الطلاب المرفوضون" }],
    },
    {
      title: "مخرجات",
      links: [{ href: "/admin/reports", label: "التقارير" }],
    },
  ],
  CERTIFICATE_SOURCE: [
    {
      title: "رئيسية",
      links: [{ href: "/certificate-source", label: "إصدار الشهادات" }],
    },
  ],
  TEST_SPECIALIST: [
    {
      title: "رئيسية",
      links: [{ href: "/test-specialist", label: "لوحة التحكم" }],
    },
    {
      title: "عمل",
      links: [
        { href: "/test-specialist/accepted-students", label: "الطلاب" },
        { href: "/test-specialist/requests", label: "طلبات الترشيح" },
        { href: "/test-specialist/students/new", label: "الترشيح" },
        { href: "/test-specialist/committees", label: "اللجان" },
        { href: "/test-specialist/teachers", label: "المختبرون" },
        { href: "/test-specialist/models", label: "النماذج" },
        { href: "/admin/question-bank", label: "الأسئلة" },
        { href: "/test-specialist/final-review", label: "المراجعة" },
        { href: "/test-specialist/rejected-students", label: "الطلاب المرفوضون" },
      ],
    },
    {
      title: "مخرجات",
      links: [{ href: "/admin/reports", label: "التقارير" }],
    },
    {
      title: "إدارة",
      links: [
        { href: "/specialist/entities", label: "الجهات" },
        { href: "/specialist/entities/create", label: "إنشاء جهة تعليمية" },
        { href: "/test-specialist/assessment-settings", label: "إعدادات التقييم" },
      ],
    },
  ],
  EXAMINER: [
    {
      title: "رئيسية",
      links: [{ href: "/examiner", label: "لوحة التحكم" }],
    },
    {
      title: "مخرجات",
      links: [{ href: "/examiner/reports", label: "تقاريري" }],
    },
  ],
  INSTITUTION: [
    {
      title: "رئيسية",
      links: [
        { href: "/institution", label: "لوحة التحكم" },
        { href: "/institution/students", label: "الطلاب" },
      ],
    },
    {
      title: "عمل",
      links: [{ href: "/institution/students/new", label: "الترشيح" }],
    },
    {
      title: "مخرجات",
      links: [
        { href: "/institution/certificates", label: "الشهادات" },
        { href: "/institution/reports", label: "التقارير" },
      ],
    },
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
  const sections = role ? ROLE_SECTIONS[role] ?? [] : [];

  const isAdmin = role === "ADMIN";
  const [activeContextId, setActiveContextId] = useState<AdminContext["id"]>("exams");

  useEffect(() => {
    if (!isAdmin || !pathname) return;
    let best: AdminContext["id"] | null = null;
    let bestDepth = -1;
    for (const context of ADMIN_CONTEXTS) {
      for (const section of context.sections) {
        for (const link of section.links) {
          if (pathname === link.href || pathname.startsWith(link.href + "/")) {
            if (link.href.length > bestDepth) {
              bestDepth = link.href.length;
              best = context.id;
            }
          }
        }
      }
    }
    if (best) setActiveContextId(best);
  }, [isAdmin, pathname]);

  const activeAdminContext =
    ADMIN_CONTEXTS.find((c) => c.id === activeContextId) ?? ADMIN_CONTEXTS[0];
  const displayedSections = isAdmin && activeAdminContext
    ? activeAdminContext.sections
    : sections;

  const platformName = settings?.platformName ?? "منصة إدارة الاختبارات الذكية";
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
          "fixed inset-y-0 right-0 z-50 flex w-64 shrink-0 flex-col border-l bg-[var(--sidebar-bg)] text-[var(--sidebar-text)] transition-transform duration-300 md:static md:z-auto md:translate-x-0 md:transition-none",
          open ? "translate-x-0" : "translate-x-full md:translate-x-0"
        )}
      >
        <div className="flex items-center justify-between border-b border-white/10 p-4">
          <div className="flex items-center gap-2">
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img
              src={settings?.logoUrl || "/logo.svg"}
              alt={platformName}
              height={56}
              width={56}
              className="h-14 w-14 shrink-0 rounded-lg bg-white/95 object-contain p-1"
            />
            <p className="text-lg font-bold text-[var(--sidebar-text)]">{platformName}</p>
          </div>
          <button
            type="button"
            onClick={onClose}
            aria-label="إغلاق القائمة"
            className="flex h-11 w-11 items-center justify-center rounded-md text-[var(--sidebar-text)] opacity-80 hover:bg-white/10 hover:opacity-100 md:hidden"
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
                ? "bg-[var(--sidebar-active-bg)] font-medium text-[var(--sidebar-active-text)] shadow-md"
                : "text-[var(--sidebar-text)] opacity-80 hover:bg-white/10 hover:opacity-100"
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
                  ? "bg-[var(--sidebar-active-bg)] font-medium text-[var(--sidebar-active-text)] shadow-md"
                  : "text-[var(--sidebar-text)] opacity-80 hover:bg-white/10 hover:opacity-100"
              )}
            >
              <GraduationCap className="h-4 w-4" />
              التعليم والدور
            </Link>
          )}
        </nav>

        {isAdmin && (
          <div
            role="tablist"
            aria-label="التبديل بين سياقات المسؤول"
            className="mb-4 grid grid-cols-2 gap-1 rounded-lg bg-white/10 p-1"
          >
            {ADMIN_CONTEXTS.map((context) => {
              const isActive = activeContextId === context.id;
              return (
                <button
                  key={context.id}
                  type="button"
                  role="tab"
                  aria-selected={isActive}
                  onClick={() => setActiveContextId(context.id)}
                  className={cn(
                    "rounded-md px-3 py-1.5 text-sm font-medium transition-colors duration-150",
                    isActive
                      ? "bg-[var(--sidebar-active-bg)] text-[var(--sidebar-active-text)] shadow-sm"
                      : "text-[var(--sidebar-text)] opacity-80 hover:bg-white/10 hover:opacity-100"
                  )}
                >
                  {context.label}
                </button>
              );
            })}
          </div>
        )}

        {displayedSections.length > 0 && (
          <nav className="space-y-3">
            {displayedSections.map((section, i) => (
              <div
                key={section.title}
                className={cn("space-y-1", i > 0 && "border-t border-white/10 pt-3")}
              >
                <p className="px-3 pb-1 text-[11px] font-medium tracking-wide text-[var(--sidebar-text)] opacity-50">
                  {section.title}
                </p>
                {section.links.map((link) => {
                  const active = pathname === link.href || pathname.startsWith(link.href + "/");
                  return (
                    <Link
                      key={link.href}
                      href={link.href}
                      className={cn(
                        "block rounded-md px-3 py-2 text-sm transition-colors duration-150",
                        active
                          ? "bg-[var(--sidebar-active-bg)] font-medium text-[var(--sidebar-active-text)]"
                          : "text-[var(--sidebar-text)] opacity-80 hover:bg-white/10 hover:opacity-100"
                      )}
                    >
                      {link.label}
                    </Link>
                  );
                })}
              </div>
            ))}
          </nav>
        )}

        {whatsappNumber && (
          <Link
            href={`https://wa.me/${whatsappNumber}`}
            target="_blank"
            rel="noopener noreferrer"
            className="mt-4 flex items-center gap-2 rounded-md bg-white/10 px-3 py-2 text-sm font-medium text-[var(--sidebar-text)] transition-colors hover:bg-white/20"
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