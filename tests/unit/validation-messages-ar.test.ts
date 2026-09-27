import { describe, it, expect } from "vitest";
import { assessmentInputSchema } from "@/lib/validations/assessment";
import { questionBankSchema, importQuestionBankSchema } from "@/lib/validations/question-bank";

// ============================================================
// M40 — لا رسائل تحقق إنجليزية تصل للمستخدم
// (المصدر: zod default messages = "Required" / "Invalid input")
// ============================================================

const ENGLISH_MARKERS = /^(Required|Invalid input|Invalid input:|Expected|Received)/i;

function messagesOf(result: { success: boolean; error?: { issues?: { message: string }[] } }) {
  if (result.success || !result.error) return [];
  return result.error.issues?.map((i) => i.message) ?? [];
}

const SEGMENT = {
  number: 1,
  fromText: "نص",
  fromSurah: "البقرة",
  fromVerse: 1,
  toText: "نص",
  toSurah: "آل عمران",
  toVerse: 2,
};

const VALID_ASSESSMENT = {
  examSessionId: "ses_1",
  wordErrors: 0,
  letterErrors: 0,
  diacriticErrors: 0,
  seriousErrors: 0,
  subtleErrors: 0,
  promptingCount: 0,
  doubtCount: 0,
  recitationScore: 18,
  tajweedScore: 9,
  tajweedErrors: 0,
};

describe("M40 — رسائل التحقق عربية بالكامل", () => {
  it("تقييم صحيح كامل يُقبل (خط الأساس)", () => {
    expect(assessmentInputSchema.safeParse(VALID_ASSESSMENT).success).toBe(true);
  });

  it("تقييم ناقص الحقول: لا رسالة إنجليزية", () => {
    for (const key of Object.keys(VALID_ASSESSMENT)) {
      const partial: Record<string, unknown> = { ...VALID_ASSESSMENT };
      delete partial[key];
      const msgs = messagesOf(assessmentInputSchema.safeParse(partial));
      expect(msgs.length, `الحقل ${key} يجب أن يُرفض`).toBeGreaterThan(0);
      for (const m of msgs) {
        expect(m, `الحقل ${key}: ${m}`).not.toMatch(ENGLISH_MARKERS);
      }
    }
  });

  it("مقطع ناقص الحقول: لا رسالة إنجليزية", () => {
    const validModel = {
      modelNumber: 1,
      branch: "5",
      segmentsCount: 5,
      segments: Array.from({ length: 5 }, (_, i) => ({ ...SEGMENT, number: i + 1 })),
    };
    for (const key of Object.keys(SEGMENT)) {
      const broken = validModel.segments.map((s) => ({ ...s }));
      const target = broken[0] as Record<string, unknown>;
      delete target[key];
      const msgs = messagesOf(
        questionBankSchema.safeParse({ ...validModel, segments: broken })
      );
      expect(msgs.length, `الحقل الناقص ${key} يجب أن يُرفض`).toBeGreaterThan(0);
      for (const m of msgs) {
        expect(m, `الحقل ${key}: ${m}`).not.toMatch(ENGLISH_MARKERS);
      }
    }
  });

  it("نموذج ناقص: لا رسالة إنجليزية (مخطط الاستيراد أيضاً)", () => {
    for (const key of ["modelNumber", "branch", "segmentsCount", "segments"]) {
      const partial: Record<string, unknown> = {
        modelNumber: 1,
        branch: "5",
        segmentsCount: 5,
        segments: Array.from({ length: 5 }, (_, i) => ({ ...SEGMENT, number: i + 1 })),
      };
      delete partial[key];
      for (const msgs of [
        messagesOf(questionBankSchema.safeParse(partial)),
        messagesOf(importQuestionBankSchema.safeParse(partial)),
      ]) {
        for (const m of msgs) {
          expect(m, `الحقل ${key}: ${m}`).not.toMatch(ENGLISH_MARKERS);
        }
      }
    }
  });

  it("قيم من النوع الخطأ تُرفض برسائل عربية", () => {
    const msgs = messagesOf(
      assessmentInputSchema.safeParse({ ...VALID_ASSESSMENT, wordErrors: "abc" })
    );
    expect(msgs.length).toBeGreaterThan(0);
    for (const m of msgs) expect(m).not.toMatch(ENGLISH_MARKERS);
  });
});
