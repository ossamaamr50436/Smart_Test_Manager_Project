import { describe, it, expect } from "vitest";
import { calculateAge, isOlderThan } from "@/lib/age";

describe("calculateAge", () => {
  const NOW = new Date("2026-09-09T00:00:00Z");

  it("يحسب العمر الصحيح لطفل مولود حديثاً", () => {
    expect(calculateAge("2026-01-01", NOW)).toBe(0);
  });

  it("يحسب العمر الصحيح لعمر وافٍ", () => {
    expect(calculateAge("2010-05-15", NOW)).toBe(16);
  });

  it("يبقى العمر ثابتاً قبل عيد الميلاد", () => {
    expect(calculateAge("2010-12-31", NOW)).toBe(15);
    expect(calculateAge("2010-01-01", NOW)).toBe(16);
  });

  it("يرمي خطأ لتاريخ غير صالح", () => {
    expect(() => calculateAge("not-a-date", NOW)).toThrow();
  });

  it("يرمي خطأ لتاريخ في المستقبل", () => {
    expect(() => calculateAge("2030-01-01", NOW)).toThrow(
      /المستقبل/
    );
  });

  it("يقبل كائن Date أيضاً", () => {
    expect(calculateAge(new Date("2000-01-01"), NOW)).toBe(26);
  });
});

describe("isOlderThan", () => {
  const senior = { birthDate: new Date("1990-01-01") };
  const junior = { birthDate: new Date("2000-01-01") };

  it("يعيد true إذا كان الأول أكبر سناً", () => {
    expect(isOlderThan(senior, junior)).toBe(true);
  });

  it("يعيد false إذا كان الأول أصغر سناً", () => {
    expect(isOlderThan(junior, senior)).toBe(false);
  });

  it("يرجع null إذا نقص تاريخ ميلاد أحدهم", () => {
    expect(isOlderThan({ birthDate: null }, junior)).toBeNull();
    expect(isOlderThan(senior, { birthDate: null })).toBeNull();
  });
});