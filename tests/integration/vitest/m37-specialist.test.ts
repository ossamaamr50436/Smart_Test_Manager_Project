import { describe, it, expect, beforeAll, afterAll, vi } from "vitest";
import { config as loadEnv } from "dotenv";
import fs from "node:fs";
import path from "node:path";

loadEnv({ path: ".env" });

// ============================================================
// M37 — الأخصائي + رئيس الشؤون التعليمية
// ------------------------------------------------------------
//  أ: عرض الأخصائي (النموذج/التاريخ/الفترة/تقييم المختبرين)
//     + تعديل الدرجة الاختياري مع سجل تدقيق
//  ب: إسقاط رئيس الشؤون على مستوى الخادم
//  ج: اعتماد/تعديل/رفض رئيس الشؤون
// بيانات مؤقتة داخل tenant 50436، تُنظَّف في finally.
// ============================================================

const session = vi.hoisted(() => ({ userId: null as string | null }));

vi.mock("@/auth", () => ({
  auth: async () => (session.userId ? { user: { id: session.userId } } : null),
  signIn: async () => undefined,
  signOut: async () => undefined,
  handlers: {},
}));

vi.mock("next/cache", () => ({
  revalidatePath: () => undefined,
  revalidateTag: () => undefined,
  unstable_cache: (fn: unknown) => fn,
}));

vi.mock("next-auth", () => ({
  AuthError: class AuthError extends Error {},
}));

let prisma: typeof import("@/lib/prisma")["prisma"];
let adminActions: typeof import("@/lib/actions/admin-actions");
let headActions: typeof import("@/lib/actions/head-actions");
let projections: typeof import("@/lib/privacy/student-projections");

const OWN = "50436";

const E = {
  specialist: "fx50436-specialist@e2e.exp.local",
  head: "fx50436-head@e2e.exp.local",
  examiner1: "fx50436-examiner1@e2e.exp.local",
  examiner2: "fx50436-examiner2@e2e.exp.local",
};

let tenantId: string;
let institutionId: string;
let seasonId: string;
let modelId: string;
let examiner1Id: string;
let examiner2Id: string;
let headId: string;
let specialistId: string;

async function asUser(email: string) {
  const user = await prisma.user.findUniqueOrThrow({ where: { email }, select: { id: true } });
  session.userId = user.id;
  return user;
}

/** تفاصيل سجل التدقيق: Prisma قد تعيدها نصاً أو كائن JSON */
function detailsJson(details: unknown): Record<string, unknown> {
  const raw = typeof details === "string" ? details : JSON.stringify(details);
  return JSON.parse(raw) as Record<string, unknown>;
}

beforeAll(async () => {
  ({ prisma } = await import("@/lib/prisma"));
  adminActions = await import("@/lib/actions/admin-actions");
  headActions = await import("@/lib/actions/head-actions");
  projections = await import("@/lib/privacy/student-projections");

  tenantId = (
    await prisma.tenant.findUniqueOrThrow({ where: { slug: OWN }, select: { id: true } })
  ).id;
  institutionId = (
    await prisma.institution.findFirstOrThrow({ where: { tenantId }, select: { id: true } })
  ).id;
  seasonId = (
    await prisma.examSeason.findFirstOrThrow({ where: { tenantId }, select: { id: true } })
  ).id;
  // ExamSession فيها @@unique([seasonId, modelId]) — لكل ملف اختبار نموذجه
  // (m35/F يأخذ #1، m36 يأخذ #2) حتى لا تتعارض الجلسات عند التشغيل المتوازي
  modelId = (
    await prisma.questionBankModel.findFirstOrThrow({
      where: { tenantId, branch: "5" },
      orderBy: { modelNumber: "asc" },
      skip: 2,
      select: { id: true },
    })
  ).id;
  examiner1Id = (
    await prisma.user.findUniqueOrThrow({ where: { email: E.examiner1 }, select: { id: true } })
  ).id;
  examiner2Id = (
    await prisma.user.findUniqueOrThrow({ where: { email: E.examiner2 }, select: { id: true } })
  ).id;
  headId = (
    await prisma.user.findUniqueOrThrow({ where: { email: E.head }, select: { id: true } })
  ).id;
  specialistId = (
    await prisma.user.findUniqueOrThrow({ where: { email: E.specialist }, select: { id: true } })
  ).id;
  expect(examiner1Id).not.toBe(examiner2Id);
}, 120_000);

