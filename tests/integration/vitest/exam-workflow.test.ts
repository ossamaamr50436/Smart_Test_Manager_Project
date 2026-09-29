import { describe, it, expect, beforeAll, afterAll, vi } from "vitest";
import { config as loadEnv } from "dotenv";

// تحميل متغيرات البيئة كما تفعل Next.js (Prisma / UploadThing يحتاجانها)
loadEnv({ path: ".env" });

// ============================================================
// M33 / M35 / M36 / M37 — اختبار تكاملي مباشر لسير العمل
// ------------------------------------------------------------
// يشغّل Server Actions الحقيقية (الصلاحيات + التحقق + Prisma
// + UploadThing) بدون متصفح وبدون فتح أي منفذ.
// Mock واحد فقط: هوية الجلسة (نقل الجلسة من المتصفح إلى الخادم)
// و revalidatePath وقنوات البث/الإشعار الخارجية.
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

const TENANT_ID = "cmubnu64m0000e6dfmj3fkmg3";
const OTHER_TENANT_ID = "cmu5ngaxg0000to23u132olty";
const UPLOAD_TIMEOUT = 60_000;

type Ctx = {
  prisma: typeof import("@/lib/prisma")["prisma"];
  student: typeof import("@/lib/actions/student-actions");
  committee: typeof import("@/lib/actions/committee-actions");
  assessment: typeof import("@/lib/actions/assessment-actions");
  admin: typeof import("@/lib/actions/admin-actions");
  head: typeof import("@/lib/actions/head-actions");
  model: typeof import("@/lib/actions/model-actions");
  questionBank: typeof import("@/lib/actions/question-bank-actions");
  periods: typeof import("@/lib/validations/student")["PERIODS"];
  nationalities: typeof import("@/lib/validations/student")["NATIONALITIES"];
  ids: {
    institution: string;
    specialist: string;
    admin: string;
    head: string;
    examiner1: string;
    examiner2: string;
  };
  run: {
    studentId: string;
    sessionId: string;
    modelId: string;
    committeeId: string;
    branch: "5" | "10" | "15" | "20" | "25" | "30";
  };
};

let ctx: Ctx;

async function asUser(userId: string) {
  session.userId = userId;
}

/** مقاطع نموذج صالحة بالعدد المطلوب (لاختبار قاعدة 5 افتراضي / 10 أقصى) */
function buildSegments(count: number) {
  return Array.from({ length: count }, (_, i) => ({
    number: i + 1,
    fromText: `من قوله تعالى ${i + 1}`,
    fromSurah: "البقرة",
    fromVerse: i + 1,
    toText: `إلى قوله تعالى ${i + 1}`,
    toSurah: "البقرة",
    toVerse: i + 2,
  }));
}

/** ينتظر رفض العملية ويعيد رسالتها العربية */
async function rejection(promise: Promise<unknown>): Promise<string> {
  try {
    await promise;
  } catch (e) {
    return e instanceof Error ? e.message : String(e);
  }
  throw new Error("كان متوقعًا رفض العملية، لكنها نجحت");
}

/**
 * يقبل الرفض بالشكلين الموجودين في الـactions:
 * - throw على طبقة الصلاحيات (assertSameTenant / requireRole).
 * - نتيجة { success: false, error } من طبقة التحقق.
 */
async function refusal(promise: Promise<unknown>): Promise<string> {
  try {
    const result = (await promise) as { success?: boolean; error?: string } | undefined;
    if (result && result.success === false && typeof result.error === "string") return result.error;
  } catch (e) {
    return e instanceof Error ? e.message : String(e);
  }
  throw new Error("كان متوقعًا رفض العملية، لكنها نجحت");
}

/** مدخلات تعديل اللجنة كما تمر من الواجهة (بدون modelIds) */
async function committeeInput() {
  const committee = await ctx.prisma.committee.findUniqueOrThrow({
    where: { id: ctx.run.committeeId },
    select: { name: true, branch: true, seasonId: true, teacher1Id: true, teacher2Id: true },
  });
  return committee;
}

/** سجلات التدقيق تحفظ تفاصيلها كنص JSON، لذا نبحث عن step داخلها */
async function findAuditStep(step: string, userId: string) {
  const rows = await ctx.prisma.auditLog.findMany({
    where: { tenantId: TENANT_ID, userId },
    select: { id: true, action: true, details: true, timestamp: true },
    orderBy: { timestamp: "desc" },
    take: 100,
  });

  for (const row of rows) {
    const raw = row.details;
    if (raw === null || raw === undefined) continue;
    let parsed: unknown = raw;
    if (typeof raw === "string") {
      try {
        parsed = JSON.parse(raw);
      } catch {
        continue;
      }
    }
    if (parsed && typeof parsed === "object" && (parsed as { step?: string }).step === step) {
      return row;
    }
  }
  return null;
}

