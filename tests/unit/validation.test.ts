import { describe, it, expect } from "vitest";
import {
  assessmentInputSchema,
  assessmentApprovalSchema,
  examSegmentSchema,
  examModelSchema,
  BRANCHES,
} from "@/lib/validations/assessment";

function segment(n: number) {
  return {
    number: n,
    fromText: "بسم الله",
    fromSurah: "البقرة",
    fromVerse: 1,
    toText: "قل هو الله أحد",
    toSurah: "الإخلاص",
    toVerse: 4,
  };
}

describe("assessmentInputSchema", () => {
  const valid = {
    examSessionId: "session-1",
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
  };

  it("يقبل تقييماً صحيحاً كاملاً", () => {
    expect(assessmentInputSchema.safeParse(valid).success).toBe(true);
  });

  it("يرفض أعداداً سلبية ولمة عائمة في حقول العدّ", () => {
    expect(
      assessmentInputSchema.safeParse({ ...valid, wordErrors: -1 }).success
    ).toBe(false);
    expect(
      assessmentInputSchema.safeParse({ ...valid, letterErrors: 1.5 }).success
    ).toBe(false);
  });

  it("يرفض تلاوة/تجويد خارج الحدود (20/10)", () => {
    expect(
      assessmentInputSchema.safeParse({ ...valid, recitationScore: 21 }).success
    ).toBe(false);
    expect(
      assessmentInputSchema.safeParse({ ...valid, tajweedScore: 11 }).success
    ).toBe(false);
  });

  it("يكسر الحقول المفقودة", () => {
    const { tajweedScore: _omit, ...rest } = valid;
    expect(assessmentInputSchema.safeParse(rest).success).toBe(false);
  });

  it("يقبل حقولاً قادمة كنصوص (coerce)", () => {
    expect(
      assessmentInputSchema.safeParse({ ...valid, wordErrors: "3" as unknown as number }).success
    ).toBe(true);
  });
});

describe("assessmentApprovalSchema", () => {
  it("يقبل معرّف جلسة صالح فقط", () => {
    expect(
      assessmentApprovalSchema.safeParse({ examSessionId: "s" }).success
    ).toBe(true);
  });

  it("يرفض معرّف جلسة فارغاً", () => {
    expect(
      assessmentApprovalSchema.safeParse({ examSessionId: "" }).success
    ).toBe(false);
  });
});

describe("examSegmentSchema", () => {
  it("يقبل مقطعاً كاملاً بحقوله السبعة", () => {
    expect(examSegmentSchema.safeParse(segment(1)).success).toBe(true);
  });

  it("يرفض رقم مقطع خارج 1-30", () => {
    expect(examSegmentSchema.safeParse(segment(0)).success).toBe(false);
    expect(examSegmentSchema.safeParse(segment(31)).success).toBe(false);
  });

  it("يرفض نصوصاً فارغة أو أرقام آيات صفرية", () => {
    expect(
      examSegmentSchema.safeParse({ ...segment(1), fromText: "" }).success
    ).toBe(false);
    expect(
      examSegmentSchema.safeParse({ ...segment(1), fromVerse: 0 }).success
    ).toBe(false);
  });
});

describe("examModelSchema + BRANCHES", () => {
  const model = {
    modelNumber: 1,
    branch: "5",
    institutionId: "inst-1",
    seasonId: "season-1",
    segmentsCount: 10,
    segments: Array.from({ length: 10 }, (_, i) => segment(i + 1)),
  };

  it("يقبل نموذجاً كاملاً من 10 مقاطع", () => {
    expect(examModelSchema.safeParse(model).success).toBe(true);
  });

  it("يرفض عدد مقاطع غير 10", () => {
    expect(
      examModelSchema.safeParse({ ...model, segments: segment(1) }).success
    ).toBe(false);
  });

  it("يرفض رقم نموذج خارج 1-100", () => {
    expect(
      examModelSchema.safeParse({ ...model, modelNumber: 0 }).success
    ).toBe(false);
    expect(
      examModelSchema.safeParse({ ...model, modelNumber: 101 }).success
    ).toBe(false);
  });

  it("BRANCHES تحتوي الأفرع الستة المعتمدة", () => {
    expect(BRANCHES).toEqual(["5", "10", "15", "20", "25", "30"]);
  });

  it("يرفض الفرع غير المدرج في اللائحة", () => {
    expect(
      examModelSchema.safeParse({ ...model, branch: "7" }).success
    ).toBe(false);
  });
});