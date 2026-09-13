import { clsx, type ClassValue } from "clsx";
import { twMerge } from "tailwind-merge";

/**
 * حجم الصفحة الافتراضي لقوائم الواجهات (Pagination) — B.3
 * تستخدمه server actions كحجم افتراضي للصفحة (20 صفاً)
 */
export const PAGE_SIZE = 20;

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}

/** خريطة الفروع (القيم المخزنة في DB) إلى أسمائها بالعربية (المرحلة 6) */
const BRANCH_LABELS: Record<string, string> = {
  "5": "خمسة أجزاء",
  "10": "عشرة أجزاء",
  "15": "خمسة عشر جزءاً",
  "20": "عشرون جزءاً",
  "25": "خمسة وعشرون جزءاً",
  "30": "ثلاثون جزءاً",
};

/**
 * اسم الفرع بالعربية للعرض — لا تُغيّر القيمة المخزنة، فقط العرض.
 * مثال: getBranchLabel("30") => "ثلاثون جزءاً"
 */
export function getBranchLabel(branch: string): string {
  return BRANCH_LABELS[branch] ?? branch;
}