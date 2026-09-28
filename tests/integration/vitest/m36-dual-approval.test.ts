import { describe, it, expect, beforeAll, afterAll, vi } from "vitest";
import { config as loadEnv } from "dotenv";
import fs from "node:fs";
import path from "node:path";

loadEnv({ path: ".env" });

// ============================================================
// M36 — بوابة الاعتماد المزدوج (CRITICAL)
// ------------------------------------------------------------
// إثبات أن انتقال الطالب إلى COMPLETED لا يحدث إلا باعتماد
// المختبرين معاً، وأن إشعار الأخصائي مرهون بالانتقال نفسه.
//
// كل البيانات تُنشأ داخل الاختبار (tenant 50436) وتُحذف في finally
// حتى لا يبقى أثر على خط الأساس.
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
let assessmentActions: typeof import("@/lib/actions/assessment-actions");

const OWN = "50436";

const E = {
  specialist: "fx50436-specialist@e2e.exp.local",
  examiner1: "fx50436-examiner1@e2e.exp.local",
  examiner2: "fx50436-examiner2@e2e.exp.local",
};

type Snapshot = {
  studentStatus: string;
  assessments: Array<{ evaluatorId: string; status: string }>;
  specialistNotifications: number;
};

let tenantId: string;
let institutionId: string;
let seasonId: string;
let modelId: string;
let examiner1Id: string;
let examiner2Id: string;
let specialistIds: string[];

async function asUser(email: string) {
  const user = await prisma.user.findUniqueOrThrow({
    where: { email },
    select: { id: true },
  });
  session.userId = user.id;
  return user;
}

beforeAll(async () => {
  ({ prisma } = await import("@/lib/prisma"));
  assessmentActions = await import("@/lib/actions/assessment-actions");

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
  // (m35/F يأخذ #1، m37 يأخذ #3) حتى لا تتعارض الجلسات عند التشغيل المتوازي
  modelId = (
    await prisma.questionBankModel.findFirstOrThrow({
      where: { tenantId, branch: "5" },
      orderBy: { modelNumber: "asc" },
      skip: 1,
      select: { id: true },
    })
  ).id;
  examiner1Id = (
    await prisma.user.findUniqueOrThrow({ where: { email: E.examiner1 }, select: { id: true } })
  ).id;
  examiner2Id = (
    await prisma.user.findUniqueOrThrow({ where: { email: E.examiner2 }, select: { id: true } })
  ).id;
  specialistIds = (
    await prisma.user.findMany({ where: { tenantId, role: "TEST_SPECIALIST" }, select: { id: true } })
  ).map((s) => s.id);
  expect(specialistIds.length, "لا يوجد أخصائي في 50436").toBeGreaterThan(0);
  expect(examiner1Id).not.toBe(examiner2Id);
}, 120_000);

afterAll(async () => {
  await prisma?.$disconnect();
});

/** لقطة كاملة للحالة قبل/بعد كل خطوة */
async function snapshot(studentId: string, sessionId: string): Promise<Snapshot> {
  const student = await prisma.student.findUniqueOrThrow({
    where: { id: studentId },
    select: { status: true },
  });
  const assessments = await prisma.assessment.findMany({
    where: { examSessionId: sessionId },
    select: { evaluatorId: true, status: true },
    orderBy: { evaluatorId: "asc" },
  });
  const specialistNotifications = await prisma.notification.count({
    where: { userId: { in: specialistIds }, examSessionId: sessionId },
  });
  return { studentStatus: student.status, assessments, specialistNotifications };
}

function statusOf(snap: Snapshot, evaluatorId: string): string {
  const row = snap.assessments.find((a) => a.evaluatorId === evaluatorId);
  if (!row) throw new Error(`لا يوجد تقييم للمختبر ${evaluatorId}`);
  return row.status;
}

