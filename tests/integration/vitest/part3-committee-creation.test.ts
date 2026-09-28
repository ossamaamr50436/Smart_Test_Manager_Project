import { describe, it, expect, beforeAll, afterAll, vi } from "vitest";
import { config as loadEnv } from "dotenv";

loadEnv({ path: ".env" });

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

const OWN = "50436";
const E = {
  specialist: "fx50436-specialist@e2e.exp.local",
  examiner1: "fx50436-examiner1@e2e.exp.local",
  examiner2: "fx50436-examiner2@e2e.exp.local",
};

const RUN = `part3-${Date.now()}`;
const TEMP_MODEL_NUMBER = 1000 + (Date.now() % 8000);
const DUPLICATE_ERROR = "يوجد لجنة بنفس الاسم في هذا الموسم";

let ownTenantId: string;
let ownSeasonId: string;
let modelBranch5: string;
let modelBranch5Second: string;
let modelBranch10: string;
let teacher1Id: string;
let teacher2Id: string;

const createdCommitteeIds: string[] = [];
const usedNames: string[] = [];

type CreateResult = { success: boolean; committeeId?: string; error?: string };

async function asUser(email: string) {
  const user = await prisma.user.findUniqueOrThrow({
    where: { email },
    select: { id: true, role: true, tenantId: true },
  });
  session.userId = user.id;
  return user;
}

async function attempt(options: {
  label: string;
  name: string;
  branch: string;
  modelIds: string[];
}): Promise<CreateResult> {
  const name = `${options.name}`;
  usedNames.push(name);
  try {
    const result = (await committeeActions.createCommittee({
      name,
      branch: options.branch,
      seasonId: ownSeasonId,
      teacher1Id,
      teacher2Id,
      modelIds: options.modelIds,
    })) as CreateResult;

    expect(typeof result, `${options.label}: يجب أن يُرجع نتيجة`).toBe("object");
    expect(result, `${options.label}: success مطلوب`).not.toBeUndefined();
    expect(result.success, `${options.label}: error = ${result.error ?? ""}`).toBeTypeOf(
      "boolean"
    );

    if (result.success) {
      expect(result.committeeId, `${options.label}: committeeId مفقود`).toBeTruthy();
      createdCommitteeIds.push(String(result.committeeId));
    } else {
      expect(result.error, `${options.label}: رسالة خطأ عربية مطلوبة`).toBeTruthy();
      expect(result.error, `${options.label}: رسالة عربية`).toMatch(/[؀-ۿ]/);
    }
    return result;
  } catch (error) {
    throw new Error(
      `${options.label}: استثناء بدل إرجاع نتيجة (500 / Server Component): ${
        error instanceof Error ? error.message : String(error)
      }`
    );
  }
}

async function assertPersisted(options: {
  label: string;
  result: CreateResult;
  name: string;
  branch: string;
  modelIds: string[];
}): Promise<void> {
  const committee = await prisma.committee.findFirst({
    where: { tenantId: ownTenantId, name: options.name },
    select: {
      id: true,
      branch: true,
      seasonId: true,
      teacher1Id: true,
      teacher2Id: true,
      tenantId: true,
      selectedModels: { select: { modelId: true } },
    },
  });

  expect(committee, `${options.label}: اللجنة غير موجودة في قاعدة البيانات`).not.toBeNull();
  const row = committee;
  expect(row?.id, `${options.label}: المعرّف`).toBe(options.result.committeeId);
  expect(row?.branch, `${options.label}: الفرع`).toBe(options.branch);
  expect(row?.seasonId, `${options.label}: الموسم`).toBe(ownSeasonId);
  expect(row?.tenantId, `${options.label}: المستأجر`).toBe(ownTenantId);
  expect(row?.teacher1Id, `${options.label}: المختبر الأول`).toBe(teacher1Id);
  expect(row?.teacher2Id, `${options.label}: المختبر الثاني`).toBe(teacher2Id);
  expect(row?.teacher1Id, `${options.label}: المختبران مختلفان`).not.toBe(row?.teacher2Id);
  expect(
    (row?.selectedModels ?? []).map((m) => m.modelId).sort(),
    `${options.label}: النماذج المختارة`
  ).toEqual([...options.modelIds].sort());

  const audit = await prisma.auditLog.findFirst({
    where: { tenantId: ownTenantId, userId: session.userId },
    orderBy: { timestamp: "desc" },
    select: { id: true, details: true, action: true },
  });
  expect(audit, `${options.label}: سجل التدقيق`).not.toBeNull();
  const raw = audit?.details;
  const serialized = typeof raw === "string" ? raw : JSON.stringify(raw);
  expect(serialized, `${options.label}: سجل التدقيق يذكر اللجنة`).toContain(options.name);
}

