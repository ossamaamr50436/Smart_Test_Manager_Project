import { describe, it, expect } from "vitest";
import {
  ASSESSMENT_COUNT_KEYS,
  countsFromAssessment,
  emptyCounts,
  emptySegment,
  sumCounts,
  totalMemorizationErrors,
} from "@/lib/assessment-counts";

// ============================================================
// J — لوحة التقييم: لا تضخيم ولا فقدان للأخطاء المحفوظة
// جدول assessments يخزّن الإجماليات — نحافظ على sum بعد أي حفظ
// ============================================================

const SEGMENTS = [{ number: 1 }, { number: 2 }, { number: 3 }];

const STORED = {
  wordErrors: 3,
  letterErrors: 2,
  diacriticErrors: 0,
  seriousErrors: 1,
  subtleErrors: 0,
  promptingCount: 4,
  doubtCount: 5,
  tajweedErrors: 6,
} as const;

describe("J — تحويل بيانات التقييم", () => {
  it("مجموع أخطاء الحفظ = الأعمدة السبعة فقط (بلا doubt/tajweed)", () => {
    // 3+2+0+1+0+4 = 10
    expect(totalMemorizationErrors(STORED)).toBe(10);
  });

  it("المجموع عبر المقاطع = المخزَّن بالضبط (لا تضخيم)", () => {
    const counts = countsFromAssessment(STORED, SEGMENTS);
    const sum = sumCounts(counts);
    expect(sum.errorCount).toBe(totalMemorizationErrors(STORED));
    expect(sum.doubtCount).toBe(5);
    expect(sum.tajweedErrors).toBe(6);
  });

  it("مجموع واحد لا يتضاعف مهما زاد عدد المقاطع", () => {
    for (const n of [1, 2, 3, 5, 10]) {
      const segments = Array.from({ length: n }, (_, i) => ({ number: i + 1 }));
      const counts = countsFromAssessment(STORED, segments);
      expect(sumCounts(counts).errorCount).toBe(10);
      expect(Object.keys(counts)).toHaveLength(n);
    }
  });

  it("إجمالي واحد كبير (3) مع عدة مقاطع يبقى 3 بعد إعادة القراءة والحفظ", () => {
    const single = { wordErrors: 3 } as const;
    const counts = countsFromAssessment(single, SEGMENTS);
    expect(counts["1"]?.errorCount).toBe(3);
    expect(counts["2"]?.errorCount).toBe(0);
    expect(sumCounts(counts).errorCount).toBe(3);
  });

  it("صف بلا أخطاء = كل الأصفار", () => {
    const counts = countsFromAssessment({}, SEGMENTS);
    const sum = sumCounts(counts);
    expect(sum).toEqual({ errorCount: 0, doubtCount: 0, tajweedErrors: 0 });
  });

  it("قيم غير صالحة تُرفض صراحةً بدل أن تتحول إلى صفر صامت", () => {
    for (const bad of [
      { wordErrors: "3" },
      { wordErrors: -1 },
      { wordErrors: 1.5 },
      { doubtCount: Number.NaN },
      { tajweedErrors: Infinity },
    ]) {
      expect(() => countsFromAssessment(bad, SEGMENTS)).toThrowError(/غير صالحة/);
    }
  });

  it("بدون مقاطع: لا فهرسة على مصفوفة فارغة", () => {
    expect(countsFromAssessment(STORED, [])).toEqual({});
    expect(sumCounts({})).toEqual(emptySegment());
  });

  it("emptyCounts يبني مفاتيح بأرقام المقاطع", () => {
    expect(emptyCounts(SEGMENTS)).toEqual({
      "1": { errorCount: 0, doubtCount: 0, tajweedErrors: 0 },
      "2": { errorCount: 0, doubtCount: 0, tajweedErrors: 0 },
      "3": { errorCount: 0, doubtCount: 0, tajweedErrors: 0 },
    });
  });

  it("كل مفاتيح العدّادات الثمانية مشمولة في مفتاح واحد", () => {
    expect(ASSESSMENT_COUNT_KEYS).toHaveLength(8);
    expect(new Set(ASSESSMENT_COUNT_KEYS).size).toBe(8);
  });
});