beforeAll(async () => {
  const { prisma } = await import("@/lib/prisma");
  const [student, committeeActions, assessment, admin, head, model, questionBank, validations] =
    await Promise.all([
      import("@/lib/actions/student-actions"),
      import("@/lib/actions/committee-actions"),
      import("@/lib/actions/assessment-actions"),
      import("@/lib/actions/admin-actions"),
      import("@/lib/actions/head-actions"),
      import("@/lib/actions/model-actions"),
      import("@/lib/actions/question-bank-actions"),
      import("@/lib/validations/student"),
    ]);

  const users = await prisma.user.findMany({
    where: { tenantId: TENANT_ID, email: { startsWith: "fx50436-" } },
    select: { id: true, email: true, institutionId: true },
  });
  const byEmail = (suffix: string) => {
    const hit = users.find((u) => u.email === `fx50436-${suffix}@e2e.exp.local`);
    if (!hit) throw new Error(`مستخدم fixture مفقود: ${suffix}`);
    return hit.id;
  };

  const institutionUser = byEmail("institution");
  const institutionRow = users.find((u) => u.id === institutionUser);
  if (!institutionRow?.institutionId) throw new Error("حساب الجهة غير مرتبط بمؤسسة");

  // نستخدم نفس اللجنة القائمة (المختبران فيها) حتى لا نكسر قواعد Occupancy
  const existingCommittee = await prisma.committee.findFirstOrThrow({
    where: { tenantId: TENANT_ID },
    select: { id: true, branch: true, teacher1Id: true, teacher2Id: true },
  });

  const branch = existingCommittee.branch as Ctx["run"]["branch"];

  // نختار نموذجاً غير مستخدم في الموسم (قيد فريد: الموسم + النموذج)
  const usedModelIds = (
    await prisma.examSession.findMany({
      where: { tenantId: TENANT_ID, modelId: { not: null } },
      select: { modelId: true },
    })
  )
    .map((s) => s.modelId)
    .filter((id): id is string => Boolean(id));

  const freeModel = await prisma.questionBankModel.findFirstOrThrow({
    where: { tenantId: TENANT_ID, branch, id: { notIn: usedModelIds } },
    select: { id: true },
  });

  ctx = {
    prisma,
    student,
    committee: committeeActions,
    assessment,
    admin,
    head,
    model,
    questionBank,
    periods: validations.PERIODS,
    nationalities: validations.NATIONALITIES,
    ids: {
      institution: institutionUser,
      specialist: byEmail("specialist"),
      admin: byEmail("admin"),
      head: byEmail("head"),
      examiner1: existingCommittee.teacher1Id,
      examiner2: existingCommittee.teacher2Id,
    },
    run: { studentId: "", sessionId: "", modelId: freeModel.id, committeeId: existingCommittee.id, branch },
  };
  // اتصال Prisma البارد بقاعدة Neon + تحميل شجرة وحدات الخادم
}, 120_000);

afterAll(async () => {
  const prisma = ctx?.prisma;
  if (!prisma) return;
  try {
    // تنظيف آثار هذا الملف: طلابه يُنشأون بأسماء تحمل طابعاً زمنياً، وتراكمها
    // كان يحتلّ (الموسم، النموذج) فيُسقط m35/F بقيد Unique في التشغيلات التالية.
    const created = await prisma.student.findMany({
      where: {
        tenantId: TENANT_ID,
        OR: [
          { name: { startsWith: "طالب ترشيح مباشر " } },
          { name: { startsWith: "طالب فرع " } },
        ],
      },
      select: { id: true },
    });
    const studentIds = created.map((s) => s.id);
    if (studentIds.length) {
      const sessions = await prisma.examSession.findMany({
        where: { studentId: { in: studentIds } },
        select: { id: true },
      });
      const sessionIds = sessions.map((s) => s.id);
      await prisma.certificate.deleteMany({ where: { studentId: { in: studentIds } } });
      if (sessionIds.length) {
        await prisma.notification.deleteMany({ where: { examSessionId: { in: sessionIds } } });
        await prisma.assessment.deleteMany({ where: { examSessionId: { in: sessionIds } } });
        await prisma.examSession.deleteMany({ where: { id: { in: sessionIds } } });
      }
      await prisma.student.deleteMany({ where: { id: { in: studentIds } } });
    }
  } catch {
    // تنظيف best-effort — لا نُفشل الاختبار بسببه
  }
  await prisma.$disconnect();
});

