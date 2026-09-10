import { describe, it, expect } from "vitest";
import {
  computeTotals,
  hasPassed,
  type ScoreInput,
} from "@/lib/score-calculation";
import {
  SCORE_FULL,
  PASSING_SCORE,
  MEMORIZATION_SCORE,
  RECITATION_SCORE_MAX,
  TAJWEED_SCORE_MAX,
} from "@/lib/score-config";

function base(overrides: Partial<ScoreInput> = {}): ScoreInput {
  return {
    wordErrors: 0,
    letterErrors: 0,
    diacriticErrors: 0,
    seriousErrors: 0,
    subtleErrors: 0,
    promptingCount: 0,
    doubtCount: 0,
    tajweedErrors: 0,
    recitationScore: RECITATION_SCORE_MAX,
    tajweedScore: TAJWEED_SCORE_MAX,
    ...overrides,
  };
}

describe("سليمية معاملات اللائحة (ثوابت)", () => {
  it("الدرجة الكاملة 100 والحفظ 70 والاجتياز 80", () => {
    expect(SCORE_FULL).toBe(100);
    expect(MEMORIZATION_SCORE).toBe(70);
    expect(PASSING_SCORE).toBe(80);
  });

  it("مجموع الحفظ + التلاوة + التجويد = الدرجة الكاملة", () => {
    expect(MEMORIZATION_SCORE + RECITATION_SCORE_MAX + TAJWEED_SCORE_MAX).toBe(
      SCORE_FULL
    );
  });
});

describe("computeTotals", () => {
  it("طالب ممتاز بلا أخطاء يحصل على 100 ويجتاز", () => {
    const r = computeTotals(base());
    expect(r.memorizationDeduction).toBe(0);
    expect(r.memorizationScore).toBe(70);
    expect(r.finalScore).toBe(100);
    expect(hasPassed(r.finalScore)).toBe(true);
  });

  it("خصم 1 عن خطأ الكلمة، 1 عن خطأ الحرف، 1 عن خطأ الضبط", () => {
    const r = computeTotals(
      base({ wordErrors: 2, letterErrors: 3, diacriticErrors: 1 })
    );
    expect(r.memorizationDeduction).toBe(6);
    expect(r.finalScore).toBe(94);
  });

  it("اللحن الجلي بواقع 2 درجة واللحن الخفي بنصف درجة", () => {
    const r = computeTotals(base({ seriousErrors: 3, subtleErrors: 2 }));
    expect(r.memorizationDeduction).toBe(6 + 1);
  });

  it("التنبيه بدرجة واحدة والشك بنصف درجة", () => {
    const r = computeTotals(base({ promptingCount: 2, doubtCount: 4 }));
    expect(r.promptingDeduction).toBe(2);
    expect(r.doubtDeduction).toBe(2);
    expect(r.finalScore).toBe(96);
  });

  it("الدرجة لا تقل عن الصفر مهما كثرت الأخطاء", () => {
    const r = computeTotals(
      base({
        wordErrors: 200,
        seriousErrors: 100,
        promptingCount: 80,
        doubtCount: 90,
        recitationScore: 0,
        tajweedScore: 0,
      })
    );
    expect(r.finalScore).toBe(0);
  });

  it("الدرجة لا تتجاوز 100 مهما كانت التلاوة زائدة", () => {
    const r = computeTotals(base({ recitationScore: 99, tajweedScore: 99 }));
    expect(r.finalScore).toBe(100);
  });

  it("خسارة 2 من 20 للتلاوة تنعكس على النتيجة", () => {
    const r = computeTotals(base({ recitationScore: 18 }));
    expect(r.finalScore).toBe(98);
  });
});

describe("hasPassed", () => {
  it("80 بالضبط نجاح", () => {
    expect(hasPassed(80)).toBe(true);
  });
  it("79 رسوب", () => {
    expect(hasPassed(79)).toBe(false);
  });
  it("100 نجاح", () => {
    expect(hasPassed(100)).toBe(true);
  });
});