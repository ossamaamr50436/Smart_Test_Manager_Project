import { test } from "node:test";
import assert from "node:assert/strict";

import {
  studentApplicationSchema,
  committeeSchema,
} from "../../lib/validations/student";
import {
  assessmentInputSchema,
  assessmentApprovalSchema,
} from "../../lib/validations/assessment";
import { birthDateSchema } from "../../lib/validations/user";

// ============================================================
// اختبارات أمان التحقق من المدخلات (Input Validation Security Tests)
// تتأكد من رفض المدخلات الضارة قبل وصولها لأي عملية قاعدة بيانات
// ============================================================

test("طالب: رفض اسم فارغ أو ضخم", () => {
  assert.equal(
    studentApplicationSchema.safeParse({
      name: "",
      age: 10,
      branch: "10",
      teacherName: "معلم",
      parentPhone: "0599999999",
    }).success,
    false
  );

  assert.equal(
    studentApplicationSchema.safeParse({
      name: "a".repeat(5000),
      age: 10,
      branch: "10",
      teacherName: "معلم",
      parentPhone: "0599999999",
    }).success,
    false
  );
});

test("طالب: رفض عمر خارج النطاق المسموح (4-18)", () => {
  assert.equal(
    studentApplicationSchema.safeParse({
      name: "طالب",
      age: 3,
      branch: "10",
      teacherName: "معلم",
      parentPhone: "0599999999",
    }).success,
    false
  );
  assert.equal(
    studentApplicationSchema.safeParse({
      name: "طالب",
      age: 19,
      branch: "10",
      teacherName: "معلم",
      parentPhone: "0599999999",
    }).success,
    false
  );
});

test("طالب: رفض عمر عشري أو نصي ضار", () => {
  const parsed = studentApplicationSchema.safeParse({
    name: "طالب",
    age: "12.5",
    branch: "10",
    teacherName: "معلم",
    parentPhone: "0599999999",
  });
  // z.coerce يحول "12.5" إلى 12.5 ثم يرفض لأنه ليس int
  assert.equal(parsed.success, false);

  assert.equal(
    studentApplicationSchema.safeParse({
      name: "طالب",
      age: "abc",
      branch: "10",
      teacherName: "معلم",
      parentPhone: "0599999999",
    }).success,
    false
  );
});

test("طالب: رفض فرع غير مسموح (اختيار غير enum)", () => {
  assert.equal(
    studentApplicationSchema.safeParse({
      name: "طالب",
      age: 10,
      branch: "7", // ليست ضمن الفروع المسموحة
      teacherName: "معلم",
      parentPhone: "0599999999",
    }).success,
    false
  );
});

test("طالب: رفض رقم ولي أمر قصير جداً أو ضخم", () => {
  assert.equal(
    studentApplicationSchema.safeParse({
      name: "طالب",
      age: 10,
      branch: "10",
      teacherName: "معلم",
      parentPhone: "123", // قصير
    }).success,
    false
  );
  assert.equal(
    studentApplicationSchema.safeParse({
      name: "طالب",
      age: 10,
      branch: "10",
      teacherName: "معلم",
      parentPhone: "1".repeat(100), // طويل
    }).success,
    false
  );
});

test("لجنة: رفض معرّفات مفقودة أو فارغة", () => {
  assert.equal(
    committeeSchema.safeParse({
      studentId: "",
      teacher1Id: "t1",
      teacher2Id: "t2",
      examDate: "2026-01-01",
      period: "صباحي",
    }).success,
    false
  );
  assert.equal(
    committeeSchema.safeParse({
      studentId: "s1",
      teacher1Id: "",
      teacher2Id: "t2",
      examDate: "2026-01-01",
      period: "صباحي",
    }).success,
    false
  );
});

test("لجنة: رفض فترة غير صالحة (وليس enum)", () => {
  assert.equal(
    committeeSchema.safeParse({
      studentId: "s1",
      teacher1Id: "t1",
      teacher2Id: "t2",
      examDate: "2026-01-01",
      period: "ليلي", // غير مسموح
    }).success,
    false
  );
});

test("تقييم: رفض أعداد سلبية أو أكبر من 20", () => {
  assert.equal(
    assessmentInputSchema.safeParse({
      examSessionId: "session1",
      errorsCount: -1,
      doubtsCount: 0,
      tajweedCount: 0,
    }).success,
    false
  );
  assert.equal(
    assessmentInputSchema.safeParse({
      examSessionId: "session1",
      errorsCount: 21,
      doubtsCount: 0,
      tajweedCount: 0,
    }).success,
    false
  );
});

test("تقييم: رفض أعداد عشرية (ليست صحيحة)", () => {
  assert.equal(
    assessmentInputSchema.safeParse({
      examSessionId: "session1",
      errorsCount: 1.5,
      doubtsCount: 0,
      tajweedCount: 0,
    }).success,
    false
  );
});

test("اعتماد: رفض إجراء غير معروف ومنع صارم للـ enum", () => {
  assert.equal(
    assessmentApprovalSchema.safeParse({
      examSessionId: "session1",
      action: "delete", // ضار
    }).success,
    false
  );
  assert.equal(
    assessmentApprovalSchema.safeParse({
      examSessionId: "",
      action: "approve",
    }).success,
    false
  );
});

test("تاريخ الميلاد: رفض تاريخ في المستقبل أو قبل 1900", () => {
  assert.equal(birthDateSchema.safeParse(new Date("3000-01-01")).success, false);
  assert.equal(birthDateSchema.safeParse(new Date("1850-01-01")).success, false);
  assert.equal(birthDateSchema.safeParse(new Date("1990-05-15")).success, true);
});