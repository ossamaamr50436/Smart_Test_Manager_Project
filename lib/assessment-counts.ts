/**
 * لوحة التقييم — تحويل بيانات التقييم المحفوظة إلى حالة المقاطع
 * ------------------------------------------------------------
 * وحدة نقية (بلا React/Prisma) تُستخدم في `components/examiner/assessment-board.tsx`
 * وفي الاختبارات. الغرض: إزالة التحويل العشوائي للبيانات (casts) ومعالجة
 * القيم المفقودة بشكل صريح وفق الـdomain.
 *
 * حقيقة الـdomain: جدول `assessments` يخزّن **إجماليات** الأخطاء
 * (`wordErrors`…`promptingCount`, `doubtCount`, `tajweedErrors`) وليس توزيعها
 * على المقاطع. لذلك:
 *  - المجموع المخزَّن هو المصدر الوحيد للحقيقة.
 *  - تُحمَّل الإجماليات على **أول مقطع** وباقي المقاطع صفر، فيبقى
 *    `sum(segments) === المخزَّن` بعد أي حفظ لاحق (لا تضخيم ولا فقدان).
 *  - أي قيمة غير رقمية/سالبة تُرفض صراحةً (throw) بدل أن تتحول إلى 0 صامت.
 */

export const ASSESSMENT_COUNT_KEYS = [
  "wordErrors",
  "letterErrors",
  "diacriticErrors",
  "seriousErrors",
  "subtleErrors",
  "promptingCount",
  "doubtCount",
  "tajweedErrors",
] as const;

export type AssessmentCountKey = (typeof ASSESSMENT_COUNT_KEYS)[number];

/** الصف كما يُسقطه `getAssessmentState` (أرقام غير قابلة للـnull في Prisma) */
export type StoredAssessmentCounts = Record<AssessmentCountKey, number>;

export type SegmentNumber = { number: number };

export type EvaluationKeys = "errorCount" | "doubtCount" | "tajweedErrors";

export type SegmentState = Record<EvaluationKeys, number>;
export type Counts = Record<string, SegmentState>;

/** أعمدة الأخطاء التي تُخصم من درجة الحفظ (70) */
const MEMORIZATION_ERROR_KEYS = [
  "wordErrors",
  "letterErrors",
  "diacriticErrors",
  "seriousErrors",
  "subtleErrors",
  "promptingCount",
] as const satisfies readonly AssessmentCountKey[];

export function emptySegment(): SegmentState {
  return { errorCount: 0, doubtCount: 0, tajweedErrors: 0 };
}

export function emptyCounts(segments: readonly SegmentNumber[]): Counts {
  const map: Counts = {};
  for (const seg of segments) {
    map[String(seg.number)] = emptySegment();
  }
  return map;
}

/** يقرأ عدّاداً مخزَّناً ويشترط أن يكون عدداً صحيحاً غير سالب */
function readCount(
  row: Partial<Record<AssessmentCountKey, unknown>>,
  key: AssessmentCountKey
): number {
  const value = row[key];
  if (value === undefined || value === null) return 0;
  if (typeof value !== "number" || !Number.isInteger(value) || value < 0) {
    throw new Error(
      `قيمة التقييم المحفوظة غير صالحة (${key}) — يجب أن تكون عدداً صحيحاً غير سالب`
    );
  }
  return value;
}

/** إجمالي أخطاء الحفظ من أعمدة الأخطاء السبعة */
export function totalMemorizationErrors(
  row: Partial<Record<AssessmentCountKey, unknown>>
): number {
  return MEMORIZATION_ERROR_KEYS.reduce(
    (sum, key) => sum + readCount(row, key),
    0
  );
}

/**
 * يبني حالة المقاطع من صف التقييم المحفوظ.
 * Preserve sum: مجموع العدّادات عبر المقاطع == الإجمالي المخزَّن بالضبط.
 */
export function countsFromAssessment(
  row: Partial<Record<AssessmentCountKey, unknown>>,
  segments: readonly SegmentNumber[]
): Counts {
  const counts = emptyCounts(segments);
  const keys = Object.keys(counts);
  if (keys.length === 0) return counts;

  counts[keys[0]!] = {
    errorCount: totalMemorizationErrors(row),
    doubtCount: readCount(row, "doubtCount"),
    tajweedErrors: readCount(row, "tajweedErrors"),
  };
  return counts;
}

/** المجموع عبر المقاطع (ما تحفظه اللوحة مجدداً) */
export function sumCounts(counts: Counts): SegmentState {
  return Object.values(counts).reduce<SegmentState>(
    (acc, seg) => ({
      errorCount: acc.errorCount + seg.errorCount,
      doubtCount: acc.doubtCount + seg.doubtCount,
      tajweedErrors: acc.tajweedErrors + seg.tajweedErrors,
    }),
    emptySegment()
  );
}