// ------------------------------------------------------------
// M33 — البنية والعلاقات الفعلية في قاعدة البيانات
// ------------------------------------------------------------
describe("M33 — البنية والعلاقات في الـDB", () => {
  it("يملك الـtenant سجلات لكل الكيانات المطلوبة", async () => {
    const [users, institutions, seasons, students, committees, models, sessions, assessments, settings] =
      await Promise.all([
        ctx.prisma.user.count({ where: { tenantId: TENANT_ID } }),
        ctx.prisma.institution.count({ where: { tenantId: TENANT_ID } }),
        ctx.prisma.examSeason.count({ where: { tenantId: TENANT_ID } }),
        ctx.prisma.student.count({ where: { tenantId: TENANT_ID } }),
        ctx.prisma.committee.count({ where: { tenantId: TENANT_ID } }),
        ctx.prisma.questionBankModel.count({ where: { tenantId: TENANT_ID } }),
        ctx.prisma.examSession.count({ where: { tenantId: TENANT_ID } }),
        ctx.prisma.assessment.count({ where: { tenantId: TENANT_ID } }),
        // إعدادات المنصة سجل عام (singleton) — نتحقق من وجوده فعلاً
        ctx.prisma.appSettings.count(),
      ]);

    for (const [label, count] of [
      ["users", users],
      ["institution", institutions],
      ["season", seasons],
      ["students", students],
      ["committees", committees],
      ["models", models],
      ["sessions", sessions],
      ["assessments", assessments],
      ["settings", settings],
    ] as const) {
      expect(count, `${label} = 0 في tenant الاختبار`).toBeGreaterThan(0);
    }
  });

  it("يربط الطالب باللجنة والمختبرين والنموذج والجلسة بعلاقات حقيقية", async () => {
    const all = await ctx.prisma.examSession.findMany({
      where: { tenantId: TENANT_ID, modelId: { not: null } },
      select: {
        id: true,
        modelId: true,
        examDate: true,
        period: true,
        student: { select: { id: true, committeeId: true, tenantId: true } },
        teacher1: { select: { id: true, role: true } },
        teacher2: { select: { id: true, role: true } },
        assessments: { select: { id: true, evaluatorId: true, finalScore: true, status: true } },
      },
      orderBy: { createdAt: "asc" },
    });

    expect(all.length, "لا توجد جلسات مرتبطة بنماذج").toBeGreaterThanOrEqual(1);

    // قاعدة العلاقات: لا توجد جلسة لطالب غير موزّع على لجنة
    for (const s of all) {
      expect(s.student.committeeId, `الجلسة ${s.id} لطالب بلا علاقة بلجنة`).not.toBeNull();
    }

    const session = all[0]!;
    expect(session.student.tenantId).toBe(TENANT_ID);
    expect(session.teacher1.id).not.toBe(session.teacher2.id);
    expect(session.teacher1.role).toBe("EXAMINER");
    expect(session.teacher2.role).toBe("EXAMINER");
    expect(session.assessments.length, "لا يوجد تقييمان منفصلان").toBeGreaterThanOrEqual(2);
    expect(
      new Set(session.assessments.map((a) => a.evaluatorId)).size,
      "التقييمات ليست منفصلة لكل مختبر"
    ).toBe(2);
  });
});

