import { describe, it, expect, beforeAll, afterAll, vi } from "vitest";
import { config as loadEnv } from "dotenv";
import fs from "node:fs";
import path from "node:path";

loadEnv({ path: ".env" });

// ============================================================
// M35 (ب..و) — النماذج / اللجنة / المختبر
//  - ب: رقم النموذج التالي = max+1 لكل فرع
//  - ج: تحققات إنشاء اللجنة (فرع/مستأجر/دور/نماذج من نفس الفرع)
//  - د: تنبيه نقص النماذج مقابل الطلاب
//  - هـ: إضافة نموذج => دخول الطالب للجنة (قرار تصميمي)
//  - و: إخفاء النماذج المستخدمة (قاعدة واحدة بين الواجهة والخادم)
// prisma حقيقي + @/auth مُموَّه، وكل الكتابات مؤقتة تُنظَّف في finally.
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
let committeeActions: typeof import("@/lib/actions/committee-actions");
let qbActions: typeof import("@/lib/actions/question-bank-actions");
let modelAvailability: typeof import("@/lib/models/model-availability");

const OWN = "50436";
const OTHER = "12345";

const E = {
  admin: "fx50436-admin@e2e.exp.local",
  specialist: "fx50436-specialist@e2e.exp.local",
  examiner1: "fx50436-examiner1@e2e.exp.local",
  examiner2: "fx50436-examiner2@e2e.exp.local",
};

let ownTenantId: string;
let otherTenantId: string;
let ownInstitutionId: string;
let ownSeasonId: string;
let otherSeasonId: string;

async function asUser(email: string) {
  const user = await prisma.user.findUniqueOrThrow({
    where: { email },
    select: { id: true, role: true, tenantId: true },
  });
  session.userId = user.id;
  return user;
}

beforeAll(async () => {
  ({ prisma } = await import("@/lib/prisma"));
  committeeActions = await import("@/lib/actions/committee-actions");
  qbActions = await import("@/lib/actions/question-bank-actions");
  modelAvailability = await import("@/lib/models/model-availability");

  ownTenantId = (
    await prisma.tenant.findUniqueOrThrow({ where: { slug: OWN }, select: { id: true } })
  ).id;
  otherTenantId = (
    await prisma.tenant.findUniqueOrThrow({ where: { slug: OTHER }, select: { id: true } })
  ).id;
  ownInstitutionId = (
    await prisma.institution.findFirstOrThrow({
      where: { tenantId: ownTenantId },
      select: { id: true },
    })
  ).id;
  ownSeasonId = (
    await prisma.examSeason.findFirstOrThrow({
      where: { tenantId: ownTenantId },
      select: { id: true },
    })
  ).id;
  otherSeasonId = (
    await prisma.examSeason.findFirstOrThrow({
      where: { tenantId: otherTenantId },
      select: { id: true },
    })
  ).id;
}, 120_000);

afterAll(async () => {
  await prisma?.$disconnect();
});

