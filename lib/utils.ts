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

/**
 * ترجمة قيم الأنواع المخزنة (enums) الإنجليزية إلى أسماء عربية عند العرض.
 * تُستخدم مع رسائل سجل التدقيق والتنبيهات الأمنية حتى لا تظهر نصوص إنجليزية للمستخدم.
 */
const ENUM_ARABIC: Record<string, string> = {
  CREATE: "إنشاء",
  UPDATE: "تعديل",
  DELETE: "حذف",
  LOGIN: "دخول",
  APPROVE: "اعتماد",
  REJECT: "رفض",
  ASSESS: "تقييم",
  SUSPICIOUS_ACCESS: "وصول مشبوه",
  RATE_LIMIT_HIT: "تجاوز حد الطلبات",
  CROSS_TENANT_ATTEMPT: "محاولة وصول عبر المستأجرين",
  FAILED_LOGIN: "محاولة دخول فاشلة",
  TLS_CHANGED: "تغيير مفتاح TLS",
  SHARE_LINK_ACCESSED: "تسجيل دخول عبر رابط مشاركة",
  SPAM_LOGIN_ATTEMPT: "محاولة تسجيل دخول مشبوهة",
  TRANSFER_TRIAL: "محاولة نقل بيانات محظورة",
  PENDING: "بانتظار المراجعة",
  APPROVED: "مقبول",
  REJECTED: "مرفوض",
  ASSIGNED: "موزع على لجنة",
  COMPLETED: "اكتمل تقييمه",
  NOTIFIED: "اعتمده الأخصائي",
  READY_FOR_CERTIFICATE: "جاهز للشهادة",
  CERTIFICATE_ISSUED: "صدرت شهادته",
};

/**
 * تحويل التفاصيل (Details) المخزنة في السجلات إلى نص عربي للعرض:
 * - النص العادي يُرجع كما هو مع ترجمة القيم المعروفة.
 * - الكائنات تُحوَّل إلى JSON مع ترجمة قيم الحقول المعروفة.
 */
export function toArabicText(value: unknown): string {
  const translate = (v: unknown): unknown =>
    typeof v === "string" ? ENUM_ARABIC[v] ?? v : v;
  if (typeof value === "string") return translate(value) as string;
  return JSON.stringify(value, (_key, v) => translate(v), 2);
}