afterAll(async () => {
  await prisma?.$disconnect();
});

type Fixture = { studentId: string; sessionId: string; cleanup: () => Promise<void> };

/**
 * طالب بحالة initial مع جلسة فيها تقييمان للمدخلين.
 * initial = "COMPLETED" (جاهز للمراجعة من الأخصائي)
 *        | "NOTIFIED" (جاهز لرئيس الشؤون بعد اعتماد الأخصائي)
 */
async function makeFixture(name: string, initial: "COMPLETED" | "NOTIFIED"): Promise<Fixture> {
  const auditBaseline = (
    await prisma.auditLog.findMany({
      where: { userId: { in: [examiner1Id, examiner2Id, headId, specialistId] } },
      select: { id: true },
    })
  ).map((a) => a.id);

  let studentId: string | undefined;
  let sessionId: string | undefined;

  // الفشل أثناء الإنشاء (مثل تعارض @@unique) يجب ألا يترك طالباً يتيماً
  try {
    const student = await prisma.student.create({
      data: {
        name,
        age: 13,
        branch: "5",
        teacherName: "أ.م37",
        parentPhone: "0550000000",
        status: initial,
        institutionId,
        tenantId,
      },
      select: { id: true },
    });
    studentId = student.id;
    const examSession = await prisma.examSession.create({
      data: {
        studentId: student.id,
        teacher1Id: examiner1Id,
        teacher2Id: examiner2Id,
        examDate: new Date(),
        period: "صباحي",
        status: "SCHEDULED",
        seasonId,
        modelId,
        tenantId,
      },
      select: { id: true },
    });
    sessionId = examSession.id;
    // ACCEPTED = اعتمد الأخصائي التقييمين؛ NOTIFIED = اعتمدهما رئيس الشؤون
    const assessmentStatus = initial === "COMPLETED" ? "APPROVED" : "ACCEPTED";
    await prisma.assessment.createMany({
      data: [
        {
          examSessionId: examSession.id,
          evaluatorId: examiner1Id,
          modelId,
          status: assessmentStatus,
          finalScore: 80,
          tenantId,
        },
        {
          examSessionId: examSession.id,
          evaluatorId: examiner2Id,
          modelId,
          status: assessmentStatus,
          finalScore: 76,
          tenantId,
        },
      ],
    });
  } catch (e) {
    if (sessionId) {
      await prisma.assessment.deleteMany({ where: { examSessionId: sessionId } });
      await prisma.examSession.deleteMany({ where: { id: sessionId } });
    }
    if (studentId) {
      await prisma.student.deleteMany({ where: { id: studentId } });
    }
    throw e;
  }

  return {
    studentId: studentId!,
    sessionId: sessionId!,
    cleanup: async () => {
      // الإشعارات تُنشأ بالاسم لا بـexamSessionId
      await prisma.notification.deleteMany({ where: { tenantId, message: { contains: name } } });
      await prisma.assessment.deleteMany({ where: { examSessionId: sessionId! } });
      await prisma.examSession.deleteMany({ where: { id: sessionId! } });
      await prisma.auditLog.deleteMany({
        where: {
          userId: { in: [examiner1Id, examiner2Id, headId, specialistId] },
          id: { notIn: auditBaseline },
        },
      });
      await prisma.student.deleteMany({ where: { id: studentId! } });
    },
  };
}