const VALID = {
  wordErrors: 1,
  letterErrors: 1,
  diacriticErrors: 0,
  seriousErrors: 0,
  subtleErrors: 1,
  promptingCount: 0,
  doubtCount: 0,
  tajweedErrors: 0,
  recitationScore: 18,
  tajweedScore: 9,
};

type Fixture = {
  studentId: string;
  sessionId: string;
  /** معرّفات سجلات التدقيق قبل الاختبار — الفرق منها هو سجلاتنا */
  auditBaseline: string[];
  cleanup: () => Promise<void>;
};

/** ينشئ طالباً + جلسة + (اختيارياً) تقييمات مسودة، مع تنظيف مضمون */
async function makeFixture(opts: {
  name: string;
  period: string;
  draftsFor: Array<"examiner1" | "examiner2">;
}): Promise<Fixture> {
  const examIds = {
    examiner1: examiner1Id,
    examiner2: examiner2Id,
  };
  const auditBaseline = (
    await prisma.auditLog.findMany({
      where: { userId: { in: [examiner1Id, examiner2Id] } },
      select: { id: true },
    })
  ).map((a) => a.id);

  const student = await prisma.student.create({
    data: {
      name: opts.name,
      age: 13,
      branch: "5",
      teacherName: "أ.م36",
      parentPhone: "0550000000",
      status: "ASSIGNED",
      institutionId,
      tenantId,
    },
    select: { id: true },
  });
  const examSession = await prisma.examSession.create({
    data: {
      studentId: student.id,
      teacher1Id: examiner1Id,
      teacher2Id: examiner2Id,
      examDate: new Date(),
      period: opts.period,
      status: "SCHEDULED",
      seasonId,
      modelId,
      tenantId,
    },
    select: { id: true },
  });
  if (opts.draftsFor.length > 0) {
    await prisma.assessment.createMany({
      data: opts.draftsFor.map((who) => ({
        examSessionId: examSession.id,
        evaluatorId: examIds[who],
        modelId,
        status: "DRAFT",
        tenantId,
      })),
    });
  }

  return {
    studentId: student.id,
    sessionId: examSession.id,
    auditBaseline,
    cleanup: async () => {
      await prisma.notification.deleteMany({ where: { examSessionId: examSession.id } });
      await prisma.assessment.deleteMany({ where: { examSessionId: examSession.id } });
      await prisma.examSession.deleteMany({ where: { id: examSession.id } });
      await prisma.auditLog.deleteMany({
        where: { userId: { in: [examiner1Id, examiner2Id] }, id: { notIn: auditBaseline } },
      });
      await prisma.student.deleteMany({ where: { id: student.id } });
    },
  };
}

