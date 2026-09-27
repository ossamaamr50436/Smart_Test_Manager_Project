import { describe, it, expect, beforeAll, afterAll, beforeEach, vi } from "vitest";
import { config as loadEnv } from "dotenv";

// تحميل متغيرات البيئة كما تفعل Next.js (Prisma يحتاجها)
loadEnv({ path: ".env" });

// ============================================================
// F — Import Models Validation (server-side) + بوابة تغيير كلمة المرور
// ------------------------------------------------------------
// يشغّل مسار `/api/import/models` الحقيقي (Route Handler) مع Prisma
// حقيقي وهوية جلسة مُموَّهة فقط — بلا متصفح وبلا فتح أي منفذ.
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

// حد معدل الطلبات ليس частьاً من التحقق الذي نختبره — نعزله
// (جدول rate_limits في Neon: نافذة 15 دقيقة)
vi.mock("@/lib/rate-limit", () => ({
  checkRateLimit: async () => undefined,
  checkMultiLevelRateLimit: async () => undefined,
}));

// لا رفع ملفات فعلية في الاختبار
vi.mock("@/lib/file-storage", () => ({
  uploadFile: async () => ({ fileId: "test-file", url: "https://example.test/f.json" }),
  deleteFile: async () => undefined,
  isTrustedStoredUrl: () => true,
  isValidFileKey: () => true,
  isStoredUrl: () => true,
  downloadFileByUrl: async () => Buffer.from("x"),
}));

const ISOLATION_TENANT = "cmu5ngaxg0000to23u132olty";
const TEST_EMAIL = "fx-f-import@e2e.exp.local";

type PrismaClient = typeof import("@/lib/prisma")["prisma"];

let prisma: PrismaClient;
let POST: (req: Request) => Promise<Response>;
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

// نطاق أرقام النماذج الخاص بهذا الملف (حتى لا يصطدم بملف اختبار آخر
// يعمل بالتوازي على نفس الـtenant)
const MODEL_RANGE_START = 90;

async function freeModelNumber(): Promise<number> {
  const rows = await prisma.questionBankModel.findMany({
    where: { tenantId: ISOLATION_TENANT },
    select: { modelNumber: true },
  });
  const used = new Set(rows.map((r) => r.modelNumber));
  for (let n = MODEL_RANGE_START; n <= 100; n++) if (!used.has(n)) return n;
  throw new Error("لا يوجد رقم نموذج حر في النطاق المخصص للاختبار");
}

async function postImport(payload: unknown) {
  const res = await POST(
    new Request("http://localhost/api/import/models", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify(payload),
    })
  );
  const json: unknown = await res.json();
  return { status: res.status, json };
}

type ImportResult = {
  imported: number;
  failed: number;
  results: { modelNumber: number; ok: boolean; error?: string }[];
};

function body(json: unknown): ImportResult {
  const value = json as Partial<ImportResult>;
  expect(Array.isArray(value.results)).toBe(true);
  return value as ImportResult;
}

async function modelExists(modelNumber: number): Promise<boolean> {
  const row = await prisma.questionBankModel.findFirst({
    where: { tenantId: ISOLATION_TENANT, modelNumber },
    select: { id: true },
  });
  return row !== null;
}

beforeAll(async () => {
  ({ prisma } = await import("@/lib/prisma"));
  const route = await import("@/app/api/import/models/route");
  POST = route.POST;

  const user = await prisma.user.create({
    data: {
      name: "مستخدم اختبار الاستيراد",
      email: TEST_EMAIL,
      password: "$2a$10$abcdefghijklmnopqrstuvwxyz0123456789ABCDEFGHIJKLMNOPQR",
      role: "ADMIN",
      birthDate: new Date("1990-01-01"),
      tenantId: ISOLATION_TENANT,
    },
    select: { id: true },
  });
  userId = user.id;
  session.userId = user.id;
}, 120_000);

beforeEach(async () => {
  // كل حالة تبدأ من نفس الحالة: المستخدم غير مجبر على تغيير كلمة المرور
  await prisma.user.update({
    where: { id: userId },
    data: { mustChangePassword: false },
  });
  session.userId = userId;
});