// ------------------------------------------------------------
// (ب) رقم النموذج التالي
// ------------------------------------------------------------
describe("M35/B — رقم النموذج التالي = max+1 لكل فرع", () => {
  it("getNextModelNumbers يجمع (_max) لكل فرع داخل مستأجر المستخدم", async () => {
    await asUser(E.specialist);
    const next = await qbActions.getNextModelNumbers();

    const grouped = await prisma.questionBankModel.groupBy({
      by: ["branch"],
      where: { tenantId: ownTenantId },
      _max: { modelNumber: true },
    });

    expect(next).toBeTypeOf("object");
    for (const g of grouped) {
      expect(next[g.branch], `الفرع ${g.branch}`).toBe((g._max.modelNumber ?? 0) + 1);
    }
    // لا يسرّب فروع مستأجر آخر
    const otherBranches = await prisma.questionBankModel.findMany({
      where: { tenantId: otherTenantId },
      select: { branch: true },
      distinct: ["branch"],
    });
    for (const b of otherBranches) {
      if (!grouped.some((g) => g.branch === b.branch)) {
        expect(next[b.branch], `تسريب فرع ${b.branch} لمستأجر آخر`).toBeUndefined();
      }
    }
  });

  it("الرقم الافتراضي يُمرَّر للنموذج في الصفحتين (props)", () => {
    for (const page of [
      "app/(dashboard)/admin/question-bank/page.tsx",
      "app/(dashboard)/test-specialist/models/page.tsx",
    ]) {
      const src = fs.readFileSync(path.resolve(process.cwd(), page), "utf8");
      expect(src, `${page}: getNextModelNumbers`).toMatch(/getNextModelNumbers\(\)/);
    }
    for (const comp of [
      "components/admin/question-bank-manager.tsx",
      "components/specialist/exam-models-manager.tsx",
    ]) {
      const src = fs.readFileSync(path.resolve(process.cwd(), comp), "utf8");
      expect(src, `${comp}: default من nextModelNumbers`).toMatch(
        /const defaultModelNumber = nextModelNumbers\?\.\["5"\] \?\? 1;/
      );
      expect(src, `${comp}: الحالة الابتدائية`).toMatch(
        /useState\(String\(defaultModelNumber\)\)/
      );
      // تغيير الفرع يعيد حساب الرقم التالي لذلك الفرع
      expect(src, `${comp}: تحديث الرقم عند تغيير الفرع`).toMatch(
        /setModelNumber\(String\(nextModelNumbers\?\.\[v\] \?\? 1\)\)/
      );
    }
  });

  it("الرقم يُحتسب على الخادم (MAX+1) ويتجاهل قيمة العميل", () => {
    const src = fs.readFileSync(
      path.resolve(process.cwd(), "lib/actions/question-bank-actions.ts"),
      "utf8"
    );
    expect(src).toMatch(/_max: \{ modelNumber: true \}/);
    expect(src).toMatch(/\(agg\._max\.modelNumber \?\? 0\) \+ 1/);
    const src2 = fs.readFileSync(
      path.resolve(process.cwd(), "lib/actions/model-actions.ts"),
      "utf8"
    );
    expect(src2).toMatch(/\(agg\._max\.modelNumber \?\? 0\) \+ 1/);
  });
});

