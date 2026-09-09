import { test } from "node:test";
import assert from "node:assert/strict";

// ============================================================
// اختبار تكاملي لمنطق الاعتماد المتسلسل وفق العمر (المادة 5):
// الأكبر سناً يعتمد أولاً، والأصغر سناً يعتمد اعتماداً نهائياً.
// يعيد إنتاج الحساب الذي تستخدمه approveAssessment
// ============================================================

type Teacher = { id: string; birthDate: Date | null };

function isSenior(currentUserId: string, t1: Teacher, t2: Teacher): boolean {
  if (!t1.birthDate || !t2.birthDate) {
    throw new Error("تاريخ ميلاد أحد المعلمين غير مكتمل");
  }
  const teacher1IsOlder = t1.birthDate <= t2.birthDate;
  if (currentUserId === t1.id) return teacher1IsOlder;
  return !teacher1IsOlder;
}

// حالات استخدام واقعية من اللائحة
const seniorTeacher = { id: "t-senior", birthDate: new Date("1985-02-10") };
const juniorTeacher = { id: "t-junior", birthDate: new Date("1992-11-03") };

test("الاعتماد الأول للأكبر سناً فقط", () => {
  assert.equal(isSenior(seniorTeacher.id, seniorTeacher, juniorTeacher), true);
  assert.equal(isSenior(juniorTeacher.id, seniorTeacher, juniorTeacher), false);
});

test("الاعتماد النهائي للأصغر سناً فقط", () => {
  // الأكبر لا يقوم بالاعتماد النهائي (!isSenior = false) والأصغر هو من يقوم به
  assert.equal(!isSenior(seniorTeacher.id, seniorTeacher, juniorTeacher), false);
  assert.equal(!isSenior(juniorTeacher.id, seniorTeacher, juniorTeacher), true);
});

test("معلمون بتواريخ عيد ميلاد متساوية: الأول في اللجنة يعتبر الأكبر", () => {
  const same1 = { id: "same-1", birthDate: new Date("1990-01-01") };
  const same2 = { id: "same-2", birthDate: new Date("1990-01-01") };
  assert.equal(isSenior(same1.id, same1, same2), true);
  assert.equal(isSenior(same2.id, same1, same2), false);
});

test("نقص أحد التواريخ يمنع الاعتماد تماماً", () => {
  const missing = { id: "t-missing", birthDate: null as Date | null };
  assert.throws(() => isSenior(juniorTeacher.id, seniorTeacher, missing));
});