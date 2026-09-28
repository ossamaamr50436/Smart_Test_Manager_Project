import { describe, it, expect } from "vitest";
import { config as loadEnv } from "dotenv";
import fs from "node:fs";
import path from "node:path";

loadEnv({ path: ".env" });

// ============================================================
// M35 (أ) — عدد المقاطع: الافتراضي 5 والنطاق 1..10
// فحص ثابت + سلوك فعلي للمخطط (بدون قاعدة بيانات).
// ============================================================

const { questionBankSchema, importQuestionBankSchema, IMPORT_MIN_SEGMENTS } =
  await import("@/lib/validations/question-bank");

function segment(n: number) {
  return {
    number: n,
    fromText: `نص بداية ${n}`,
    fromSurah: "البقرة",
    fromVerse: n,
    toText: `نص نهاية ${n}`,
    toSurah: "البقرة",
    toVerse: n + 1,
  };
}

function payload(segmentsCount: number, count = segmentsCount) {
  return {
    modelNumber: 1,
    branch: "5" as const,
    segmentsCount,
    segments: Array.from({ length: count }, (_, i) => segment(i + 1)),
  };
}

describe("M35/A — نطاق عدد المقاطع 1..10 والافتراضي 5", () => {
  it("يقبل 1 و5 و10", () => {
    for (const n of [1, 5, 10]) {
      const r = questionBankSchema.safeParse(payload(n));
      expect(r.success, `رُفض ${n}: ${r.success ? "" : r.error.issues[0]?.message}`).toBe(true);
    }
  });

  it("يرفض 0 و11 (خارج النطاق)", () => {
    for (const n of [0, 11]) {
      const r = questionBankSchema.safeParse(payload(n));
      expect(r.success, `قُبل ${n} خطأً`).toBe(false);
    }
  });

  it("يرفض عدداً غير صحيح (كسري) وغير رقم", () => {
    expect(questionBankSchema.safeParse(payload(5.5)).success).toBe(false);
    expect(questionBankSchema.safeParse(payload("abc" as unknown as number)).success).toBe(false);
  });

  it("الافتراضي عند حذف segmentsCount = 5", () => {
    const input = payload(5);
    delete (input as { segmentsCount?: number }).segmentsCount;
    const r = questionBankSchema.safeParse(input);
    expect(r.success, "فشل التحقق عند حذف segmentsCount").toBe(true);
    if (r.success) expect(r.data.segmentsCount).toBe(5);
  });

  it("الافتراضي 5 مطبَّق فعلياً في المخطط (وليس في المتصل فقط)", () => {
    // فحص ساكن: presence of .default(5) على segmentsCount
    const src = fs.readFileSync(
      path.resolve(process.cwd(), "lib/validations/question-bank.ts"),
      "utf8"
    );
    const block = src.slice(
      src.indexOf("segmentsCount:"),
      src.indexOf("segments:", src.indexOf("segmentsCount:"))
    );
    expect(block).toMatch(/\.min\(1,/);
    expect(block).toMatch(/\.max\(10,/);
    expect(block).toMatch(/\.default\(5\)/);
  });

  it("الواجهة: الافتراضي 5 والنطاق 1..10 في مديري النماذج", () => {
    for (const file of [
      "components/admin/question-bank-manager.tsx",
      "components/specialist/exam-models-manager.tsx",
    ]) {
      const src = fs.readFileSync(path.resolve(process.cwd(), file), "utf8");
      // الحالة الابتدائية = 5
      expect(src, `${file}: useState(5)`).toMatch(/useState\(5\)/);
      // الحد الأعلى = 10
      expect(src, `${file}: MAX_SEGMENTS = 10`).toMatch(/const MAX_SEGMENTS = 10/);
      // القائمة تعرض 1..MAX_SEGMENTS
      expect(src, `${file}: عناصر 1..MAX`).toMatch(
        /Array\.from\(\{ length: MAX_SEGMENTS \}, \(.*, i\) => i \+ 1\)/
      );
      // التحديد يقيّد 1..MAX
      expect(src, `${file}: clamp`).toMatch(
        /Math\.min\(Math\.max\((Number\(v\)|count|m\.segmentsCount), 1\), MAX_SEGMENTS\)/
      );
    }
  });

  it("الاستيراد يشترط 5 مقاطع على الأقل (حد مستقل عن نطاق 1..10)", () => {
    expect(IMPORT_MIN_SEGMENTS).toBe(5);
    expect(importQuestionBankSchema.safeParse(payload(4, 4)).success).toBe(false);
    expect(importQuestionBankSchema.safeParse(payload(5, 5)).success).toBe(true);
    // segmentsCount=5 مع segments أقل من 5 يمر في questionBankSchema ويرفض في الاستيراد
    expect(questionBankSchema.safeParse({ ...payload(5, 5), segments: [segment(1)] }).success).toBe(
      true
    );
    expect(importQuestionBankSchema.safeParse({ ...payload(5, 5), segments: [segment(1)] }).success).toBe(
      false
    );
  });
});