// ------------------------------------------------------------
// (ج) تحققات اللجنة
// ------------------------------------------------------------
describe("M35/C — تحققات إنشاء/تعديل اللجنة", () => {
  it("يرفض فرعاً غير صالح", async () => {
    await asUser(E.specialist);
    const r = await committeeActions.createCommittee({
      name: `لجنة-فرع-${Date.now()}`,
      branch: "7",
      seasonId: ownSeasonId,
      teacher1Id: "x",
      teacher2Id: "y",
      modelIds: [],
    });
    expect(r.success).toBe(false);
  });

  it("يرفض موسماً من مستأجر آخر (عزل tenant)", async () => {
    await asUser(E.specialist);
    // assertSameTenant يرمي (لا يُcaught) — أي رفض يُعد نجاحاً
    await expect(
      committeeActions.createCommittee({
        name: `لجنة-موسم-آخر-${Date.now()}`,
        branch: "5",
        seasonId: otherSeasonId,
        teacher1Id: "x",
        teacher2Id: "y",
        modelIds: [],
      })
    ).rejects.toThrow();
  });

  it("يرفض مختبراً ليس بدور EXAMINER", async () => {
    await asUser(E.specialist);
    const admin = await prisma.user.findUniqueOrThrow({
      where: { email: E.admin },
      select: { id: true },
    });
    const e1 = await prisma.user.findUniqueOrThrow({
      where: { email: E.examiner1 },
      select: { id: true },
    });
    const r = await committeeActions.createCommittee({
      name: `لجنة-دور-${Date.now()}`,
      branch: "5",
      seasonId: ownSeasonId,
      teacher1Id: e1.id,
      teacher2Id: admin.id, // ADMIN وليس EXAMINER
      modelIds: [],
    });
    expect(r.success, "قُبل مختبر بدور غير EXAMINER").toBe(false);
  });

  it("يرفض مختبرَين واحداً (بلا تبادل)", async () => {
    await asUser(E.specialist);
    const e1 = await prisma.user.findUniqueOrThrow({
      where: { email: E.examiner1 },
      select: { id: true },
    });
    const r = await committeeActions.createCommittee({
      name: `لجنة-مكرر-${Date.now()}`,
      branch: "5",
      seasonId: ownSeasonId,
      teacher1Id: e1.id,
      teacher2Id: e1.id,
      modelIds: [],
    });
    expect(r.success).toBe(false);
  });

  it("يرفض نموذجاً من فرع مختلف عن فرع اللجنة أو من مستأجر آخر", async () => {
    await asUser(E.specialist);
    const e1 = await prisma.user.findUniqueOrThrow({
      where: { email: E.examiner1 },
      select: { id: true },
    });
    const e2 = await prisma.user.findUniqueOrThrow({
      where: { email: E.examiner2 },
      select: { id: true },
    });
    const foreignModel = await prisma.questionBankModel.findFirst({
      where: { tenantId: otherTenantId },
      select: { id: true },
    });
    expect(foreignModel, "لا يوجد نموذج في المستأجر الآخر").toBeTruthy();

    const r = await committeeActions.createCommittee({
      name: `لجنة-نموذج-مستأجر-${Date.now()}`,
      branch: "5",
      seasonId: ownSeasonId,
      teacher1Id: e1.id,
      teacher2Id: e2.id,
      modelIds: [foreignModel!.id],
    });
    expect(r.success, "قُبل نموذج مستأجر آخر").toBe(false);
  });

  it("يقبل لجنة صحيحة وينشئها (نموذج من نفس الفرع)", async () => {
    await asUser(E.specialist);
    const e1 = await prisma.user.findUniqueOrThrow({
      where: { email: E.examiner1 },
      select: { id: true },
    });
    const e2 = await prisma.user.findUniqueOrThrow({
      where: { email: E.examiner2 },
      select: { id: true },
    });
    const ownModel = await prisma.questionBankModel.findFirstOrThrow({
      where: { tenantId: ownTenantId, branch: "5" },
      select: { id: true },
    });
    const name = `لجنة-م35-ج-${Date.now()}`;
    const r = await committeeActions.createCommittee({
      name,
      branch: "5",
      seasonId: ownSeasonId,
      teacher1Id: e1.id,
      teacher2Id: e2.id,
      modelIds: [ownModel.id],
    });
    expect(r.success, `فشل الإنشاء: ${r.success ? "" : r.error}`).toBe(true);

    const created = await prisma.committee.findFirstOrThrow({
      where: { tenantId: ownTenantId, name },
      select: { id: true, branch: true, selectedModels: { select: { modelId: true } } },
    });
    expect(created.branch).toBe("5");
    expect(created.selectedModels.map((m) => m.modelId)).toEqual([ownModel.id]);

    await prisma.committeeModelSelection.deleteMany({ where: { committeeId: created.id } });
    await prisma.committee.deleteMany({ where: { id: created.id } });
  });

  it("غير الأخصائي/الأدمن يُرفض", async () => {
    await asUser(E.examiner1);
    const r = await committeeActions.createCommittee({
      name: `لجنة-مختبر-${Date.now()}`,
      branch: "5",
      seasonId: ownSeasonId,
      teacher1Id: "x",
      teacher2Id: "y",
      modelIds: [],
    });
    expect(r.success).toBe(false);
  });
});

