// ============================================================
// B4 — تحقق Server-side من سبب رفض اعتماد الدرجة
// السبب إلزامي: لا رفض بسطر فارغ أو Whitespace فقط (المادة 8)
// ============================================================

export const REJECTION_REASON_MAX = 500;

/** يرجع السبب الصالح مقصوصاً، أو null إذا كان فارغاً/Whitespace فقط */
export function validateRejectionReason(reason?: string): string | null {
  if (reason === undefined) return null;
  const trimmed = reason.replace(/\s+/g, " ").trim();
  if (!trimmed) return null;
  if (trimmed.length > REJECTION_REASON_MAX) return null;
  return trimmed;
}

export function rejectionReasonError(reason?: string): string | null {
  if (!validateRejectionReason(reason)) {
    return "سبب الرفض إلزامي — اكتب سبباً واضحاً لرفض اعتماد الدرجة";
  }
  if (reason !== undefined && reason.trim().length > REJECTION_REASON_MAX) {
    return "سبب الرفض طويل جداً (الحد الأقصى 500 حرف)";
  }
  return null;
}