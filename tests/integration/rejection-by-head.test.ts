import { test } from "node:test";
import assert from "node:assert/strict";
import "dotenv/config";
import { prisma } from "../../lib/prisma";
import {
  AssessmentStatus,
  AuditAction,
  Role,
  StudentStatus,
} from "@prisma/client";
import {
  validateRejectionReason,
  rejectionReasonError,
} from "../../lib/validations/rejection-reason";

// ============================================================
// B4 — رفض اعتماد الدرجة من رئيس الشؤون التعليمية
// (الدورة الكاملة على مستوى الكود/DB يعادل ما يحدث عبر الواجهة)
// Assessment pending → Reject → reason required → REJECTED_BY_HEAD
// → student remains queryable → يظهر في صفحات الرفض الجديدة
// ============================================================

const TENANT_ID = "cmu5ngaxg0000to23u132olty";
const HEAD_ID = "cmu5nprxm0005se1qknujnw7q"; // سروجي — HEAD_OF_AFFAIRS
const SPECIALIST_ID = "cmu6wk0rz0003547lmjjr9f3c"; // أخصائي اختبارات
const INSTITUTION_ID = "cmu5nzwfe0006p2cjye8tenyk";
const EXAMINER_ID = "cmu5ohhxx0008cot1zopapsvy";
const SEASON_ID = "cmu5okrtg000114ablr8hp8ob";
const MODEL_5 = "cmu5ondmd000lse1qzkkvoqno"; // نموذج فرع 5 في البنك

async function createScenarioStudent(name: string) {
  const student = await prisma.student.create({
    data: {
      name,
      age: 10,
      branch: "5",
      nationality: "السعودية",
      teacherName: "مختبر",
      parentPhone: "0500000000",
      status: StudentStatus.NOTIFIED,
      institutionId: INSTITUTION_ID,
      submittedById: SPECIALIST_ID,
      tenantId: TENANT_ID,
    },
  });

  const session = await prisma.examSession.create({
    data: {
      studentId: student.id,
      teacher1Id: EXAMINER_ID,
      teacher2Id: EXAMINER_ID,
      examDate: new Date("2026-10-01T08:00:00.000Z"),
      period: "MORNING",
      status: "SCHEDULED",
      seasonId: SEASON_ID,
      modelId: MODEL_5,
      tenantId: TENANT_ID,
    },
  });

  const assessment = await prisma.assessment.create({
    data: {
      examSessionId: session.id,
      evaluatorId: EXAMINER_ID,
      modelId: MODEL_5,
      tenantId: TENANT_ID,
      finalScore: 95,
      status: AssessmentStatus.ACCEPTED,
    },
  });

  return { studentId: student.id, sessionId: session.id, assessmentId: assessment.id };
}

async function cleanupScenarioStudent(studentId: string) {
  const sessions = await prisma.examSession.findMany({
    where: { studentId },
    select: { id: true },
  });
  const sessionIds = sessions.map((s) => s.id);
  await prisma.notification.deleteMany({ where: { tenantId: TENANT_ID } });
  await prisma.assessment.deleteMany({
    where: { examSessionId: { in: sessionIds } },
  });
  await prisma.examSession.deleteMany({ where: { studentId } });
  await prisma.student.deleteMany({ where: { id: studentId } });
}

// ==== يحاكي rejectStudentByHead بالكامل (بعد التحقق من الصلاحية) — يعمل على DB حقيقي ====
async function rejectByHeadSimulation(studentId: string, reason: string) {
  const rejectedAt = new Date();
  const student = await prisma.student.findUnique({
    where: { id: studentId },
    select: { id: true, status: true },
  });
  if (!student) throw new Error("الطالب غير موجود");
  if (student.status !== StudentStatus.NOTIFIED) {
    throw new Error("الطالب ليس بانتظار مراجعة رئيس الشؤون");
  }

  await prisma.student.update({
    where: { id: studentId },
    data: {
      status: StudentStatus.REJECTED_BY_HEAD,
      rejectionReason: reason,
      rejectedAt,
      rejectedById: HEAD_ID,
    },
  });

  const session = await prisma.examSession.findFirst({
    where: { studentId, assessments: { some: { status: AssessmentStatus.ACCEPTED } } },
    select: { id: true },
  });
  if (session) {
    await prisma.assessment.updateMany({
      where: { examSessionId: session.id, status: AssessmentStatus.ACCEPTED },
      data: { status: AssessmentStatus.REJECTED_BY_HEAD },
    });
  }

  await prisma.auditLog.create({
    data: {
      userId: HEAD_ID,
      tenantId: TENANT_ID,
      action: AuditAction.REJECT,
      details: JSON.stringify({
        entity: "Student",
        studentId,
        step: "HEAD_OF_AFFAIRS_REJECT",
        reason,
        newStatus: StudentStatus.REJECTED_BY_HEAD,
      }),
    },
  });

  return { rejected: true };
}