// ------------------------------------------------------------
// (د) تنبيه نقص النماذج
// ------------------------------------------------------------
describe("M35/D — تنبيه عدد الطلاب أكبر من عدد النماذج", () => {
  it("الشرط وعبارة التنبيه ورابط إدارة النماذج موجودة", () => {
    const src = fs.readFileSync(
      path.resolve(process.cwd(), "components/specialist/committee-manager.tsx"),
      "utf8"
    );
    expect(src).toMatch(
      /c\._count\.students > c\.selectedModels\.length && \(\s*<div className="mt-1 space-y-1">/
    );
    expect(src).toMatch(/تنبيه: عدد الطلاب/);
    expect(src).toMatch(/أكبر من عدد النماذج/);
    expect(src).toMatch(/href="\/test-specialist\/models"/);
    expect(src).toMatch(/إدارة النماذج/);
  });
});

// ------------------------------------------------------------
// (هـ) إضافة نموذج => الطالب يدخل اللجنة
// ------------------------------------------------------------
describe("M35/E — دخول الطالب للجنة مرتبط بالتوزيع لا بإضافة نموذج", () => {
  it("الطالب يدخل اللجنة عبر assignStudentToCommittee فقط", async () => {
    const src = fs.readFileSync(
      path.resolve(process.cwd(), "lib/actions/committee-actions.ts"),
      "utf8"
    );
    //assignStudentToCommittee هو ما ينقل الطالب (committeeId) وينشئ الجلسة
    expect(src).toMatch(/committeeId: input\.committeeId/);
    expect(src).toMatch(/status: "ASSIGNED"/);
    expect(src).toMatch(/examSession\.create\(/);
    // الجلسة تبدأ بلا نموذج — يُختار عند بدء الاختبار
    expect(src).toMatch(/modelId: null/);
  });

  it("اختيار/تعديل النماذج لا يوزّع أي طالب تلقائياً (قرار تصميمي)", () => {
    const update = fs.readFileSync(
      path.resolve(process.cwd(), "lib/actions/committee-actions.ts"),
      "utf8"
    );
    const block = update.slice(
      update.indexOf("export async function updateCommittee"),
      update.indexOf("export async function", update.indexOf("export async function updateCommittee") + 10)
    );
    // لا تعديل على Student ولا إنشاء جلسات
    expect(block.includes("tx.student.update"), "يوزّع طلاباً عند تعديل النماذج").toBe(false);
    expect(block.includes("tx.examSession.create"), "ينشئ جلسات عند تعديل النماذج").toBe(false);

    const sel = fs.readFileSync(
      path.resolve(process.cwd(), "lib/actions/model-actions.ts"),
      "utf8"
    );
    const selBlock = sel.slice(
      sel.indexOf("export async function setCommitteeSelectedModels"),
      sel.indexOf("export async function getCommitteeSelectedModelIds")
    );
    expect(selBlock.includes("prisma.student"), "setCommitteeSelectedModels يمس الطلاب").toBe(false);
    expect(selBlock.includes("examSession"), "setCommitteeSelectedModels يمس الجلسات").toBe(false);
  });
});

// ------------------------------------------------------------
// (و) إخفاء النماذج المستخدمة
// ------------------------------------------------------------
describe("M35/F — قاعدة واحدة لإخفاء النماذج المستخدمة", () => {
  it("قائمة الانتظار وبوابة التقييم تستخدمان نفس الدالة", () => {
    const pending = fs.readFileSync(
      path.resolve(process.cwd(), "app/(dashboard)/examiner/pending/page.tsx"),
      "utf8"
    );
    const assess = fs.readFileSync(
      path.resolve(process.cwd(), "app/(dashboard)/examiner/assess/[studentId]/page.tsx"),
      "utf8"
    );
    expect(pending).toMatch(/getUsedModelAssignmentsInCommittee/);
    expect(assess).toMatch(/getUsedModelAssignmentsInCommittee/);
    // لا استعلام موازٍ بقاعدة مختلفة
    expect(pending.includes("usedModelNumbers = new Set"), "استعلام موازٍ في pending").toBe(false);
    expect(assess.includes("usedModels = await prisma"), "استعلام موازٍ في assess").toBe(false);
    // استبعاد الطالب الحالي في البوابة فقط
    expect(assess).toMatch(/excludeStudentId: student\.id/);
  });

  it("نموذج طالب آخر في نفس اللجنة يُعتبر مستخدماً، ونموذج الطالب نفسه لا", async () => {
    // تجهيز: طالبان في نفس اللجنة، أحدهما حُجز له نموذج
    const committee = await prisma.committee.findFirstOrThrow({
      where: { tenantId: ownTenantId },
      select: { id: true, seasonId: true, branch: true },
    });
    const models = await prisma.questionBankModel.findMany({
      where: { tenantId: ownTenantId, branch: committee.branch },
      select: { id: true, modelNumber: true },
      take: 2,
      orderBy: { modelNumber: "asc" },
    });
    expect(models.length, "يلزم نموذجان في نفس الفرع").toBeGreaterThanOrEqual(2);
    const [modelA, modelB] = models as [
      { id: string; modelNumber: number },
      { id: string; modelNumber: number },
    ];

    const stamp = Date.now();
    const s1 = await prisma.student.create({
      data: {
        name: `m35f-a-${stamp}`,
        age: 12,
        branch: committee.branch,
        teacherName: "أ.م35",
        parentPhone: "0550000000",
        status: "ASSIGNED",
        committeeId: committee.id,
        institutionId: ownInstitutionId,
        tenantId: ownTenantId,
      },
      select: { id: true },
    });
    const s2 = await prisma.student.create({
      data: {
        name: `m35f-b-${stamp}`,
        age: 12,
        branch: committee.branch,
        teacherName: "أ.م35",
        parentPhone: "0550000000",
        status: "ASSIGNED",
        committeeId: committee.id,
        institutionId: ownInstitutionId,
        tenantId: ownTenantId,
      },
      select: { id: true },
    });
    const sessionA = await prisma.examSession.create({
      data: {
        studentId: s1.id,
        teacher1Id: (await prisma.user.findUniqueOrThrow({ where: { email: E.examiner1 }, select: { id: true } })).id,
        teacher2Id: (await prisma.user.findUniqueOrThrow({ where: { email: E.examiner2 }, select: { id: true } })).id,
        examDate: new Date(),
        period: "صباحي",
        status: "SCHEDULED",
        seasonId: committee.seasonId,
        modelId: modelA.id,
        tenantId: ownTenantId,
      },
      select: { id: true },
    });

    try {
      // منظور الطالب الثاني: نموذج A مستخدم، B متاح
      const forS2 = await modelAvailability.getUsedModelAssignmentsInCommittee({
        seasonId: committee.seasonId,
        committeeId: committee.id,
        excludeStudentId: s2.id,
      });
      const usedForS2 = new Set(forS2.map((a) => a.modelId));
      expect(usedForS2.has(modelA.id), "نموذج الطالب A لم يُعتبر مستخدماً للطالب B").toBe(true);
      expect(usedForS2.has(modelB.id), "نموذج B يجب ألا يُعتبر مستخدماً").toBe(false);

      // منظور الطالب الأول: نموذجه هو ليس «مستخدماً» لنفسه
      const forS1 = await modelAvailability.getUsedModelAssignmentsInCommittee({
        seasonId: committee.seasonId,
        committeeId: committee.id,
        excludeStudentId: s1.id,
      });
      const usedForS1 = new Set(forS1.map((a) => a.modelId));
      expect(usedForS1.has(modelA.id), "نموذج الطالب نفسه لا يُعتبر مستخدماً لنفسه").toBe(false);
      expect(usedForS1.has(modelB.id), "نموذج B أُغلق خطأً للطالب A").toBe(false);

      // إلغاء الجلسة يفتح النموذج من جديد
      await prisma.examSession.update({
        where: { id: sessionA.id },
        data: { status: "CANCELLED" },
      });
      const afterCancel = await modelAvailability.getUsedModelAssignmentsInCommittee({
        seasonId: committee.seasonId,
        committeeId: committee.id,
        excludeStudentId: s2.id,
      });
      expect(
        afterCancel.some((a) => a.modelId === modelA.id),
        "نموذج جلسة ملغاة بقي محجوزاً"
      ).toBe(false);
    } finally {
      await prisma.examSession.deleteMany({
        where: { id: { in: [sessionA.id] } },
      });
      await prisma.student.deleteMany({ where: { id: { in: [s1.id, s2.id] } } });
    }
  }, 60_000);

  it("committeeId فارغ => قائمة فارغة (لا استعلام ولا خطأ)", async () => {
    const out = await modelAvailability.getUsedModelAssignmentsInCommittee({
      seasonId: "غير-موجود",
      committeeId: null,
    });
    expect(out).toEqual([]);
  });

  it("committeeId غير موجود => لا نتائج من لجنة أخرى", async () => {
    const out = await modelAvailability.getUsedModelAssignmentsInCommittee({
      seasonId: ownSeasonId,
      committeeId: "لجنة-غير-موجودة-تماماً",
    });
    expect(out).toEqual([]);
  });
});
