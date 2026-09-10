import { test } from "node:test";
import assert from "node:assert/strict";

import {
  computeTotals,
  hasPassed,
  type ScoreInput,
} from "../../lib/score-calculation";
import { examModelSchema, examSegmentSchema } from "../../lib/validations/assessment";

// ============================================================
// اختبارات حساب الدرجات وفق لائحة اختيار فرع كامل القرآن
// الحفظ (70) + التلاوة (20) + التجويد (10) = 100، والاجتياز 80
// ============================================================

function baseInput(overrides: Partial<ScoreInput> = {}): ScoreInput {
  return {
    wordErrors: 0,
    letterErrors: 0,
    diacriticErrors: 0,
    seriousErrors: 0,
    subtleErrors: 0,
    promptingCount: 0,
    doubtCount: 0,
    tajweedErrors: 0,
    recitationScore: 20,
    tajweedScore: 10,
    ...overrides,
  };
}

test("الحفظ: طالب ممتاز بدون أي أخطاء يحصل على 100", () => {
  const result = computeTotals(baseInput());
  assert.equal(result.memorizationDeduction, 0);
  assert.equal(result.memorizationScore, 70);
  assert.equal(result.finalScore, 100);
  assert.equal(hasPassed(result.finalScore), true);
});

test("الحفظ: خصم 1 درجة لكل خطأ كلمة", () => {
  const result = computeTotals(baseInput({ wordErrors: 5 }));
  assert.equal(result.memorizationDeduction, 5);
  assert.equal(result.finalScore, 95);
});

test("الحفظ: اللحن الجلي يُخصم بواقع 2 درجة لكل خطأ", () => {
  // 3 أخطاء لحن جلي = 6 درجات
  const result = computeTotals(baseInput({ seriousErrors: 3 }));
  assert.equal(result.memorizationDeduction, 6);
  assert.equal(result.finalScore, 94);
});

test("الحفظ: اللحن الخفي يُخصم بواقع 0.5 درجة لكل خطأ", () => {
  // 4 أخطاء لحن خفي = درجتان
  const result = computeTotals(baseInput({ subtleErrors: 4 }));
  assert.equal(result.memorizationDeduction, 2);
  assert.equal(result.finalScore, 98);
});

test("التنبيه: خصم 1 درجة لكل تنبيه", () => {
  const result = computeTotals(baseInput({ promptingCount: 3 }));
  assert.equal(result.promptingDeduction, 3);
  assert.equal(result.finalScore, 97);
});

test("الشك: خصم 0.5 درجة لكل شك (تردد)", () => {
  const result = computeTotals(baseInput({ doubtCount: 4 }));
  assert.equal(result.doubtDeduction, 2);
  assert.equal(result.finalScore, 98);
});

test("إجمالي الخصم: مجموع الأخطاء والتنبيه والشك", () => {
  const result = computeTotals(
    baseInput({
      wordErrors: 5, // -5
      letterErrors: 2, // -2
      seriousErrors: 1, // -2
      promptingCount: 1, // -1
      doubtCount: 2, // -1
    })
  );
  assert.equal(result.memorizationDeduction, 9);
  assert.equal(result.totalDeduction, 11);
  assert.equal(result.finalScore, 89);
});

test("أداء متواضع: تلاوة 0 وتجويد 0، درجة الحفظ المتبقية فقط", () => {
  const result = computeTotals(
    baseInput({ recitationScore: 0, tajweedScore: 0, wordErrors: 10 })
  );
  assert.equal(result.memorizationScore, 60);
  assert.equal(result.finalScore, 60);
  assert.equal(hasPassed(result.finalScore), false);
});

test("درجة لا تقل عن الصفر مهما كثرت الأخطاء", () => {
  const result = computeTotals(
    baseInput({
      wordErrors: 100,
      letterErrors: 100,
      seriousErrors: 100,
      subtleErrors: 100,
      promptingCount: 100,
      doubtCount: 100,
      recitationScore: 0,
      tajweedScore: 0,
    })
  );
  assert.equal(result.memorizationScore, 0);
  assert.equal(result.finalScore, 0);
});