beforeAll(async () => {
  ({ prisma } = await import("@/lib/prisma"));
  committeeActions = await import("@/lib/actions/committee-actions");

  ownTenantId = (
    await prisma.tenant.findUniqueOrThrow({ where: { slug: OWN }, select: { id: true } })
  ).id;
  ownSeasonId = (
    await prisma.examSeason.findFirstOrThrow({
      where: { tenantId: ownTenantId },
      select: { id: true },
    })
  ).id;

  const branch5Models = await prisma.questionBankModel.findMany({
    where: { tenantId: ownTenantId, branch: "5" },
    select: { id: true },
    take: 2,
    orderBy: { modelNumber: "asc" },
  });
  modelBranch5 = branch5Models[0]?.id ?? "";
  modelBranch5Second = branch5Models[1]?.id ?? modelBranch5;

  const branch10 = await prisma.questionBankModel.findFirst({
    where: { tenantId: ownTenantId, branch: "10" },
    select: { id: true },
  });
  if (branch10) {
    modelBranch10 = branch10.id;
  } else {
    const created = await prisma.questionBankModel.create({
      data: {
        tenantId: ownTenantId,
        branch: "10",
        modelNumber: TEMP_MODEL_NUMBER,
        detailsJSON: {},
        segmentsCount: 1,
      },
    });
    modelBranch10 = created.id;
  }

  const specialist = await asUser(E.specialist);
  expect(specialist.role, "المستخدم يجب أن يكون أخصائي اختبارات").toBe("TEST_SPECIALIST");

  const examiners = await prisma.user.findMany({
    where: { tenantId: ownTenantId, role: "EXAMINER" },
    select: { id: true },
    orderBy: { email: "asc" },
  });
  teacher1Id = (
    await prisma.user.findUniqueOrThrow({
      where: { email: E.examiner1 },
      select: { id: true },
    })
  ).id;
  teacher2Id = (
    await prisma.user.findUniqueOrThrow({
      where: { email: E.examiner2 },
      select: { id: true },
    })
  ).id;
  expect(examiners.length, "عدد المختبرين").toBeGreaterThanOrEqual(2);
  expect(teacher1Id).not.toBe(teacher2Id);
}, 120_000);

afterAll(async () => {
  if (!prisma) return;
  if (createdCommitteeIds.length > 0) {
    await prisma.committeeModelSelection.deleteMany({
      where: { committeeId: { in: createdCommitteeIds } },
    });
    await prisma.committee.deleteMany({ where: { id: { in: createdCommitteeIds } } });
  }
  await prisma.questionBankModel.deleteMany({
    where: { tenantId: ownTenantId, branch: "10", modelNumber: TEMP_MODEL_NUMBER },
  });
  if (usedNames.length > 0) {
    const logs = await prisma.auditLog.findMany({
      where: { tenantId: ownTenantId },
      select: { id: true, details: true },
    });
    const targets = logs.filter((log) => {
      const raw = log.details;
      const serialized = typeof raw === "string" ? raw : JSON.stringify(raw);
      return usedNames.some((name) => serialized.includes(name));
    });
    if (targets.length > 0) {
      await prisma.auditLog.deleteMany({ where: { id: { in: targets.map((l) => l.id) } } });
    }
  }
  await prisma.$disconnect();
});

