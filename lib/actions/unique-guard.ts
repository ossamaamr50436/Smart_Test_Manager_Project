import { Prisma } from "@prisma/client";

// ============================================================
// درع انتهاك القيود الفريدة (P2002)
// - منع تسريب وجود البريد الإلكتروني / الجهات عبر رسائل خطأ خام
// - الرسالة العامة لا تكشف أي معلومة حساسة (المرحلة 2)
// - تُستثنى الحقول غير الحساسة (رقم تسلسلي/رقم نموذج) برسائل عملية
// ============================================================

const GENERIC_MESSAGE = "تعذّر إنشاء الحساب — تحقق من البيانات المدخلة";

export function isUniqueConstraintError(
  error: unknown
): error is Prisma.PrismaClientKnownRequestError {
  return (
    error instanceof Prisma.PrismaClientKnownRequestError && error.code === "P2002"
  );
}

/** استخراج أسماء الحقول المخالفة من خطأ P2002 */
function violatedFields(error: Prisma.PrismaClientKnownRequestError): string[] {
  const target = (error.meta as { target?: unknown } | undefined)?.target;
  if (Array.isArray(target)) return target.map(String);
  return [];
}

/**
 * رسالة آمنة عند انتهاك قيد فريد.
 * الحقول الحساسة (email / licenseNumber / name) تعود برسالة عامة لا تكشف وجودها.
 * الحقول غير الحساسة (serialNumber / modelNumber) تعود برسالة عملية آمنة.
 */
export function friendlyUniqueMessage(error: Prisma.PrismaClientKnownRequestError): string {
  const fields = violatedFields(error);

  if (fields.some((f) => ["email", "licenseNumber", "name"].includes(f))) {
    return GENERIC_MESSAGE;
  }
  if (fields.includes("serialNumber")) return "هذا الرقم التسلسلي مستخدم مسبقاً — أعد المحاولة";
  if (fields.includes("modelNumber")) return "رقم النموذج مكرر لنفس الفرع والموسم — اختر رقماً آخر";

  return GENERIC_MESSAGE;
}