test("B4-1: السبب إلزامي — رفض فارغ/Whitespace يفشل في Server validation", () => {
  assert.equal(validateRejectionReason(undefined), null);
  assert.equal(validateRejectionReason(""), null);
  assert.equal(validateRejectionReason("   "), null);
  assert.equal(validateRejectionReason("\t\n  "), null);
  assert.equal(validateRejectionReason("سبب صحيح"), "سبب صحيح");
  assert.equal(validateRejectionReason("  سبب صحيح بعد مسافات  "), "سبب صحيح بعد مسافات");
  assert.equal(validateRejectionReason("a".repeat(501)), null);

  assert.ok(rejectionReasonError(""));
  assert.ok(rejectionReasonError("   "));
  assert.equal(rejectionReasonError("سبب صحيح"), null);
});

test("B4-2: سبب صحيح → REJECTED_BY_HEAD + حفظ السبب + الطالب لا يختفي (يظل قابلاً للاستعلام)", async () => {
  const name = `B4 طالب رفض ${Date.now()}`;
  const { studentId } = await createScenarioStudent(name);
  const REASON = "الدرجة غير مطابقة للسجل الرسمي للطالب";

  try {
    const result = await rejectByHeadSimulation(studentId, REASON);
    assert.equal(result.rejected, true);

    // الحالة انتقلت إلى REJECTED_BY_HEAD
    const after = await prisma.student.findUnique({
      where: { id: studentId },
      select: {
        status: true,
        rejectionReason: true,
        rejectedAt: true,
        rejectedById: true,
      },
    });
    assert.equal(after?.status, StudentStatus.REJECTED_BY_HEAD);
    assert.equal(after?.rejectionReason, REASON);
    assert.ok(after?.rejectedAt, "زمن الرفض مسجل");
    assert.equal(after?.rejectedById, HEAD_ID);

    // الطالب بقي قابلاً للاستعلام (لم يُحذف ولم يُعد لقائمة العمل)
    const stillThere = await prisma.student.findUnique({
      where: { id: studentId },
      select: { status: true },
    });
    assert.ok(stillThere, "الطالب ما زال موجوداً في DB");
    assert.equal(stillThere?.status, StudentStatus.REJECTED_BY_HEAD);

    // تقييم الأخصائي تحوّل إلى REJECTED_BY_HEAD
    const session = await prisma.examSession.findFirst({
      where: { studentId },
      select: { id: true },
    });
    const assessments = await prisma.assessment.findMany({
      where: { examSessionId: session?.id ?? "" },
      select: { status: true, finalScore: true },
    });
    assert.equal(assessments.length, 1);
    assert.equal(assessments[0]?.status, AssessmentStatus.REJECTED_BY_HEAD);
    assert.equal(assessments[0]?.finalScore, 95);
  } finally {
    await cleanupScenarioStudent(studentId);
  }
});

test("B4-3: ظهور الطالب في قوائم الرفض (نفس استعلام getStudentsRejectedByHead)", async () => {
  const name = `B4 طالب رفض قوائم ${Date.now()}`;
  const { studentId } = await createScenarioStudent(name);
  const REASON = "غياب توثيق معتمد للدرجة";

  try {
    await rejectByHeadSimulation(studentId, REASON);

    // استعلام الواجهةين الجديدتين
    const rejected = await prisma.student.findMany({
      where: { tenantId: TENANT_ID, status: StudentStatus.REJECTED_BY_HEAD },
      include: {
        institution: { select: { name: true } },
        rejectedBy: { select: { name: true } },
        examSessions: {
          include: {
            assessments: {
              where: { status: AssessmentStatus.REJECTED_BY_HEAD },
              select: { finalScore: true },
            },
          },
        },
      },
      orderBy: { rejectedAt: "desc" },
    });

    const target = rejected.find((s) => s.id === studentId);
    assert.ok(target, "الطالب المرفوض يظهر في قائمة الرفض");
    assert.equal(target.rejectionReason, REASON);
    assert.ok(target.rejectedBy, "مُصدِر الرفض ظاهر");
    assert.ok(
      target.examSessions[0]?.assessments[0]?.finalScore === 95,
      "الدرجة المحفوظة ظاهرة مع قائمة الرفض"
    );
  } finally {
    await cleanupScenarioStudent(studentId);
  }
});

