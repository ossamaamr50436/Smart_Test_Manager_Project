// ============================================================
// أدوات حساب العمر (تُستخدم في ترتيب الاعتماد حسب العمر)
// ============================================================

/** حساب العمر بالسنوات من تاريخ الميلاد */
export function calculateAge(birthDate: Date | string, from: Date = new Date()): number {
  const birth = typeof birthDate === "string" ? new Date(birthDate) : birthDate;
  if (Number.isNaN(birth.getTime())) {
    throw new Error("تاريخ الميلاد غير صالح");
  }
  const diff = from.getTime() - birth.getTime();
  if (diff < 0) {
    throw new Error("تاريخ الميلاد لا يمكن أن يكون في المستقبل");
  }
  return Math.floor(diff / (1000 * 60 * 60 * 24 * 365.25));
}

/** هل الشخص (أ) أكبر سناً من (ب)؟ */
export function isOlderThan(
  a: { birthDate: Date | null },
  b: { birthDate: Date | null }
): boolean | null {
  if (!a.birthDate || !b.birthDate) return null;
  return a.birthDate <= b.birthDate;
}