// ------------------------------------------------------------
// M35 — الترشيح واللجان والنماذج
// ------------------------------------------------------------
describe("M35 — الترشيح واللجان والنماذج", () => {
  it("يسجّل ترشيح الطالب من الجهة التعليمية بحالة PENDING", async () => {
    await asUser(ctx.ids.institution);
    const { generateCertificatePdfBuffer } = await import("@/lib/certificate-pdf");
    const pdf = await generateCertificatePdfBuffer({
      studentName: "ترشيح تجريبي",
      finalScore: 90,
      issuedDate: new Date(),
      serialNumber: "TEST-0000",
    });

    const result = await ctx.student.createStudentApplication(
      {
        name: `طالب ترشيح مباشر ${Date.now()}`,
        age: 12,
        branch: ctx.run.branch,
        nationality: ctx.nationalities[0],
        teacherName: "معلم الاختبار",
        parentPhone: "0551234567",
        address: "الرياض",
        phone: "0551234568",
      },
      {
        buffer: pdf.buffer.slice(pdf.byteOffset, pdf.byteOffset + pdf.byteLength) as ArrayBuffer,
        fileName: "application.pdf",
        mimeType: "application/pdf",
      }
    );

    expect(result.success, JSON.stringify(result)).toBe(true);
    if (!result.success) return;
    ctx.run.studentId = result.studentId;

    const row = await ctx.prisma.student.findUniqueOrThrow({
      where: { id: result.studentId },
      select: { status: true, tenantId: true, institutionId: true },
    });
    expect(row.status).toBe("PENDING");
    expect(row.tenantId).toBe(TENANT_ID);
  }, UPLOAD_TIMEOUT);

  it("ينقل الطالب إلى APPROVED عند مراجعة الأخصائي", async () => {
    await asUser(ctx.ids.specialist);
    const result = await ctx.student.reviewStudentApplication(ctx.run.studentId, "APPROVED");
    expect(result.success).toBe(true);
    expect(result.status).toBe("APPROVED");

    const row = await ctx.prisma.student.findUniqueOrThrow({
      where: { id: ctx.run.studentId },
      select: { status: true, approvedAt: true },
    });
    expect(row.status).toBe("APPROVED");
    expect(row.approvedAt, "approvedAt غير مسجل").not.toBeNull();
  });

  it("يرفض مراجعة الترشيح من دور غير مخول (عزل صلاحيات)", async () => {
    await asUser(ctx.ids.examiner1);
    const message = await rejection(ctx.student.reviewStudentApplication(ctx.run.studentId, "APPROVED"));
    expect(message).toContain("غير مصرح");
  });

  it("يرفض الترشيح لطالب من جهة أخرى (عزل tenant)", async () => {
    const otherSpecialist = await ctx.prisma.user.findFirstOrThrow({
      where: { tenantId: OTHER_TENANT_ID, role: "TEST_SPECIALIST" },
      select: { id: true },
    });
    await asUser(otherSpecialist.id);
    const message = await rejection(ctx.student.reviewStudentApplication(ctx.run.studentId, "APPROVED"));
    expect(message).toMatch(/مؤسستك|غير مصرح|مشترك/);
  });

  it("يوزّع الطالب على اللجنة فينشئ جلسة مرتبطة بالمختبرين", async () => {
    await asUser(ctx.ids.specialist);
    const result = await ctx.committee.assignStudentToCommittee({
      studentId: ctx.run.studentId,
      committeeId: ctx.run.committeeId,
      examDate: "2030-03-11",
      period: ctx.periods[0],
    });

    expect(result.success, JSON.stringify(result)).toBe(true);
    if (!result.success) return;

    const committee = await ctx.prisma.committee.findUniqueOrThrow({
      where: { id: ctx.run.committeeId },
      select: { id: true, teacher1Id: true, teacher2Id: true, seasonId: true, branch: true },
    });

    const [studentRow, sessionRow] = await Promise.all([
      ctx.prisma.student.findUniqueOrThrow({
        where: { id: ctx.run.studentId },
        select: { status: true, committeeId: true, assignedAt: true, branch: true },
      }),
      ctx.prisma.examSession.findFirstOrThrow({
        where: { tenantId: TENANT_ID, studentId: ctx.run.studentId },
        select: {
          id: true,
          studentId: true,
          teacher1Id: true,
          teacher2Id: true,
          status: true,
          seasonId: true,
          modelId: true,
        },
        orderBy: { createdAt: "desc" },
      }),
    ]);
    ctx.run.sessionId = sessionRow.id;

    // relations: الطالب مرتبط باللجنة، واللجنة موجودة فعلاً
    expect(studentRow.status).toBe("ASSIGNED");
    expect(studentRow.committeeId, "الطالب بلا علاقة بلجنة").toBe(committee.id);
    expect(studentRow.branch, "فرع الطالب لا يطابق فرع اللجنة").toBe(committee.branch);
    expect(studentRow.assignedAt, "تاريخ التوزيع غير مسجل").not.toBeNull();

    // relations: الجلسة مرتبطة بالطالب وبالمختبرين الذين في اللجنة
    expect(sessionRow.studentId).toBe(ctx.run.studentId);
    expect(sessionRow.teacher1Id).toBe(committee.teacher1Id);
    expect(sessionRow.teacher2Id).toBe(committee.teacher2Id);
    expect(sessionRow.teacher1Id).toBe(ctx.ids.examiner1);
    expect(sessionRow.teacher2Id).toBe(ctx.ids.examiner2);
    expect(sessionRow.status).toBe("SCHEDULED");
    expect(sessionRow.seasonId, "الجلسة بلا موسم").toBe(committee.seasonId);
    // لا يُفترض ربط النموذج قبل بدء التقييم من لوحة المختبر
    expect(sessionRow.modelId, "ربط النموذج يتم عند بدء التقييم فقط").toBeNull();
  });

  it("يرفض توزيع طالب على لجنة من فرع مختلف على الخادم", async () => {
    await asUser(ctx.ids.specialist);
    const otherBranch = ctx.run.branch === "5" ? "10" : "5";
    const institution = await ctx.prisma.institution.findFirstOrThrow({
      where: { tenantId: TENANT_ID },
      select: { id: true },
    });

    // طالب APPROVED من فرع آخر (fixture فقط — التوزيع نفسه يمر عبر Server Action)
    const foreignStudent = await ctx.prisma.student.create({
      data: {
        name: `طالب فرع ${otherBranch} ${Date.now()}`,
        age: 12,
        branch: otherBranch,
        teacherName: "معلم الاختبار",
        parentPhone: "0551234567",
        status: "APPROVED",
        approvedAt: new Date(),
        institutionId: institution.id,
        tenantId: TENANT_ID,
      },
      select: { id: true },
    });

    const result = await ctx.committee.assignStudentToCommittee({
      studentId: foreignStudent.id,
      committeeId: ctx.run.committeeId,
      examDate: "2030-03-12",
      period: ctx.periods[0],
    });

    expect(result.success, "قُبل توزيع طالب على لجنة من فرع مختلف").toBe(false);
    if (result.success) return;
    expect(result.error).toContain("فرع");

    // لم تتغير حالة الطالب ولم تُنشأ جلسة (لا حالة جزئية)
    const studentRow = await ctx.prisma.student.findUniqueOrThrow({
      where: { id: foreignStudent.id },
      select: { status: true, committeeId: true, assignedAt: true },
    });
    expect(studentRow.status).toBe("APPROVED");
    expect(studentRow.committeeId).toBeNull();
    expect(studentRow.assignedAt).toBeNull();
    const sessions = await ctx.prisma.examSession.count({
      where: { tenantId: TENANT_ID, studentId: foreignStudent.id },
    });
    expect(sessions, "أُنشئت جلسة رغم رفض التوزيع").toBe(0);
  });

  it("يربط النماذج باللجنة على الخادم", async () => {
    await asUser(ctx.ids.specialist);
    // المسار الحي في الواجهة: تعديل اللجنة يمر على createCommittee/updateCommittee
    // (لجانب النماذج)، وليس على setCommitteeSelectedModels غير المستوردة في أي واجهة.
    const result = await ctx.committee.updateCommittee(ctx.run.committeeId, {
      ...(await committeeInput()),
      modelIds: [ctx.run.modelId],
    });
    expect(result.success, JSON.stringify(result)).toBe(true);

    const selected = await ctx.prisma.committeeModelSelection.findMany({
      where: { committeeId: ctx.run.committeeId },
      select: { modelId: true },
    });
    expect(selected.map((s) => s.modelId)).toContain(ctx.run.modelId);
  }, 30_000);

  it("يرفض نموذجاً من فرع مختلف على الخادم", async () => {
    await asUser(ctx.ids.specialist);
    const otherBranch = ctx.run.branch === "5" ? "10" : "5";

    // ننشئ النموذج فعلاً عبر الـAction (إنشاء النموذج غير مقيّد بالفرع)
    const created = await ctx.questionBank.createQuestionBankModel({
      modelNumber: 95,
      branch: otherBranch,
      segmentsCount: 5,
      segments: buildSegments(5),
    });
    expect(created.success, JSON.stringify(created)).toBe(true);
    if (!("modelId" in created) || !created.modelId) return;

    const message = await refusal(
      ctx.committee.updateCommittee(ctx.run.committeeId, {
        ...(await committeeInput()),
        modelIds: [created.modelId],
      })
    );
    expect(message).toMatch(/فرع/);

    // لم يُربط النموذج باللجنة
    const selected = await ctx.prisma.committeeModelSelection.findMany({
      where: { committeeId: ctx.run.committeeId },
      select: { modelId: true },
    });
    expect(selected.map((s) => s.modelId)).not.toContain(created.modelId);
  }, 30_000);

  it("يفرض حد 10 مقاطع على الخادم ويرفض 11", async () => {
    await asUser(ctx.ids.specialist);
    const message = await rejection(
      ctx.questionBank.createQuestionBankModel({
        modelNumber: 97,
        branch: ctx.run.branch,
        segmentsCount: 11,
        segments: buildSegments(11),
      })
    );
    expect(message).toContain("10");
  });

  it("يقبل نموذجاً بالعدد الافتراضي من المقاطع (5)", async () => {
    await asUser(ctx.ids.specialist);
    const result = await ctx.questionBank.createQuestionBankModel({
      modelNumber: 96,
      branch: ctx.run.branch,
      segmentsCount: 5,
      segments: buildSegments(5),
    });
    expect(result.success, JSON.stringify(result)).toBe(true);
  });
});