test("الدرجة النهائية الحد الأقصى 100 مهما زادت درجات التلاوة", () => {
  const result = computeTotals(
    baseInput({ recitationScore: 500, tajweedScore: 500 })
  );
  assert.equal(result.finalScore, 100);
});

test("عتبة الاجتياز: 80 بالضبط نجاح", () => {
  assert.equal(hasPassed(80), true);
  assert.equal(hasPassed(79.5), false);
  assert.equal(hasPassed(100), true);
});

// ============================================================
// اختبارات مخطط المقطع والنموذج (وفق اللائحة)
// ============================================================

const validSegment = {
  number: 1,
  fromText: "يَا أَيُّهَا النَّاسُ",
  fromSurah: "البقرة",
  fromVerse: 21,
  toText: "وَإِلَيْهِ تُرْجَعُونَ",
  toSurah: "البقرة",
  toVerse: 28,
};

test("مقطع: قبول مقطع صحيح كامل (الحقول السبعة)", () => {
  assert.equal(examSegmentSchema.safeParse(validSegment).success, true);
});

test("مقطع: رفض رقم مقطع خارج 1-10", () => {
  assert.equal(
    examSegmentSchema.safeParse({ ...validSegment, number: 0 }).success,
    false
  );
  assert.equal(
    examSegmentSchema.safeParse({ ...validSegment, number: 11 }).success,
    false
  );
});

test("مقطع: رفض نص فارغ لأي من «من/إلى قوله تعالى»", () => {
  assert.equal(
    examSegmentSchema.safeParse({ ...validSegment, fromText: "" }).success,
    false
  );
  assert.equal(
    examSegmentSchema.safeParse({ ...validSegment, toText: "" }).success,
    false
  );
});

test("مقطع: رفض أرقام آيات غير صالحة", () => {
  assert.equal(
    examSegmentSchema.safeParse({ ...validSegment, fromVerse: 0 }).success,
    false
  );
  assert.equal(
    examSegmentSchema.safeParse({ ...validSegment, toVerse: -5 }).success,
    false
  );
});

test("نموذج: رفض نموذج بعدد مقاطع غير 10", () => {
  const segments = Array.from({ length: 9 }, (_, i) => ({
    ...validSegment,
    number: i + 1,
  }));
  assert.equal(
    examModelSchema.safeParse({
      modelNumber: 1,
      branch: "5",
      institutionId: "inst1",
      seasonId: "season1",
      segments,
    }).success,
    false
  );
});

test("نموذج: قبول نموذج كامل بأفرع صحيحة", () => {
  const segments = Array.from({ length: 10 }, (_, i) => ({
    ...validSegment,
    number: i + 1,
  }));
  for (const branch of ["5", "10", "15", "20", "25", "30"]) {
    const parsed = examModelSchema.safeParse({
      modelNumber: 1,
      branch,
      institutionId: "inst1",
      seasonId: "season1",
      segments,
    });
    assert.equal(parsed.success, true, `فرع ${branch} يجب أن يكون صحيحاً`);
  }
});

test("نموذج: رفض فرع غير مسموح", () => {
  const segments = Array.from({ length: 10 }, (_, i) => ({
    ...validSegment,
    number: i + 1,
  }));
  assert.equal(
    examModelSchema.safeParse({
      modelNumber: 1,
      branch: "7",
      institutionId: "inst1",
      seasonId: "season1",
      segments,
    }).success,
    false
  );
});

test("نموذج: رفض رقم نموذج خارج 1-20", () => {
  const segments = Array.from({ length: 10 }, (_, i) => ({
    ...validSegment,
    number: i + 1,
  }));
  assert.equal(
    examModelSchema.safeParse({
      modelNumber: 21,
      branch: "5",
      institutionId: "inst1",
      seasonId: "season1",
      segments,
    }).success,
    false
  );
});