describe("M36 — بوابة الاعتماد المزدوج", () => {
  it("السيناريو الإلزامي: اعتماد مختبر واحد لا ينقل الطالب، والاعتمادان ينقلان", async () => {
    const fx = await makeFixture({
      name: `m36-${Date.now()}`,
      period: "صباحي",
      draftsFor: ["examiner1", "examiner2"],
    });

    try {
      // ---------- before ----------
      const before = await snapshot(fx.studentId, fx.sessionId);
      expect(before.studentStatus).toBe("ASSIGNED");
      expect(before.assessments).toHaveLength(2);
      expect(before.assessments.every((a) => a.status === "DRAFT")).toBe(true);
      expect(before.specialistNotifications).toBe(0);

      // ---------- Step 1: المختبر الأول ----------
      await asUser(E.examiner1);
      const r1 = await assessmentActions.approveAssessment(fx.sessionId);
      expect(r1.success).toBe(true);
      expect(r1.allApproved, "allApproved=true بعد اعتماد مختبر واحد").toBe(false);

      const after1 = await snapshot(fx.studentId, fx.sessionId);
      expect(statusOf(after1, examiner1Id), "تقييم المختبر الأول لم يُعتمد").toBe("APPROVED");
      expect(statusOf(after1, examiner2Id), "تقييم المختبر الثاني تغيّر دون اعتماده").toBe("DRAFT");
      expect(after1.studentStatus, "الطالب انتقل قبل اكتمال الاعتمادين").toBe("ASSIGNED");
      expect(after1.specialistNotifications, "أُرسل إشعار للأخصائي قبل اكتمال البوابة").toBe(0);

      // المختبر الثاني ما زال قادراً على الحفظ (لم تُقفل بوابته)
      await asUser(E.examiner2);
      const saved2 = await assessmentActions.saveAssessment({
        examSessionId: fx.sessionId,
        ...VALID,
        wordErrors: 2,
        letterErrors: 2,
      });
      expect(saved2.success, "المختبر الثاني لم يعد قادراً على الحفظ").toBe(true);
      const stillAssigned = await prisma.student.findUniqueOrThrow({
        where: { id: fx.studentId },
        select: { status: true },
      });
      expect(stillAssigned.status, "الحفظ غيّر حالة الطالب").toBe("ASSIGNED");

      // ---------- Step 2: المختبر الثاني ----------
      const r2 = await assessmentActions.approveAssessment(fx.sessionId);
      expect(r2.success).toBe(true);
      expect(r2.allApproved, "allApproved=false بعد اعتماد المختبرين معاً").toBe(true);

      const after2 = await snapshot(fx.studentId, fx.sessionId);
      expect(statusOf(after2, examiner1Id)).toBe("APPROVED");
      expect(statusOf(after2, examiner2Id), "تقييم المختبر الثاني لم يُعتمد").toBe("APPROVED");
      expect(after2.studentStatus, "الطالب لم ينتقل إلى COMPLETED").toBe("COMPLETED");
      expect(
        after2.specialistNotifications,
        "عدد إشعارات الأخصائي بعد اكتمال الاعتمادين"
      ).toBe(specialistIds.length);

      // الاعتماد النهائي من صلاحية رئيس الشؤون لا من المختبرين
      const row = await prisma.student.findUniqueOrThrow({
        where: { id: fx.studentId },
        select: { finalizedAt: true },
      });
      expect(row.finalizedAt, "اعتُتمد نهائياً من المختبرين").toBeNull();
    } finally {
      await fx.cleanup();
    }
  }, 120_000);

  it("اعتماد مختبر واحد فقط بلا نظير: لا انتقال ولا إشعار", async () => {
    const fx = await makeFixture({
      name: `m36-solo-${Date.now()}`,
      period: "مسائي",
      draftsFor: ["examiner1"],
    });

    try {
      await asUser(E.examiner1);
      const r = await assessmentActions.approveAssessment(fx.sessionId);
      expect(r.success).toBe(true);
      expect(r.allApproved, "اعتماد واحد أغلق البوابة").toBe(false);

      const after = await snapshot(fx.studentId, fx.sessionId);
      expect(after.studentStatus).toBe("ASSIGNED");
      expect(after.specialistNotifications).toBe(0);
      expect(after.assessments).toHaveLength(1);
    } finally {
      await fx.cleanup();
    }
  }, 120_000);

  it("لا اعتماد بلا مسودة: المختبر الذي لا يملك تقييماً يُرفض", async () => {
    const fx = await makeFixture({
      name: `m36-noDraft-${Date.now()}`,
      period: "صباحي",
      draftsFor: [],
    });

    try {
      // لا يوجد أي assessment — الاعتماد قبل الحفظ يُرفض
      await asUser(E.examiner1);
      await expect(assessmentActions.approveAssessment(fx.sessionId)).rejects.toThrow();

      await asUser(E.examiner2);
      const saved = await assessmentActions.saveAssessment({
        examSessionId: fx.sessionId,
        ...VALID,
      });
      expect(saved.success).toBe(true);

      // المختبر الأول يحفظ ثم يعتمد وحده
      await asUser(E.examiner1);
      const saved1 = await assessmentActions.saveAssessment({
        examSessionId: fx.sessionId,
        ...VALID,
        wordErrors: 3,
      });
      expect(saved1.success).toBe(true);
      const r = await assessmentActions.approveAssessment(fx.sessionId);
      expect(r.allApproved).toBe(false);

      const after = await snapshot(fx.studentId, fx.sessionId);
      expect(after.studentStatus).toBe("ASSIGNED");
      expect(after.specialistNotifications).toBe(0);
    } finally {
      await fx.cleanup();
    }
  }, 120_000);

  it("لا يُعاد الاعتماد مرتين ولا تتكرر الإشعارات", async () => {
    const fx = await makeFixture({
      name: `m36-twice-${Date.now()}`,
      period: "صباحي",
      draftsFor: ["examiner1", "examiner2"],
    });

    try {
      for (const email of [E.examiner1, E.examiner2]) {
        await asUser(email);
        const saved = await assessmentActions.saveAssessment({
          examSessionId: fx.sessionId,
          ...VALID,
        });
        expect(saved.success).toBe(true);
        const r = await assessmentActions.approveAssessment(fx.sessionId);
        expect(r.success).toBe(true);
      }

      const after = await snapshot(fx.studentId, fx.sessionId);
      expect(after.studentStatus).toBe("COMPLETED");
      const baselineNotifications = after.specialistNotifications;
      expect(baselineNotifications).toBe(specialistIds.length);

      // محاولة ثالثة (المختبر الأول يكرّر اعتماده)
      await asUser(E.examiner1);
      await expect(assessmentActions.approveAssessment(fx.sessionId)).rejects.toThrow();

      const afterRetry = await snapshot(fx.studentId, fx.sessionId);
      expect(afterRetry.specialistNotifications, "تكرّر الاعتماد أنشأ إشعاراً ثانياً").toBe(
        baselineNotifications
      );
      expect(afterRetry.studentStatus).toBe("COMPLETED");
    } finally {
      await fx.cleanup();
    }
  }, 120_000);
});