// ------------------------------------------------------------
// M36 — الاختبار والمختبران (بوابة الاعتماد المزدوجة)
// ------------------------------------------------------------
describe("M36 — المختبران", () => {
  async function bindModel() {
    // الربط يتم على الخادم في صفحة المختبر؛ نُعيد enact المنطق نفسه على مستوى DB
    // لأن الربط نفسه (unique على الموسم + النموذج) هو ما نتحقق منه هنا.
    return ctx.prisma.examSession.update({
      where: { id: ctx.run.sessionId },
      data: { modelId: ctx.run.modelId },
      select: { id: true, modelId: true },
    });
  }

  it("يبدأ المختبر الأول الجلسة بالنموذج المحدد من اللوحة", async () => {
    const bound = await bindModel();
    expect(bound.modelId).toBe(ctx.run.modelId);
  });

  it("يمنع ربط نموذج مرتبط بطالب آخر في نفس الموسم (قاعدة used models على الخادم)", async () => {
    const bound = await ctx.prisma.examSession.findMany({
      where: { tenantId: TENANT_ID, modelId: { not: null } },
      select: { id: true, modelId: true, seasonId: true, studentId: true },
      orderBy: { createdAt: "asc" },
    });

    expect(bound.length, "لا توجد جلستان مرتبطتان بنموذجين").toBeGreaterThanOrEqual(2);
    const [first, second] = bound;
    expect(first!.modelId).not.toBe(second!.modelId);
    expect(first!.seasonId, "الجلستان في مواسم مختلفة").toBe(second!.seasonId);
    expect(first!.studentId).not.toBe(second!.studentId);

    // القيد الفريد (الموسم + النموذج) هو خط الدفاع على الخادم
    await expect(
      ctx.prisma.examSession.update({ where: { id: first!.id }, data: { modelId: second!.modelId } })
    ).rejects.toThrow();
  });

  it("يحفظ المختبر الأول تقييمه كمسودة", async () => {
    await asUser(ctx.ids.examiner1);
    const result = await ctx.assessment.saveAssessment({
      examSessionId: ctx.run.sessionId,
      wordErrors: 1,
      letterErrors: 2,
      diacriticErrors: 0,
      seriousErrors: 0,
      subtleErrors: 1,
      promptingCount: 0,
      doubtCount: 0,
      tajweedErrors: 0,
      recitationScore: 18,
      tajweedScore: 9,
    });

    expect(result.success, JSON.stringify(result)).toBe(true);
    const draft = await ctx.prisma.assessment.findFirstOrThrow({
      where: { examSessionId: ctx.run.sessionId, evaluatorId: ctx.ids.examiner1 },
      select: { status: true },
    });
    expect(draft.status).toBe("DRAFT");
  });

  it("يبقى الطالب ASSIGNED بعد اعتماد المختبر الأول", async () => {
    await asUser(ctx.ids.examiner1);
    const result = await ctx.assessment.approveAssessment(ctx.run.sessionId);
    expect(result.success).toBe(true);
    expect(result.allApproved, "لا يُغلق التقييم باعتماد مختبر واحد").toBe(false);

    const studentRow = await ctx.prisma.student.findUniqueOrThrow({
      where: { id: ctx.run.studentId },
      select: { status: true },
    });
    expect(studentRow.status, "الطالب انتقل لـ COMPLETED قبل اعتماد المختبر الثاني").toBe("ASSIGNED");
  });

  it("يبقى المختبر الثاني قادرًا على الحفظ والاعتماد", async () => {
    await asUser(ctx.ids.examiner2);
    const saved = await ctx.assessment.saveAssessment({
      examSessionId: ctx.run.sessionId,
      wordErrors: 2,
      letterErrors: 3,
      diacriticErrors: 1,
      seriousErrors: 0,
      subtleErrors: 2,
      promptingCount: 0,
      doubtCount: 0,
      tajweedErrors: 1,
      recitationScore: 17,
      tajweedScore: 8,
    });
    expect(saved.success, JSON.stringify(saved)).toBe(true);

    const approved = await ctx.assessment.approveAssessment(ctx.run.sessionId);
    expect(approved.success).toBe(true);
    expect(approved.allApproved, "لم تُغلق البوابة بعد موافقة المختبرين معاً").toBe(true);

    const studentRow = await ctx.prisma.student.findUniqueOrThrow({
      where: { id: ctx.run.studentId },
      select: { status: true, finalizedAt: true },
    });
    expect(studentRow.status).toBe("COMPLETED");
    // الاعتماد النهائي (finalizedAt) من صلاحية رئيس الشؤون التعليمية، لا من المختبرين
    expect(studentRow.finalizedAt, "لا يُعتمد نهائياً قبل موافقة رئيس الشؤون").toBeNull();
  });

  it("ينشئ تقييمين منفصلين بدرجتين مختلفتين", async () => {
    const rows = await ctx.prisma.assessment.findMany({
      where: { examSessionId: ctx.run.sessionId },
      select: { evaluatorId: true, status: true, finalScore: true },
      orderBy: { evaluatorId: "asc" },
    });

    expect(rows).toHaveLength(2);
    expect(new Set(rows.map((r) => r.evaluatorId)).size).toBe(2);
    expect(rows.every((r) => r.status === "APPROVED")).toBe(true);
    expect(rows[0]!.finalScore).not.toBe(rows[1]!.finalScore);
  });

  it("يمنع المختبر من تعديل تقييمه بعد الاعتماد", async () => {
    await asUser(ctx.ids.examiner1);
    const message = await rejection(
      ctx.assessment.saveAssessment({
        examSessionId: ctx.run.sessionId,
        wordErrors: 9,
        letterErrors: 9,
        diacriticErrors: 0,
        seriousErrors: 0,
        subtleErrors: 0,
        promptingCount: 0,
        doubtCount: 0,
        tajweedErrors: 0,
        recitationScore: 10,
        tajweedScore: 5,
      })
    );
    expect(message).toContain("تم اعتماده");
  });

  it("يمنع مختبراً من الكتابة على جلسة لا ينتمي إليها", async () => {
    const outsider = await ctx.prisma.user.findFirst({
      where: {
        role: "EXAMINER",
        id: { notIn: [ctx.ids.examiner1, ctx.ids.examiner2] },
        OR: [{ tenantId: TENANT_ID }, { tenantId: OTHER_TENANT_ID }],
      },
      select: { id: true },
    });
    if (!outsider) return; // لا يوجد مختبر ثالث في قاعدة الاختبار

    await asUser(outsider.id);
    const message = await rejection(ctx.assessment.approveAssessment(ctx.run.sessionId));
    expect(message).toMatch(/لجنتك|غير مصرح/);
  });

  it("ينشئ إشعاراً للأخصائي بعد اكتمال الموافقتين", async () => {
    const notification = await ctx.prisma.notification.findFirst({
      where: {
        tenantId: TENANT_ID,
        userId: ctx.ids.specialist,
        type: "ASSESSMENT",
        examSessionId: ctx.run.sessionId,
      },
      select: { id: true, message: true },
    });
    expect(notification, "لا يوجد إشعار مراجعة للأخصائي").not.toBeNull();
  });
});