afterAll(async () => {
  if (prisma) {
    await prisma.questionBankModel.deleteMany({
      where: { tenantId: ISOLATION_TENANT, modelNumber: { gte: MODEL_RANGE_START } },
    });
    await prisma.user.deleteMany({ where: { email: TEST_EMAIL } });
    await prisma.$disconnect();
  }
});

describe("F — /api/import/models: تحقق server-side كامل", () => {
  it("يقبل استيراداً صحيحاً (5 مقاطع) ويكتبه فعلاً في DB", async () => {
    const modelNumber = await freeModelNumber();
    const { status, json } = await postImport([
      { modelNumber, branch: "5", segmentsCount: 5, details: { segments: segments(5) } },
    ]);
    expect(status).toBe(200);
    const out = body(json);
    expect(out.results[0]?.ok).toBe(true);
    expect(out.imported).toBe(1);

    const saved = await prisma.questionBankModel.findFirst({
      where: { tenantId: ISOLATION_TENANT, modelNumber },
      select: { segmentsCount: true, detailsJSON: true },
    });
    expect(saved).toBeTruthy();
    expect(saved?.segmentsCount).toBe(5);
    expect(
      Array.isArray((saved?.detailsJSON as { segments?: unknown[] }).segments)
    ).toBe(true);
    expect(await modelExists(modelNumber)).toBe(true);

    await prisma.questionBankModel.deleteMany({
      where: { tenantId: ISOLATION_TENANT, modelNumber },
    });
  });

  it("يقبل 10 مقاطع (الحد الأقصى) — الحد الأعلى ليس خطأ", async () => {
    const modelNumber = await freeModelNumber();
    const { status, json } = await postImport([
      { modelNumber, branch: "10", segmentsCount: 10, details: { segments: segments(10) } },
    ]);
    expect(status).toBe(200);
    expect(body(json).results[0]?.ok).toBe(true);
    expect(await modelExists(modelNumber)).toBe(true);
    await prisma.questionBankModel.deleteMany({
      where: { tenantId: ISOLATION_TENANT, modelNumber },
    });
  });

  it("يرفض أكثر من 10 مقاطع بلا أي mutation في DB", async () => {
    const modelNumber = await freeModelNumber();
    const { json } = await postImport([
      { modelNumber, branch: "5", segmentsCount: 11, details: { segments: segments(11) } },
    ]);
    const out = body(json);
    expect(out.results[0]?.ok).toBe(false);
    expect(out.results[0]?.error).toContain("10");
    expect(out.imported).toBe(0);
    expect(await modelExists(modelNumber)).toBe(false);
  });

  it("يرفض صفر مقاطع (segmentsCount = 0) بلا mutation — لم يعد يُقبل 0", async () => {
    const modelNumber = await freeModelNumber();
    const { json } = await postImport([
      { modelNumber, branch: "5", segmentsCount: 0, details: { segments: [] } },
    ]);
    const out = body(json);
    expect(out.results[0]?.ok).toBe(false);
    expect(out.imported).toBe(0);
    expect(await modelExists(modelNumber)).toBe(false);
  });

  it("المخطط نفسه (مصدر الحقيقة) يرفض أقل من 5 مقاطع — ليس تحققاً في المسار فقط", async () => {
    const { importQuestionBankSchema, IMPORT_MIN_SEGMENTS } = await import(
      "@/lib/validations/question-bank"
    );
    expect(IMPORT_MIN_SEGMENTS).toBe(5);
    for (const n of [0, 1, 2, 3, 4]) {
      const parsed = importQuestionBankSchema.safeParse({
        modelNumber: 50,
        branch: "5",
        segmentsCount: n,
        segments: segments(Math.max(n, 0)),
      });
      expect(parsed.success, `${n} مقطع يجب أن يُرفض`).toBe(false);
    }
    const ok = importQuestionBankSchema.safeParse({
      modelNumber: 50,
      branch: "5",
      segmentsCount: 5,
      segments: segments(5),
    });
    expect(ok.success).toBe(true);
  });

  it("يرفض 3 مقاطع عبر المسار الحقيقي (F: أقل من 5 مرفوض)", async () => {
    const modelNumber = await freeModelNumber();
    const { json } = await postImport([
      { modelNumber, branch: "5", segmentsCount: 3, details: { segments: segments(3) } },
    ]);
    const out = body(json);
    expect(out.results[0]?.ok).toBe(false);
    expect(out.results[0]?.error).toContain("5");
    expect(await modelExists(modelNumber)).toBe(false);
  });

  it("يرفض بنية segments غير صحيحة (حقل ناقص) بلا mutation", async () => {
    const modelNumber = await freeModelNumber();
    const broken = segments(5) as Record<string, unknown>[];
    delete broken[0]?.fromText;
    const { json } = await postImport([
      { modelNumber, branch: "5", segmentsCount: 5, details: { segments: broken } },
    ]);
    const out = body(json);
    expect(out.results[0]?.ok).toBe(false);
    expect(out.results[0]?.error).toContain("«من قوله تعالى» مطلوب");
    expect(await modelExists(modelNumber)).toBe(false);
  });

  it("يرفض ترقيماً غير تسلسلي بلا mutation", async () => {
    const modelNumber = await freeModelNumber();
    const misnumbered = segments(5).map((s, i) => ({ ...s, number: i === 3 ? 9 : i + 1 }));
    const { json } = await postImport([
      { modelNumber, branch: "5", segmentsCount: 5, details: { segments: misnumbered } },
    ]);
    const out = body(json);
    expect(out.results[0]?.ok).toBe(false);
    expect(out.results[0]?.error).toContain("تسلسلياً");
    expect(await modelExists(modelNumber)).toBe(false);
  });

  it("يرفض عدم تطابق segmentsCount مع العدد الفعلي بلا mutation", async () => {
    const modelNumber = await freeModelNumber();
    // معلن 6 ومُدخَل 5 — كلاهما داخل النطاق 5..10 فيمر المخطط،
    //فيتولى المسار كشف عدم التطابق
    const { json } = await postImport([
      { modelNumber, branch: "5", segmentsCount: 6, details: { segments: segments(5) } },
    ]);
    const out = body(json);
    expect(out.results[0]?.ok).toBe(false);
    expect(out.results[0]?.error).toContain("لا يطابق");
    expect(await modelExists(modelNumber)).toBe(false);
  });

  it("يرفض فرعاً غير موجود، ولا يكتب أي عنصر من الدفعة", async () => {
    const good = await freeModelNumber();
    const { json } = await postImport([
      { modelNumber: good, branch: "7", segmentsCount: 5, details: { segments: segments(5) } },
    ]);
    const out = body(json);
    expect(out.results[0]?.ok).toBe(false);
    expect(out.results[0]?.error).toContain("الفرع غير صالح");
    expect(await modelExists(good)).toBe(false);
  });

  it("يرفض الدفعة كلها إن لم يمر أي عنصر (لا import جزئي صامت)", async () => {
    const { json } = await postImport([
      { modelNumber: 90, branch: "5", segmentsCount: 99, details: { segments: segments(2) } },
      { modelNumber: 91, branch: "5", segmentsCount: 4, details: { segments: segments(2) } },
    ]);
    const out = body(json);
    expect(out.imported).toBe(0);
    expect(out.results.every((r) => r.ok === false)).toBe(true);
    expect(await modelExists(90)).toBe(false);
    expect(await modelExists(91)).toBe(false);
  });

  it("يرفض الدفعة غير المصفوفة بـ400", async () => {
    const { status, json } = await postImport({ modelNumber: 1 });
    expect(status).toBe(400);
    expect((json as { error?: string }).error).toContain("مصفوفة");
  });

  it("يمنع المستخدم المُجبر على تغيير كلمة المرور (403) بلا mutation", async () => {
        await prisma.user.update({
      where: { id: userId },
      data: { mustChangePassword: true },
    });
    const modelNumber = await freeModelNumber();
    const { status, json } = await postImport([
      { modelNumber, branch: "5", segmentsCount: 5, details: { segments: segments(5) } },
    ]);
    expect(status).toBe(403);
    expect((json as { error?: string }).error).toBe("غير مصرح");
    expect(await modelExists(modelNumber)).toBe(false);
  });
});