describe("M36 — البوابة مثبتة في المصدر (ساكن)", () => {
  const src = fs.readFileSync(
    path.resolve(process.cwd(), "lib/actions/assessment-actions.ts"),
    "utf8"
  );
  const block = src.slice(
    src.indexOf("export async function approveAssessment"),
    src.indexOf("export async function getAssessmentState")
  );

  it("المطلوب = مختبرا الجلسة كليهما", () => {
    expect(block).toMatch(
      /const requiredEvaluators = new Set\(\[session\.teacher1Id, session\.teacher2Id\]\)/
    );
  });

  it("allApproved = كل المبدّلين اعتمدوا (every/has)", () => {
    expect(block).toMatch(
      /allApproved = \[\.\.\.requiredEvaluators\]\.every\(\(id\) => approvedSet\.has\(id\)\)/
    );
  });

  it("انتقال الطالب وإشعار الأخصائي داخل if (allApproved) فقط", () => {
    const idx = block.indexOf("if (allApproved) {");
    expect(idx, "لا يوجد فرع allApproved").toBeGreaterThan(-1);
    const fromBranch = block.slice(idx);
    expect(fromBranch.indexOf("status: StudentStatus.COMPLETED")).toBeGreaterThan(-1);
    expect(fromBranch.indexOf("role: Role.TEST_SPECIALIST")).toBeGreaterThan(-1);

    // الفرع البديل = إشعار المختبر المنتظر فقط، بلا انتقال للطالب
    const elseIdx = block.indexOf("} else {");
    expect(elseIdx, "لا يوجد فرع else").toBeGreaterThan(-1);
    const elseBlock = block.slice(elseIdx, block.indexOf("await tx.auditLog.create"));
    expect(elseBlock.includes("StudentStatus"), "الفرع البديل ينقل حالة الطالب").toBe(false);
  });
});
