import { Role } from "@prisma/client";

// أسماء الأدوار بالعربية للعرض
export const ROLE_LABELS: Record<Role, string> = {
  ADMIN: "المسؤول",
  HEAD_OF_AFFAIRS: "رئيس الشؤون التعليمية",
  CERTIFICATE_SOURCE: "مصدر الشهادات",
  TEST_SPECIALIST: "أخصائي الاختبارات",
  EXAMINER: "المختبر (المعلم)",
  INSTITUTION: "جهة تعليمية",
};

// المسار الافتراضي لكل دور (يُستخدم في الـ Middleware للتوجيه)
export const ROLE_DASHBOARD_PATHS: Record<Role, string> = {
  ADMIN: "/dashboard/admin",
  HEAD_OF_AFFAIRS: "/dashboard/head-of-affairs",
  CERTIFICATE_SOURCE: "/dashboard/certificate-source",
  TEST_SPECIALIST: "/dashboard/test-specialist",
  EXAMINER: "/dashboard/examiner",
  INSTITUTION: "/dashboard/institution",
};

export function getDashboardPath(role: Role): string {
  return ROLE_DASHBOARD_PATHS[role];
}