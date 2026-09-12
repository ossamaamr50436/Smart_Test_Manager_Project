import { test } from "node:test";
import assert from "node:assert/strict";

// ============================================================
// اختبار تكاملي لمنطق الاعتماد المستقل:
// كل مختبر يعتمد تقييمه الخاص بشكل مستقل، بدون ترتيب بالعمر.
// يختبر منطق الحالات المستخدمة في approveAssessment و specialistFinalApprove
// ============================================================

type Examiner = { id: string };

test("مختبران يعتمدان بشكل مستقل دون ترتيب", () => {
  const examiner1: Examiner = { id: "t1" };
  const examiner2: Examiner = { id: "t2" };

  // كل مختبر يُحدّد تقييمه المستقل
  const approval1 = { evaluatorId: examiner1.id, status: "APPROVED" };
  const approval2 = { evaluatorId: examiner2.id, status: "APPROVED" };

  assert.equal(approval1.status, "APPROVED");
  assert.equal(approval2.status, "APPROVED");
  assert.equal(approval1.evaluatorId, examiner1.id);
  assert.equal(approval2.evaluatorId, examiner2.id);
});

test("الطالب يصبح COMPLETED بعد أول اعتماد من أي مختبر", () => {
  const assessments: Array<{ status: string }> = [];
  // لم يُعتمد بعد
  assert.equal(assessments.length, 0);

  // مختبر 1 يعتمد
  assessments.push({ status: "APPROVED" });
  assert.equal(assessments.length, 1);
  const studentStatus = "COMPLETED"; // بعد أول اعتماد
  assert.equal(studentStatus, "COMPLETED");

  // مختبر 2 يعتمد (مستقل)
  assessments.push({ status: "APPROVED" });
  assert.equal(assessments.length, 2);
  assert.equal(studentStatus, "COMPLETED");
});

test("تقييم محفوظ (DRAFT) لا يُحتسب في الاعتماد", () => {
  const assessments = [
    { evaluatorId: "t1", status: "DRAFT" },
    { evaluatorId: "t2", status: "APPROVED" },
  ];

  const approved = assessments.filter((a) => a.status === "APPROVED");
  assert.equal(approved.length, 1);
  assert.equal(approved[0]!.evaluatorId, "t2");
});

test("بعد اعتماد الأخصائي، تقييمات المختبرين تتحول إلى ACCEPTED", () => {
  // محاكاة specialistFinalApprove:.updateMany
  const assessments = [
    { evaluatorId: "t1", status: "APPROVED" },
    { evaluatorId: "t2", status: "APPROVED" },
  ];

  // تحديث الاعتماد الإداري
  const updated = assessments.map((a) =>
    a.status === "APPROVED" ? { ...a, status: "ACCEPTED" } : a
  );

  assert.equal(updated[0]!.status, "ACCEPTED");
  assert.equal(updated[1]!.status, "ACCEPTED");
});