// ------------------------------------------------------------
// (أ) الأخصائي
// ------------------------------------------------------------
describe("M37/A — عرض الأخصائي", () => {
  it("الصفحة تعرض النموذج والتاريخ والفترة وتقييم المختبرين", () => {
    const src = fs.readFileSync(
      path.resolve(process.cwd(), "app/(dashboard)/test-specialist/final-review/page.tsx"),
      "utf8"
    );
    // إسقاط على مستوى الخادم عبر وحدة الخصوصية (لا include لسجل الطالب الكامل)
    expect(src).toMatch(/select: SPECIALIST_FINAL_REVIEW_STUDENT_SELECT/);
    expect(src.includes("include:"), "صفحة الأخصائي تجلب سجل الطالب الكامل").toBe(false);
    expect(src).toMatch(/examDate: session\?\.examDate \?\? null/);
    expect(src).toMatch(/period: session\?\.period \?\? null/);
    expect(src).toMatch(/modelNumber: session\?\.model\?\.modelNumber \?\? null/);
    // تقييم كل مختبر (لا أول واحد فقط)
    expect(src).toMatch(/\(session\?\.assessments \?\? \[\]\)\.map\(/);
    expect(src).toMatch(/examinerName: a\.evaluator\.name/);
    // حالة الطالب المصدر = COMPLETED (إغلاق البوابة المزدوجة)
    expect(src).toMatch(/status: StudentStatus\.COMPLETED/);
    // يظهر درجات المختبرين (هذه صلاحية الأخصائي)
    expect(src).toMatch(/recitationScore: a\.recitationScore/);
    expect(src).toMatch(/tajweedScore: a\.tajweedScore/);
  });

  it("إسقاط الأخصائي لا يجلب بيانات ولي الأمر (تشغيل حقيقي على كائن الإسقاط)", () => {
    const select = projections.SPECIALIST_FINAL_REVIEW_STUDENT_SELECT as Record<string, unknown>;
    for (const field of projections.STUDENT_PII_FIELDS) {
      expect(Object.prototype.hasOwnProperty.call(select, field), `تسريب ${field}`).toBe(false);
    }
    // التقييم مسموح بتفاصيله (هذا المقصود من دور الأخصائي)
    const assessmentSelect = (
      select.examSessions as { select: { assessments: { select: Record<string, unknown> } } }
    ).select.assessments.select;
    expect(Object.keys(assessmentSelect)).toContain("recitationScore");
    expect(Object.keys(assessmentSelect)).toContain("tajweedScore");
    // النموذج والفترة والتاريخ موجودة في إسقاط الجلسة
    const sessionSelect = (select.examSessions as { select: Record<string, unknown> }).select;
    expect(Object.keys(sessionSelect)).toEqual(
      expect.arrayContaining(["examDate", "period", "model", "assessments"])
    );
  });

  it("الفترة تُعرض من القيمة المخزَنة بلا مقارنة بقيم إنجليزية", () => {
    const src = fs.readFileSync(
      path.resolve(process.cwd(), "components/specialist/final-review-table.tsx"),
      "utf8"
    );
    // PERIODS تُخزَّن بالعربية ("صباحي"/"مسائي") — المقارنة بـ"MORNING" كانت تُظهر دائماً "مسائي"
    expect(src.includes('"MORNING"'), "مقارنة فترة بقيمة إنجليزية قديمة").toBe(false);
    expect(src).toMatch(/الفترة: \$\{dialogStudent\.period\}/);
  });

  it("تعديل الدرجة اختياري (0-100) مع سجل تدقيق SPECIALIST_SCORE_OVERRIDE", async () => {
    const fx = await makeFixture(`m37a-approve-${Date.now()}`, "COMPLETED");
    try {
      const specialist = await asUser(E.specialist);
      // نقيس السجلات الجديدة فقط: سجلات SPECIALIST_SCORE_OVERRIDE من تشغيلات سابقة
      // كانت تُقرأ كلها فتُطلق خطأ "سُجّل override بلا تعديل" زائفاً.
      const baseline = (
        await prisma.auditLog.findMany({
          where: { userId: specialist.id },
          select: { id: true },
        })
      ).map((a) => a.id);
      // بلا تعديل
      await asUser(E.specialist);
      const r = await adminActions.specialistFinalApprove(fx.studentId);
      expect(r.success).toBe(true);
      expect(r.status).toBe("NOTIFIED");

      const after = await prisma.student.findUniqueOrThrow({
        where: { id: fx.studentId },
        select: { status: true },
      });
      expect(after.status).toBe("NOTIFIED");

      const scores = await prisma.assessment.findMany({
        where: { examSessionId: fx.sessionId },
        select: { finalScore: true, status: true },
        orderBy: { finalScore: "desc" },
      });
      expect(scores.every((s) => s.status === "ACCEPTED")).toBe(true);
      expect(scores.map((s) => s.finalScore).sort()).toEqual([76, 80]);

      // لا سجل override بلا تعديل
      const noOverride = await prisma.auditLog.findMany({
        where: { userId: specialist.id, id: { notIn: baseline } },
        select: { details: true },
      });
      expect(
        noOverride.some((a) => detailsJson(a.details).step === "SPECIALIST_SCORE_OVERRIDE"),
        "سُجّل override بلا تعديل"
      ).toBe(false);
    } finally {
      await fx.cleanup();
    }
  }, 120_000);

  it("تعديل الدرجة = 85 يُحفظ على كلا التقييمين مع سجل تدقيق", async () => {
    const fx = await makeFixture(`m37a-override-${Date.now()}`, "COMPLETED");
    const specialist = await asUser(E.specialist);
    const baseline = (
      await prisma.auditLog.findMany({
        where: { userId: specialist.id },
        select: { id: true },
      })
    ).map((a) => a.id);
    try {
      const r = await adminActions.specialistFinalApprove(fx.studentId, 85);
      expect(r.success).toBe(true);

      const scores = await prisma.assessment.findMany({
        where: { examSessionId: fx.sessionId },
        select: { finalScore: true },
      });
      expect(scores).toHaveLength(2);
      expect(scores.every((s) => s.finalScore === 85), "الدرجة المعدّلة لم تُطبَّق").toBe(true);

      const logs = await prisma.auditLog.findMany({
        where: { userId: specialist.id, id: { notIn: baseline } },
        select: { action: true, details: true },
      });
      const overrideLog = logs.find((l) => detailsJson(l.details).step === "SPECIALIST_SCORE_OVERRIDE");
      expect(overrideLog, "لا يوجد سجل SPECIALIST_SCORE_OVERRIDE").toBeTruthy();
      const details = detailsJson(overrideLog!.details);
      expect(details.newScore, "الدرجة الجديدة غير مسجّلة").toBe(85);
      // الدرجة السابقة محفوظة في الأثر
      const previous = details.previousScores as { score: number }[];
      expect(Array.isArray(previous)).toBe(true);
      expect(previous.map((p) => p.score).sort((a, b) => a - b)).toEqual([76, 80]);
    } finally {
      await prisma.auditLog.deleteMany({ where: { userId: specialist.id, id: { notIn: baseline } } });
      await fx.cleanup();
    }
  }, 120_000);

  it("الدرجة المعدّلة خارج 0-100 تُرفض", async () => {
    for (const bad of [-1, 101, 1000, Number.NaN]) {
      const fx = await makeFixture(`m37a-bad-${Date.now()}-${bad}`, "COMPLETED");
      try {
        await asUser(E.specialist);
        await expect(
          adminActions.specialistFinalApprove(fx.studentId, bad)
        ).rejects.toThrow();
        const after = await prisma.student.findUniqueOrThrow({
          where: { id: fx.studentId },
          select: { status: true },
        });
        expect(after.status, `قُبلت درجة ${bad}`).toBe("COMPLETED");
      } finally {
        await fx.cleanup();
      }
    }
  }, 180_000);
});

// ------------------------------------------------------------
// (ب) إسقاط رئيس الشؤون
// ------------------------------------------------------------
describe("M37/B — إسقاط رئيس الشؤون على مستوى الخادم", () => {
  it("صفحة اللوحة تقرأ عبر إسقاط محدود بلا include", () => {
    const src = fs.readFileSync(
      path.resolve(process.cwd(), "app/(dashboard)/head-of-affairs/page.tsx"),
      "utf8"
    );
    expect(src).toMatch(/select: HEAD_APPROVAL_TABLE_STUDENT_SELECT/);
    expect(src.includes("include:"), "صفحة اللوحة تجلب سجل الطالب الكامل").toBe(false);
    // التحقق من الحقول يتم على كائن الإسقاط (تشغيل حقيقي) لا على نص الملف
  });

  it("إسقاط اللوحة لا يجلب بيانات ولي الأمر ويحصر التقييم في finalScore", () => {
    const select = projections.HEAD_APPROVAL_TABLE_STUDENT_SELECT as Record<string, unknown>;
    for (const field of projections.STUDENT_PII_FIELDS) {
      expect(Object.prototype.hasOwnProperty.call(select, field), `تسريب ${field}`).toBe(false);
    }
    // كل مفتاح ضمن قائمة المسموح في إسقاط مراجعة رئيس الشؤون
    for (const key of Object.keys(select)) {
      expect(
        projections.HEAD_REVIEW_ALLOWED_FIELDS.includes(key as never),
        `حقل غير متوقع: ${key}`
      ).toBe(true);
    }
    const assessmentSelect = (
      select.examSessions as { select: { assessments: { select: Record<string, unknown> } } }
    ).select.assessments.select;
    expect(Object.keys(assessmentSelect)).toEqual(["finalScore"]);
  });

  it("الإجراء نفسه مُقيَّد بـ select ولا include", () => {
    const src = fs.readFileSync(
      path.resolve(process.cwd(), "lib/actions/head-actions.ts"),
      "utf8"
    );
    const action = src.slice(
      src.indexOf("export async function getStudentsForHeadReview"),
      src.indexOf("export async function getStudentsRejectedByHead")
    );
    expect(action).toMatch(/select: HEAD_REVIEW_STUDENT_SELECT/);
    expect(action.includes("include:"), "getStudentsForHeadReview يستخدم include").toBe(false);
  });

  it("الإسقاط لا يسرّب بيانات ولي الأمر ولا تفاصيل التقييم (تشغيل حقيقي)", async () => {
    const fx = await makeFixture(`m37b-${Date.now()}`, "NOTIFIED");
    try {
      // املأ التفاصيل الحساسة داخل الجلسة والتقييم
      await prisma.assessment.updateMany({
        where: { examSessionId: fx.sessionId },
        data: { recitationScore: 19, tajweedScore: 9, wordErrors: 4, tajweedErrors: 2 },
      });
      await prisma.student.update({
        where: { id: fx.studentId },
        data: { parentPhone: "0557777777", address: "عنوان-سري", applicationFileUrl: "https://f/s.pdf" },
      });

      await asUser(E.head);
      const out = await headActions.getStudentsForHeadReview();
      const row = out.students.find((s) => s.id === fx.studentId);
      expect(row, "الطالب NOTIFIED لم يظهر").toBeTruthy();

      // الشكل المُعاد: مفاتيح مسموحة فقط
      for (const key of Object.keys(row as Record<string, unknown>)) {
        expect(
          projections.HEAD_REVIEW_ALLOWED_FIELDS.includes(key as never),
          `حقل غير متوقع: ${key}`
        ).toBe(true);
      }
      // لا حقول ممنوعة على مستوى المسار
      for (const field of projections.HEAD_REVIEW_FORBIDDEN_FIELDS) {
        expect(Object.prototype.hasOwnProperty.call(row, field), `تسريب ${field}`).toBe(false);
      }
      // القيم الحساسة غير موجودة في التمثيل
      const serialized = JSON.stringify(row);
      for (const secret of [
        "0557777777",
        "عنوان-سري",
        "https://f/s.pdf",
        "أ.م37",
      ]) {
        expect(serialized.includes(secret), `تسرّب ${secret}`).toBe(false);
      }
      // Degree المسموح: finalScore فقط
      expect(serialized).toContain("finalScore");
    } finally {
      await fx.cleanup();
    }
  }, 120_000);

  it("قائمة المرفوضين تعرض السبب والمُصدِر فقط", () => {
    const src = fs.readFileSync(
      path.resolve(process.cwd(), "lib/actions/head-actions.ts"),
      "utf8"
    );
    const fn = src.slice(
      src.indexOf("export async function getStudentsRejectedByHead"),
      src.indexOf("export async function rejectStudentByHead")
    );
    expect(fn).toMatch(/status: StudentStatus\.REJECTED_BY_HEAD/);
    expect(fn).toMatch(/rejectedBy: \{ select: \{ id: true, name: true \} \}/);
    for (const field of ["recitationScore", "tajweedScore", "wordErrors", "parentPhone"]) {
      expect(fn.includes(field), `تسريب ${field} في قائمة المرفوضين`).toBe(false);
    }
  });
});

// ------------------------------------------------------------
// (ج) اعتماد/تعديل/رفض رئيس الشؤون
// ------------------------------------------------------------
describe("M37/C — اعتماد وتعديل ورفض رئيس الشؤون", () => {
  it("اعتماد بلا تعديل => READY_FOR_CERTIFICATE + finalizedAt", async () => {
    const fx = await makeFixture(`m37c-approve-${Date.now()}`, "NOTIFIED");
    try {
      await asUser(E.head);
      const r = await adminActions.headOfAffairsFinalApprove(fx.studentId);
      expect(r.success).toBe(true);
      expect(r.status).toBe("READY_FOR_CERTIFICATE");

      const after = await prisma.student.findUniqueOrThrow({
        where: { id: fx.studentId },
        select: { status: true, finalizedAt: true },
      });
      expect(after.status).toBe("READY_FOR_CERTIFICATE");
      expect(after.finalizedAt, "finalizedAt لم يُضبط").not.toBeNull();

      const assessments = await prisma.assessment.findMany({
        where: { examSessionId: fx.sessionId },
        select: { status: true, finalScore: true },
      });
      expect(assessments.every((a) => a.status === "NOTIFIED")).toBe(true);
      expect(assessments.map((a) => a.finalScore).sort()).toEqual([76, 80]);
    } finally {
      await fx.cleanup();
    }
  }, 120_000);

  it("اعتماد بتعديل 85 => finalScore=85 + سجل HEAD_OFFICIAL_SCORE_OVERRIDE", async () => {
    const fx = await makeFixture(`m37c-override-${Date.now()}`, "NOTIFIED");
    const head = await asUser(E.head);
    const baseline = (
      await prisma.auditLog.findMany({ where: { userId: head.id }, select: { id: true } })
    ).map((a) => a.id);
    try {
      const r = await adminActions.headOfAffairsFinalApprove(fx.studentId, 85);
      expect(r.success).toBe(true);

      const scores = await prisma.assessment.findMany({
        where: { examSessionId: fx.sessionId },
        select: { finalScore: true },
      });
      expect(scores.every((s) => s.finalScore === 85), "الدرجة الرسمية لم تُطبَّق").toBe(true);

      const logs = await prisma.auditLog.findMany({
        where: { userId: head.id, id: { notIn: baseline } },
        select: { details: true },
      });
      const overrideLog = logs.find((l) => detailsJson(l.details).step === "HEAD_OFFICIAL_SCORE_OVERRIDE");
      expect(overrideLog, "لا يوجد سجل HEAD_OFFICIAL_SCORE_OVERRIDE").toBeTruthy();
      const details = detailsJson(overrideLog!.details);
      expect(details.newScore, "الدرجة الرسمية الجديدة غير مسجّلة").toBe(85);
      const previous = details.previousScores as { score: number }[];
      expect(previous.map((p) => p.score).sort((a, b) => a - b)).toEqual([76, 80]);
    } finally {
      await prisma.auditLog.deleteMany({ where: { userId: head.id, id: { notIn: baseline } } });
      await fx.cleanup();
    }
  }, 120_000);

  it("اعتماد بدرجة خارج 0-100 يُرفض والطالب لا ينتقل", async () => {
    for (const bad of [-5, 150]) {
      const fx = await makeFixture(`m37c-bad-${Date.now()}-${bad}`, "NOTIFIED");
      try {
        await asUser(E.head);
        await expect(
          adminActions.headOfAffairsFinalApprove(fx.studentId, bad)
        ).rejects.toThrow();
        const after = await prisma.student.findUniqueOrThrow({
          where: { id: fx.studentId },
          select: { status: true, finalizedAt: true },
        });
        expect(after.status, `قُبلت درجة ${bad}`).toBe("NOTIFIED");
        expect(after.finalizedAt).toBeNull();
      } finally {
        await fx.cleanup();
      }
    }
  }, 180_000);

  it("رفض بلا سبب (undefined / فارغ / مسافات) => FAIL ولا تغيير", async () => {
    for (const reason of [undefined, "", "   \n\t "]) {
      const fx = await makeFixture(`m37c-noreason-${Date.now()}`, "NOTIFIED");
      try {
        await asUser(E.head);
        await expect(
          headActions.rejectStudentByHead(fx.studentId, reason)
        ).rejects.toThrow(/سبب الرفض إلزامي/);

        const after = await prisma.student.findUniqueOrThrow({
          where: { id: fx.studentId },
          select: { status: true, rejectionReason: true, rejectedById: true, rejectedAt: true },
        });
        expect(after.status, `قُبل الرفض بسبب «${reason}»`).toBe("NOTIFIED");
        expect(after.rejectionReason).toBeNull();
        expect(after.rejectedById).toBeNull();
        expect(after.rejectedAt).toBeNull();
      } finally {
        await fx.cleanup();
      }
    }
  }, 180_000);

  it("رفض بسبب صالح => REJECTED_BY_HEAD + السبب محفوظ + التقييمات معكوسة", async () => {
    const fx = await makeFixture(`m37c-reject-${Date.now()}`, "NOTIFIED");
    const head = await asUser(E.head);
    const baseline = (
      await prisma.auditLog.findMany({ where: { userId: head.id }, select: { id: true } })
    ).map((a) => a.id);
    try {
      const reason = "  درجة التلاوة غير مستندَ إلى دليل-cheap  ";
      const r = await headActions.rejectStudentByHead(fx.studentId, reason);
      expect(r).toBeTruthy();

      const after = await prisma.student.findUniqueOrThrow({
        where: { id: fx.studentId },
        select: {
          status: true,
          rejectionReason: true,
          rejectedById: true,
          rejectedAt: true,
        },
      });
      expect(after.status).toBe("REJECTED_BY_HEAD");
      expect(after.rejectionReason, "السبب لم يُحفظ كما هو (مقصوص/منقَّى)").toBe(
        reason.replace(/\s+/g, " ").trim()
      );
      expect(after.rejectedById).toBe(head.id);
      expect(after.rejectedAt).not.toBeNull();

      // سلسلة التقييم انعكست
      const assessments = await prisma.assessment.findMany({
        where: { examSessionId: fx.sessionId },
        select: { status: true },
      });
      expect(assessments.every((a) => a.status === "REJECTED_BY_HEAD")).toBe(true);

      // سجل التدقيق
      const logs = await prisma.auditLog.findMany({
        where: { userId: head.id, id: { notIn: baseline } },
        select: { action: true, details: true },
      });
      const rejectLog = logs.find((l) => detailsJson(l.details).step === "HEAD_OF_AFFAIRS_REJECT");
      expect(rejectLog, "لا يوجد سجل رفض").toBeTruthy();
      expect(rejectLog!.action).toBe("REJECT");

      // السبب يظهر في قائمة المرفوضين
      await asUser(E.head);
      const rejectedList = await headActions.getStudentsRejectedByHead();
      const row = rejectedList.find((s) => s.id === fx.studentId);
      expect(row, "الطالب ليس في قائمة المرفوضين").toBeTruthy();
      expect(row!.rejectionReason).toBe(after.rejectionReason);
      expect(row!.rejectedBy).toBeTruthy();
    } finally {
      await prisma.auditLog.deleteMany({ where: { userId: head.id, id: { notIn: baseline } } });
      await fx.cleanup();
    }
  }, 120_000);

  it("سبب أطول من 500 حرف يُرفض", async () => {
    const fx = await makeFixture(`m37c-longreason-${Date.now()}`, "NOTIFIED");
    try {
      await asUser(E.head);
      await expect(
        headActions.rejectStudentByHead(fx.studentId, "ا".repeat(501))
      ).rejects.toThrow();
      const after = await prisma.student.findUniqueOrThrow({
        where: { id: fx.studentId },
        select: { status: true },
      });
      expect(after.status).toBe("NOTIFIED");
    } finally {
      await fx.cleanup();
    }
  }, 120_000);

  it("اعتماد/رفض من غير رئيس الشؤون مرفوض", async () => {
    const fx = await makeFixture(`m37c-role-${Date.now()}`, "NOTIFIED");
    try {
      await asUser(E.specialist);
      await expect(adminActions.headOfAffairsFinalApprove(fx.studentId)).rejects.toThrow();
      await expect(headActions.rejectStudentByHead(fx.studentId, "سبب")).rejects.toThrow();

      await asUser(E.examiner1);
      await expect(adminActions.headOfAffairsFinalApprove(fx.studentId)).rejects.toThrow();
      await expect(headActions.rejectStudentByHead(fx.studentId, "سبب")).rejects.toThrow();

      const after = await prisma.student.findUniqueOrThrow({
        where: { id: fx.studentId },
        select: { status: true, finalizedAt: true },
      });
      expect(after.status).toBe("NOTIFIED");
      expect(after.finalizedAt).toBeNull();
    } finally {
      await fx.cleanup();
    }
  }, 120_000);
});
