import { Role } from "@prisma/client";

// مفاتيح الأدوار (للاستخدام في الشريط الجانبي والمسارات)
export type RoleKey = keyof typeof ROLE_LABELS;

// أسماء الأدوار بالعربية للعرض
export const ROLE_LABELS: Record<Role, string> = {
  SUPER_ADMIN: "المالك (سوبر أدمن)",
  ADMIN: "المسؤول",
  HEAD_OF_AFFAIRS: "رئيس الشؤون التعليمية",
  CERTIFICATE_SOURCE: "مصدر الشهادات",
  TEST_SPECIALIST: "أخصائي الاختبارات",
  EXAMINER: "المختبر",
  INSTITUTION: "جهة تعليمية",
};

// خيارات الأدوار المخصصة للإنشاء داخل جهة (تُشتق من ROLE_LABELS لضمان تطابق المصطلحات)
export const ROLE_LABELS_ENTRIES: { value: string; label: string }[] = [
  { value: "ADMIN", label: ROLE_LABELS.ADMIN },
  { value: "HEAD_OF_AFFAIRS", label: ROLE_LABELS.HEAD_OF_AFFAIRS },
  { value: "CERTIFICATE_SOURCE", label: ROLE_LABELS.CERTIFICATE_SOURCE },
  { value: "TEST_SPECIALIST", label: ROLE_LABELS.TEST_SPECIALIST },
  { value: "EXAMINER", label: ROLE_LABELS.EXAMINER },
  { value: "INSTITUTION", label: ROLE_LABELS.INSTITUTION },
];

// المسار الافتراضي لكل دور (يُستخدم في الـ Middleware للتوجيه)
export const ROLE_DASHBOARD_PATHS: Record<Role, string> = {
  SUPER_ADMIN: "/super-admin",
  ADMIN: "/admin",
  HEAD_OF_AFFAIRS: "/head-of-affairs",
  CERTIFICATE_SOURCE: "/certificate-source",
  TEST_SPECIALIST: "/test-specialist",
  EXAMINER: "/examiner",
  INSTITUTION: "/institution",
};

export function getDashboardPath(role: Role): string {
  return ROLE_DASHBOARD_PATHS[role];
}