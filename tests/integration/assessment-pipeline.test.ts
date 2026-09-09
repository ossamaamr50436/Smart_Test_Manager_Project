import { test } from "node:test";
import assert from "node:assert/strict";
import { assessmentInputSchema, type AssessmentInput } from "../../lib/validations/assessment";
import { computeTotals } from "../../lib/score-calculation";

// ============================================================
// اختبار تكاملي لخط أنابيب التقييم (المسار الذي تسلكه saveAssessment):
// validate → calculate → consistency checks
// ============================================================

function validInput(overrides: Partial<AssessmentInput> = {}): AssessmentInput {
  return {
    examSessionId: "session-integration-1",
    wordErrors: 0,
    letterErrors: 0,
    diacriticErrors: 0,
    seriousErrors: 0,
    subtleErrors: 0,
    promptingCount: 0,
    doubtCount: 0,
    recitationScore: 20,
    tajweedScore: 10,
    ...overrides,
  };
}

test("Pipeline: كل مرشح صالح يُحتسب بدرجة 100 ويجتاز", () => {
  const parsed = assessmentInputSchema.safeParse(validInput());
  assert.equal(parsed.success, true);
  const totals = computeTotals(parsed.data as AssessmentInput);
  assert.equal(totals.finalScore, 100);
  assert.equal(totals.finalScore >= 80, true);
});

test("Pipeline: مرشح بخصومات متنوعة — الدرجة متّسقة مع المعاملات", () => {
  const input = validInput({
    wordErrors: 7,            // -7
    seriousErrors: 2,          // -4
    subtleErrors: 6,           // -3
    promptingCount: 2,         // -2
    doubtCount: 4,             // -2
    recitationScore: 18,       // +18 بدل 20
    tajweedScore: 8,           // +8  بدل 10
  });
  const parsed = assessmentInputSchema.safeParse(input);
  assert.equal(parsed.success, true);
  const totals = computeTotals(input);
  // الحفظ: 70 - (7+4+3+2+2) = 52
  assert.equal(totals.memorizationScore, 52);
  // النهائي: 52 + 18 + 8 = 78
  assert.equal(totals.finalScore, 78);
  assert.equal(totals.finalScore >= 80, false);
});

test("Pipeline: مدخلات غير صالحة تُرفض قبل الحساب (صفر نسبة للغة IEEE-754)", () => {
  // أعداد عشرية يجب رفضها بغض النظر عن الحساب
  const bad = validInput({ wordErrors: 1.5 }) as AssessmentInput;
  assert.equal(assessmentInputSchema.safeParse(bad).success, false);
  // عدد سالب
  const negative = validInput({ tajweedScore: -3 }) as AssessmentInput;
  assert.equal(assessmentInputSchema.safeParse(negative).success, false);
});

test("Pipeline: الحفظ لا يتجاوز 70 والتلاوة لا تتجاوز 20 والتجويد لا يتجاوز 10", () => {
  const parsed = assessmentInputSchema.safeParse(validInput());
  const d = parsed.data as AssessmentInput;
  const totals = computeTotals(d);
  assert.ok(totals.finalScore <= 100);
  assert.ok(totals.memorizationScore <= 70);
  assert.ok(d.recitationScore <= 20);
  assert.ok(d.tajweedScore <= 10);
});