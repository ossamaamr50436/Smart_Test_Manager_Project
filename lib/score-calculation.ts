// ============================================================
// حساب درجات التقييم — وفق لائحة اختيار فرع كامل القرآن
// دالة نقية قابلة للاختبار (بدون أي اعتماد على الخادم)
// ============================================================
import {
  SCORE_FULL,
  MEMORIZATION_SCORE,
  WORD_ERROR_PENALTY,
  LETTER_ERROR_PENALTY,
  DIACRITIC_ERROR_PENALTY,
  SERIOUS_ERROR_PENALTY,
  SUBTLE_ERROR_PENALTY,
  PROMPTING_PENALTY,
  DOUBT_PENALTY,
  RECITATION_SCORE_MAX,
  TAJWEED_SCORE_MAX,
} from "./score-config";

export type ScoreInput = {
  wordErrors: number;
  letterErrors: number;
  diacriticErrors: number;
  seriousErrors: number;
  subtleErrors: number;
  promptingCount: number;
  doubtCount: number;
  tajweedErrors: number;
  recitationScore: number;
  tajweedScore: number;
};

export type ScoreResult = {
  memorizationDeduction: number;
  promptingDeduction: number;
  doubtDeduction: number;
  totalDeduction: number;
  memorizationScore: number;
  finalScore: number;
};

/**
 * حساب الدرجات وفق اللائحة:
 * الحفظ (70) - الخصومات + التنبيه + الشك + التلاوة (20) + التجويد (10) = 100
 * درجة الاجتياز: 80
 */
export function computeTotals(input: ScoreInput): ScoreResult {
  const memorizationDeduction =
    input.wordErrors * WORD_ERROR_PENALTY +
    input.letterErrors * LETTER_ERROR_PENALTY +
    input.diacriticErrors * DIACRITIC_ERROR_PENALTY +
    input.seriousErrors * SERIOUS_ERROR_PENALTY +
    input.subtleErrors * SUBTLE_ERROR_PENALTY;

  const promptingDeduction = input.promptingCount * PROMPTING_PENALTY;
  const doubtDeduction = input.doubtCount * DOUBT_PENALTY;
  const tajweedDeduction = input.tajweedErrors * 0.5; // خصم 0.5 لكل خطأ تجويد (القيمة الافتراضية)

  const totalDeduction = memorizationDeduction + promptingDeduction + doubtDeduction + tajweedDeduction;

  // درجة الحفظ النهائية: 70 ناقص الخصومات (لا تقل عن الصفر)
  const memorizationScore = Math.max(0, MEMORIZATION_SCORE - totalDeduction);

  const finalScore = Math.max(
    0,
    Math.min(
      SCORE_FULL,
      memorizationScore +
        Math.min(RECITATION_SCORE_MAX, Math.max(0, input.recitationScore)) +
        Math.min(TAJWEED_SCORE_MAX, Math.max(0, input.tajweedScore))
    )
  );

  return {
    memorizationDeduction,
    promptingDeduction,
    doubtDeduction,
    totalDeduction,
    memorizationScore,
    finalScore,
  };
}

/** هل اجتاز الطالب؟ (درجة الاجتياز 80 من 100) */
export function hasPassed(score: number): boolean {
  return score >= 80;
}