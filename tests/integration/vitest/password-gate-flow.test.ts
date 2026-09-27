import { describe, it, expect, beforeAll, afterAll, vi } from "vitest";
import { config as loadEnv } from "dotenv";

loadEnv({ path: ".env" });

// ============================================================
// I — دورة حياة إجبار تغيير كلمة المرور (على الخادم بالكامل)
// - يبدأ مسموحاً  → يُجبَر (403 على /api/* ولوحته)
// - تغيير كلمة المرور يمسح الإجبار في DB → المسارات تعود للعمل
// بلا متصفح وبلا خادم: بوابة API الحقيقية + action الحقيقية
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

vi.mock("@/lib/rate-limit", () => ({
  checkRateLimit: async () => undefined,
  checkMultiLevelRateLimit: async () => undefined,
}));

vi.mock("@/lib/file-storage", () => ({
  uploadFile: async () => ({ fileId: "test-file", url: "https://example.test/f.json" }),
  deleteFile: async () => undefined,
  isTrustedStoredUrl: () => true,
  isValidFileKey: () => true,
  isStoredUrl: () => true,
  downloadFileByUrl: async () => Buffer.from("x"),
}));

const ISOLATION_TENANT = "cmu5ngaxg0000to23u132olty";
const OLD_PASSWORD = "OldPass@12345";
const NEW_PASSWORD = "NewPass@67890";
const stamp = Date.now().toString(36);
const TEST_EMAIL = `fx-gate-${stamp}@e2e.exp.local`;

let prisma: typeof import("@/lib/prisma")["prisma"];
let bcrypt: typeof import("bcryptjs");
let POST: (req: Request) => Promise<Response>;
let changeMyPassword: typeof import("@/lib/actions/change-password-actions")["changeMyPassword"];
let userId: string;

function segments(count: number) {
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

// نطاق أرقام النماذج الخاص بهذا الملف (مختلف عن ملفات الاختبار الأخرى)
const MODEL_RANGE_START = 80;

async function freeModelNumber(): Promise<number> {
  const rows = await prisma.questionBankModel.findMany({
    where: { tenantId: ISOLATION_TENANT },
    select: { modelNumber: true },
  });
  const used = new Set(rows.map((r) => r.modelNumber));
  for (let n = MODEL_RANGE_START; n <= 89; n++) if (!used.has(n)) return n;
  throw new Error("لا يوجد رقم نموذج حر في النطاق المخصص للاختبار");
}

/** استدعاء حقيقي لمسار API محمي */
async function callProtectedApi(): Promise<number> {
  const modelNumber = await freeModelNumber();
  const res = await POST(
    new Request("http://localhost/api/import/models", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify([
        { modelNumber, branch: "5", segmentsCount: 5, details: { segments: segments(5) } },
      ]),
    })
  );
  if (res.status === 200) {
    await prisma.questionBankModel.deleteMany({
      where: { tenantId: ISOLATION_TENANT, modelNumber },
    });
  }
  return res.status;
}

async function flag(): Promise<boolean> {
  const row = await prisma.user.findUniqueOrThrow({
    where: { id: userId },
    select: { mustChangePassword: true },
  });
  return row.mustChangePassword;
}

beforeAll(async () => {
  ({ prisma } = await import("@/lib/prisma"));
  bcrypt = (await import("bcryptjs")).default;
  POST = (await import("@/app/api/import/models/route")).POST;
  changeMyPassword = (await import("@/lib/actions/change-password-actions")).changeMyPassword;

  const user = await prisma.user.create({
    data: {
      name: "مستخدم بوابة كلمة المرور",
      email: TEST_EMAIL,
      password: await bcrypt.hash(OLD_PASSWORD, 10),
      role: "ADMIN",
      birthDate: new Date("1990-01-01"),
      tenantId: ISOLATION_TENANT,
    },
    select: { id: true },
  });
  userId = user.id;
  session.userId = user.id;
}, 180_000);

afterAll(async () => {
  if (!prisma) return;
  await prisma.questionBankModel.deleteMany({
    where: { tenantId: ISOLATION_TENANT, modelNumber: { gte: MODEL_RANGE_START, lte: 89 } },
  });
  await prisma.user.deleteMany({ where: { email: TEST_EMAIL } });
  await prisma.$disconnect();
});

describe("I — دورة إجبار تغيير كلمة المرور", () => {
  it("مستخدم طبيعي: المسار محمي يعمل", async () => {
    expect(await flag()).toBe(false);
    expect(await callProtectedApi()).toBe(200);
  });

  it("عند الإجبار: المسار محمي يُرفض 403، وتغيير كلمة المرور نفسه متاح", async () => {
    await prisma.user.update({
      where: { id: userId },
      data: { mustChangePassword: true },
    });
    expect(await flag()).toBe(true);
    expect(await callProtectedApi()).toBe(403);
    // القرار على مستوى المسارات (middleware) يسمح بالوصول لصفحة التغيير
    const { resolvePasswordGate } = await import("@/lib/password-gate");
    expect(resolvePasswordGate({ mustChangePassword: true, pathname: "/change-password" })).toBeNull();
  });

  it("كلمة مرور حالية خاطئة لا تمسح الإجبار", async () => {
    const out = await changeMyPassword("WrongPass@000", NEW_PASSWORD, NEW_PASSWORD);
    expect(out.success).toBe(false);
    if (!out.success) expect(out.error).toContain("غير صحيحة");
    expect(await flag()).toBe(true);
    expect(await callProtectedApi()).toBe(403);
  });

  it("كلمة مرور ضعيفة تُرفض بالعربية", async () => {
    const out = await changeMyPassword(OLD_PASSWORD, "123", "123");
    expect(out.success).toBe(false);
    if (!out.success) expect(out.error).toContain("كلمة المرور ضعيفة");
    expect(await flag()).toBe(true);
  });

  it("بعد التغيير: الإجبار يُمسح في DB ويعود المسار للعمل", async () => {
    const out = await changeMyPassword(OLD_PASSWORD, NEW_PASSWORD, NEW_PASSWORD);
    expect(out.success).toBe(true);
    expect(await flag()).toBe(false);
    expect(await callProtectedApi()).toBe(200);
  });

  it("كلمة المرور الجديدة مُخزَّنة مُشفَّرة (ليست نصاً صريحاً)", async () => {
    const row = await prisma.user.findUniqueOrThrow({
      where: { id: userId },
      select: { password: true },
    });
    expect(row.password).not.toBe(NEW_PASSWORD);
    expect(row.password.startsWith("$2")).toBe(true);
    expect(await bcrypt.compare(NEW_PASSWORD, row.password)).toBe(true);
    expect(await bcrypt.compare(OLD_PASSWORD, row.password)).toBe(false);
  });
});