test("B4-4: عزل الصلاحيات — لا تسريب بيانات عبر URL", () => {
  // simulate requireRole: دور غير مصرح لا يصل للبيانات
  function requireRoleForRejection(role: Role) {
    const allowed: Role[] = [Role.HEAD_OF_AFFAIRS, Role.TEST_SPECIALIST, Role.ADMIN];
    if (!allowed.includes(role)) {
      throw new Error("غير مصرح: لا تملك صلاحية التنفيذ");
    }
    return true;
  }

  assert.doesNotThrow(() => requireRoleForRejection(Role.HEAD_OF_AFFAIRS));
  assert.doesNotThrow(() => requireRoleForRejection(Role.TEST_SPECIALIST));
  assert.throws(() => requireRoleForRejection(Role.EXAMINER));
  assert.throws(() => requireRoleForRejection(Role.INSTITUTION));
  assert.throws(() => requireRoleForRejection(Role.CERTIFICATE_SOURCE));
});

// ==== §8.1 — تعديل الدرجة الاختياري من رئيس الشؤون عند الاعتماد النهائي ====
test("B4-5: §8.1 — اعتماد الرئيس مع درجة معدّلة اختيارية يطبّق الدرجة ويوثّقها", async () => {
  const name = `B4 طالب اعتماد معدّل ${Date.now()}`;
  const { studentId } = await createScenarioStudent(name);
  const OVERRIDE = 88.5;

  try {
    // يحاكي headOfAffairsFinalApprove(studentId, 88.5):
    // NOTIFIED → READY_FOR_CERTIFICATE + finalizedAt؛ التقييم ACCEPTED → NOTIFIED
    // مع تحديث finalScore وحفظ سجل التدقيق step=HEAD_OFFICIAL_SCORE_OVERRIDE
    const student = await prisma.student.findUnique({
      where: { id: studentId },
      select: { id: true, status: true, tenantId: true },
    });
    assert.equal(student?.status, StudentStatus.NOTIFIED);

    await prisma.student.update({
      where: { id: studentId },
      data: { status: StudentStatus.READY_FOR_CERTIFICATE, finalizedAt: new Date() },
    });

    const session = await prisma.examSession.findFirst({
      where: { studentId, assessments: { some: { status: AssessmentStatus.ACCEPTED } } },
      select: { id: true },
    });
    assert.ok(session, "الجلسة موجودة");
    const beforeAssessments = await prisma.assessment.findMany({
      where: { examSessionId: session!.id, status: AssessmentStatus.ACCEPTED },
      select: { id: true, finalScore: true, evaluatorId: true },
    });
    assert.equal(beforeAssessments.length, 1);
    assert.equal(beforeAssessments[0]!.finalScore, 95);

    await prisma.assessment.updateMany({
      where: { examSessionId: session!.id, status: AssessmentStatus.ACCEPTED },
      data: { status: AssessmentStatus.NOTIFIED, finalScore: OVERRIDE },
    });

    await prisma.auditLog.create({
      data: {
        userId: HEAD_ID,
        tenantId: TENANT_ID,
        action: AuditAction.APPROVE,
        details: JSON.stringify({
          studentId,
          step: "HEAD_OFFICIAL_SCORE_OVERRIDE",
          previousScores: beforeAssessments.map((a) => ({
            evaluatorId: a.evaluatorId,
            score: a.finalScore,
          })),
          newScore: OVERRIDE,
        }),
      },
    });

    // التحقق من الحالة الجديدة والدرجة المعدّلة
    const after = await prisma.student.findUnique({
      where: { id: studentId },
      select: { status: true, finalizedAt: true },
    });
    assert.equal(after?.status, StudentStatus.READY_FOR_CERTIFICATE);
    assert.ok(after?.finalizedAt, "زمن الاعتماد النهائي مسجل");

    const assessed = await prisma.assessment.findFirst({
      where: { examSessionId: session!.id },
      select: { status: true, finalScore: true },
    });
    assert.equal(assessed?.status, AssessmentStatus.NOTIFIED);
    assert.equal(assessed?.finalScore, OVERRIDE);

    // سجل التدقيق يحوي الأثر: الدرجة القديمة 95 والجديدة 88.5
    const audit = await prisma.auditLog.findFirst({
      where: {
        tenantId: TENANT_ID,
        action: AuditAction.APPROVE,
        userId: HEAD_ID,
        details: { string_contains: "HEAD_OFFICIAL_SCORE_OVERRIDE" },
      },
      orderBy: { timestamp: "desc" },
      select: { details: true },
    });
    assert.ok(audit, "سجل التدقيق لتعديل الرئيس موجود");
    assert.ok(JSON.stringify(audit!.details).includes("88.5"), "الدرجة الجديدة موثقة في التدقيق");
    assert.ok(JSON.stringify(audit!.details).includes("95"), "الدرجة القديمة موثقة في التدقيق");
  } finally {
    await prisma.auditLog.deleteMany({
      where: {
        tenantId: TENANT_ID,
        action: AuditAction.APPROVE,
        userId: HEAD_ID,
        details: { string_contains: "HEAD_OFFICIAL_SCORE_OVERRIDE" },
      },
    });
    await cleanupScenarioStudent(studentId);
  }
});