describe("Part3 §2 — إنشاء اللجان 10/10 في مستأجر 50436", () => {
  it("المحاولة 1-5: لجان بأسماء مختلفة تُنشأ وتُحفظ", async () => {
    await asUser(E.specialist);

    const plans = [
      { label: "المحاولة 1", branch: "5", modelIds: [modelBranch5] },
      { label: "المحاولة 2", branch: "5", modelIds: [modelBranch5, modelBranch5Second] },
      { label: "المحاولة 3", branch: "10", modelIds: [modelBranch10] },
      { label: "المحاولة 4", branch: "5", modelIds: [modelBranch5Second] },
      { label: "المحاولة 5", branch: "10", modelIds: [modelBranch10] },
    ];

    for (const [index, plan] of plans.entries()) {
      const name = `لجنة ${index + 1} - اختبار ${RUN}`;
      const result = await attempt({ label: plan.label, name, branch: plan.branch, modelIds: plan.modelIds });
      expect(result.success, `${plan.label}: ${result.error ?? ""}`).toBe(true);
      await assertPersisted({
        label: plan.label,
        result,
        name,
        branch: plan.branch,
        modelIds: plan.modelIds,
      });
    }
  }, 60_000);

  it("المحاولة 6-8: نفس الاسم ثلاث مرات — واحدة تنجح واثنتان تُرفضان برسالة واضحة", async () => {
    await asUser(E.specialist);
    const name = `اختبار ${RUN}`;

    const first = await attempt({
      label: "المحاولة 6",
      name,
      branch: "5",
      modelIds: [modelBranch5],
    });
    expect(first.success, `المحاولة 6: ${first.error ?? ""}`).toBe(true);
    await assertPersisted({
      label: "المحاولة 6",
      result: first,
      name,
      branch: "5",
      modelIds: [modelBranch5],
    });

    for (const attemptNumber of [7, 8]) {
      const label = `المحاولة ${attemptNumber}`;
      const before = await prisma.committee.count({
        where: { tenantId: ownTenantId, seasonId: ownSeasonId, name },
      });
      const result = await attempt({ label, name, branch: "5", modelIds: [modelBranch5] });
      expect(result.success, `${label}: يجب الرفض`).toBe(false);
      expect(result.error, `${label}: رسالة العربية`).toBe(DUPLICATE_ERROR);
      expect(result.committeeId, `${label}: لا معرّف عند الرفض`).toBeUndefined();

      const after = await prisma.committee.count({
        where: { tenantId: ownTenantId, seasonId: ownSeasonId, name },
      });
      expect(after, `${label}: لم تُنشأ لجنة إضافية`).toBe(before);
    }
  });

  it("المحاولة 9-10: لجان بنفس الفرع 5 تُنشأ بنجاح", async () => {
    await asUser(E.specialist);

    const names = [`لجنة 6 - اختبار ${RUN}`, `لجنة 7 - اختبار ${RUN}`];
    const created: string[] = [];

    for (const [index, name] of names.entries()) {
      const label = `المحاولة ${index + 9}`;
      const result = await attempt({
        label,
        name,
        branch: "5",
        modelIds: [modelBranch5],
      });
      expect(result.success, `${label}: ${result.error ?? ""}`).toBe(true);
      await assertPersisted({
        label,
        result,
        name,
        branch: "5",
        modelIds: [modelBranch5],
      });
      created.push(String(result.committeeId));
    }

    const rows = await prisma.committee.findMany({
      where: { id: { in: created } },
      select: { id: true, branch: true },
    });
    expect(rows.length, "اللجان بنفس الفرع").toBe(2);
    for (const row of rows) expect(row.branch, "الفرع 5").toBe("5");
  }, 60_000);

  it("المحاولات العشر: 8 لجان مُنشأة بلا تكرار في الأسماء", async () => {
    const rows = await prisma.committee.findMany({
      where: { tenantId: ownTenantId, name: { contains: RUN } },
      select: { name: true, branch: true, teacher1Id: true, teacher2Id: true },
    });

    expect(rows.length, "عدد اللجان المنشأة (5 + 1 + 2)").toBe(8);
    const names = rows.map((row) => row.name);
    expect(new Set(names).size, "لا اسم مكرر").toBe(names.length);
    for (const row of rows) {
      expect(row.teacher1Id, `المختبران مختلفان في ${row.name}`).not.toBe(row.teacher2Id);
    }
    expect(
      rows.filter((row) => row.branch === "5").length >= 5,
      "لجان بنفس الفرع 5"
    ).toBe(true);
  }, 60_000);
});