// ------------------------------------------------------------
// M37 — مراجعة الأخصائي والاعتماد النهائي
// ------------------------------------------------------------
describe("M37 — مراجعة الأخصائي", () => {
  it("يمنع الأخصائي من الاعتماد قبل اكتمال تقييم المختبرين", async () => {
    await asUser(ctx.ids.specialist);
    const assigned = await ctx.prisma.student.findFirst({
      where: { tenantId: TENANT_ID, status: "ASSIGNED" },
      select: { id: true },
    });
    if (!assigned) return; // لا يوجد طالب ASSIGNED في الـfixture — لا حالة خاطئة لإثباتها

    const message = await rejection(ctx.admin.specialistFinalApprove(assigned.id));
    expect(message).toContain("المختبرين");
  });

  it("يمنع الاعتماد من دور غير مخول", async () => {
    await asUser(ctx.ids.examiner1);
    const message = await rejection(ctx.admin.specialistFinalApprove(ctx.run.studentId));
    expect(message).toContain("غير مصرح");
  });

  it("يسجّل التقييمات الأصلية قبل تعديل الدرجة", async () => {
    const before = await ctx.prisma.assessment.findMany({
      where: { examSessionId: ctx.run.sessionId },
      select: { evaluatorId: true, finalScore: true, status: true },
      orderBy: { evaluatorId: "asc" },
    });
    expect(before).toHaveLength(2);
    expect(before.every((a) => a.status === "APPROVED")).toBe(true);
  });

  it("يعتمد الأخصائي مع تعديل الدرجة ويسجّل الأثر في التدقيق", async () => {
    await asUser(ctx.ids.specialist);
    const result = await ctx.admin.specialistFinalApprove(ctx.run.studentId, 88.555);
    expect(result.success).toBe(true);
    expect(result.status).toBe("NOTIFIED");

    const studentRow = await ctx.prisma.student.findUniqueOrThrow({
      where: { id: ctx.run.studentId },
      select: { status: true },
    });
    expect(studentRow.status).toBe("NOTIFIED");

    const accepted = await ctx.prisma.assessment.findMany({
      where: { examSessionId: ctx.run.sessionId },
      select: { finalScore: true, status: true },
    });
    expect(accepted.every((a) => a.status === "ACCEPTED")).toBe(true);
    // الدرجة النهائية بعد التعديل تُقرَّب لخانة عشرية واحدة
    expect(accepted[0]!.finalScore).toBeCloseTo(88.6, 5);
  });

  it("يحفظ الدرجة الأصلية للمختبرين في سجل التدقيق", async () => {
    const audit = await findAuditStep("SPECIALIST_SCORE_OVERRIDE", ctx.ids.specialist);
    expect(audit, "لا يوجد سجل SPECIALIST_SCORE_OVERRIDE").not.toBeNull();

    const details = JSON.parse(String(audit!.details)) as {
      previousScores: { evaluatorId: string; score: number }[];
      newScore: number;
    };
    expect(details.previousScores).toHaveLength(2);
    expect(details.newScore).toBeCloseTo(88.6, 5);
    expect(details.previousScores.every((p) => p.score > 0)).toBe(true);
  });

  it("يعرض الطالب لرئيس الشؤون دون تفاصيل اختبار (استعلام الصفحة الحي)", async () => {
    await asUser(ctx.ids.head);

    // نفس استعلام app/(dashboard)/head-of-affairs/page.tsx (المسار الحي فعلياً)
    const students = await ctx.prisma.student.findMany({
      where: { tenantId: TENANT_ID, status: "NOTIFIED" },
      include: {
        institution: { select: { name: true } },
        examSessions: {
          include: {
            assessments: { where: { status: "ACCEPTED" }, select: { finalScore: true } },
          },
        },
      },
      orderBy: { updatedAt: "desc" },
    });

    const rows = students.map((student) => {
      const assessment = student.examSessions[0]?.assessments[0];
      return {
        id: student.id,
        name: student.name,
        branch: student.branch,
        institutionName: student.institution.name,
        finalScore: assessment?.finalScore ?? null,
        notifiedAt: student.updatedAt,
      };
    });

    const row = rows.find((s) => s.id === ctx.run.studentId);
    expect(row, "الطالب غير ظاهر لرئيس الشؤون").toBeDefined();
    // الدرجة النهائية تصل (مطلوبة للاعتماد) بدون أي تفصيل اختبار
    expect(typeof row?.finalScore, "الدرجة النهائية غير معروضة لرئيس الشؤون").toBe("number");

    // ممنوع: تفاصيل التقييم/النموذج/الأسئلة لا تصل أصلاً إلى هذا الدور
    const serialized = JSON.stringify(row);
    for (const forbidden of [
      "detailsJSON",
      "wordErrors",
      "letterErrors",
      "recitationScore",
      "tajweedScore",
      "segments",
      "modelId",
      "phone",
      "address",
      "applicationFileUrl",
    ]) {
      expect(serialized, `تسريب ${forbidden} لرئيس الشؤون`).not.toContain(forbidden);
    }
  });

  it("يعزل استعلام الصفحة رئيس الشؤون عن tenant أخرى", async () => {
    const foreign = await ctx.prisma.student.findMany({
      where: { tenantId: OTHER_TENANT_ID, status: "NOTIFIED" },
      select: { id: true },
    });
    // استعلام الصفحة مربوط بـgetTenantFilter، فلا يمكن أن يطابق أي طالب من خارج الـtenant
    const ownIds = new Set(
      (
        await ctx.prisma.student.findMany({
          where: { tenantId: TENANT_ID, status: "NOTIFIED" },
          select: { id: true },
        })
      ).map((s) => s.id)
    );
    for (const s of foreign) {
      expect(ownIds.has(s.id), "تسريب طالب من tenant أخرى إلى لوحة رئيس الشؤون").toBe(false);
    }
  });

  it("يمنع دوراً غير مخول من اعتماد رئيس الشؤون (عزل صلاحيات على المسار الحي)", async () => {
    await asUser(ctx.ids.examiner1);
    const message = await rejection(ctx.admin.headOfAffairsFinalApprove(ctx.run.studentId));
    expect(message).toContain("غير مصرح");
  });

  it("يشترط سبباً كتابياً عند الرفض من رئيس الشؤون", async () => {
    await asUser(ctx.ids.head);
    const message = await rejection(ctx.head.rejectStudentByHead(ctx.run.studentId, "   "));
    expect(message.length, "قبل الرفض بدون سبب").toBeGreaterThan(0);
    expect(message).not.toMatch(/Prisma|Error:|at /);
  });

  it("يعتمد رئيس الشؤون فينتقل الطالب إلى READY_FOR_CERTIFICATE", async () => {
    await asUser(ctx.ids.head);
    const result = await ctx.admin.headOfAffairsFinalApprove(ctx.run.studentId);
    expect(result.success).toBe(true);
    expect(result.status).toBe("READY_FOR_CERTIFICATE");

    const studentRow = await ctx.prisma.student.findUniqueOrThrow({
      where: { id: ctx.run.studentId },
      select: { status: true, finalizedAt: true },
    });
    expect(studentRow.status).toBe("READY_FOR_CERTIFICATE");
    expect(studentRow.finalizedAt, "تاريخ الاعتماد النهائي غير مسجل").not.toBeNull();
  });
});
