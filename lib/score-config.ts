// ============================================================
// معاملات التقييم — وفق لائحة اختيار فرع كامل القرآن (صفحة 7)
// الدرجة النهائية من 100 ودرجة الاجتياز 80
// ============================================================

export const SCORE_FULL = 100;
export const PASSING_SCORE = 80;

// الحفظ (70 درجة) — تُخصم الأخطاء من هذه الدرجة
export const MEMORIZATION_SCORE = 70;
export const WORD_ERROR_PENALTY = 1; // خطأ الكلمة — خصم 1
export const LETTER_ERROR_PENALTY = 1; // خطأ الحرف — خصم 1
export const DIACRITIC_ERROR_PENALTY = 1; // خطأ الضبط — خصم 1
export const SERIOUS_ERROR_PENALTY = 2; // اللحن الجلي — خصم 2
export const SUBTLE_ERROR_PENALTY = 0.5; // اللحن الخفي — خصم 0.5

// التنبيه — خصم عند الحاجة
export const PROMPTING_PENALTY = 1; // خصم 1 لكل تنبيه

// الشك (التردد)
export const DOUBT_PENALTY = 0.5; // خصم 0.5 لكل شك

// التلاوة وحسن الأداء (20 درجة) — تُقيّم من المعلم مباشرة
export const RECITATION_SCORE_MAX = 20;

// التجويد التطبيقي (10 درجات) — تُقيّم من المعلم مباشرة
export const TAJWEED_SCORE_MAX = 10;