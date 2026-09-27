import { describe, it, expect, beforeAll, afterAll, vi } from "vitest";
import { config as loadEnv } from "dotenv";

loadEnv({ path: ".env" });

// ============================================================
// G — عزل إعدادات التصميم على مستوى الـtenant
// - دالة المصادقة تتغير بين كل حالة (لا نغيّر قاعدة بيانات الـbaseline)
// - prisma حقيقي + @/auth مُموَّه => نختبر بعدد الأخطاء الحقيقي
// - أي كتابة تجري داخل tenant مؤقت يُنشأ ويُحذف في نفس الملف
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

const OWN_TENANT = "cmubnu64m0000e6dfmj3fkmg3"; // 50436
const OTHER_TENANT = "cmu5ngaxg0000to23u132olty"; // 12345

let prisma: typeof import("@/lib/prisma")["prisma"];
let settings: typeof import("@/lib/actions/settings-actions");

const stamp = Date.now().toString(36);
const TEMP_TENANT_NAME = `gx-design-${stamp}`;
const TEMP_TENANT_SLUG = `gx-design-${stamp}`;
let tempTenantId: string;
let tempAdminId: string;

async function userIdByEmail(email: string): Promise<string> {
  const row = await prisma.user.findUniqueOrThrow({
    where: { email },
    select: { id: true, tenantId: true },
  });
  if (!row.tenantId) throw new Error(`الحساب بلا tenant: ${email}`);
  return row.id;
}

/** رفض: يرمي من طبقة الصلاحيات أو يعيد { success:false } */
async function expectRefusal(promise: Promise<unknown>): Promise<void> {
  try {
    const out = (await promise) as { success?: boolean } | undefined;
    if (out && out.success === false) return;
  } catch {
    return;
  }
  throw new Error("كان متوقعاً رفض العملية لكنها نجحت (تسريب عبر tenant!)");
}

beforeAll(async () => {
  ({ prisma } = await import("@/lib/prisma"));
  settings = await import("@/lib/actions/settings-actions");

  // tenant مؤقت مع مسؤوله — لا نمس بيانات الـbaseline إطلاقاً
  const tenant = await prisma.tenant.create({
    data: { name: TEMP_TENANT_NAME, slug: TEMP_TENANT_SLUG },
    select: { id: true },
  });
  tempTenantId = tenant.id;
  const admin = await prisma.user.create({
    data: {
      name: "مسؤول تصميم مؤقت",
      email: `gx-design-${stamp}@e2e.exp.local`,
      password: "$2a$10$abcdefghijklmnopqrstuvwxyz0123456789ABCDEFGHIJKLMNOPQR",
      role: "ADMIN",
      birthDate: new Date("1990-01-01"),
      tenantId: tempTenantId,
    },
    select: { id: true },
  });
  tempAdminId = admin.id;
}, 120_000);

afterAll(async () => {
  if (!prisma) return;
  await prisma.tenantDesignSettings.deleteMany({ where: { tenantId: tempTenantId } });
  await prisma.user.deleteMany({ where: { tenantId: tempTenantId } });
  await prisma.tenant.deleteMany({ where: { id: tempTenantId } });
  await prisma.$disconnect();
});

describe("G — عزل إعدادات التصميم", () => {
  it("يرفض الطلب بلا جلسة (غير مسجّل دخول)", async () => {
    session.userId = null;
    await expectRefusal(settings.getTenantDesignSettings(OWN_TENANT));
    await expectRefusal(settings.getMyTenantDesignTokens());
  });

  it("مسؤول نفس الـtenant يقرأ إعداداته", async () => {
    session.userId = await userIdByEmail("fx50436-admin@e2e.exp.local");
    const out = await settings.getTenantDesignSettings(OWN_TENANT);
    expect(out.tokens).toBeTypeOf("object");
    expect(out.tokens.primaryColor).toMatch(/^#[0-9a-fA-F]{6}$/);
  });

  it("يرفض مسؤول طلب tenant آخر (تسريب أفقي)", async () => {
    session.userId = await userIdByEmail("fx50436-admin@e2e.exp.local");
    await expectRefusal(settings.getTenantDesignSettings(OTHER_TENANT));
  });

  it("يرفض مسؤولاً عند تمرير معرّف جهة غير مملوك", async () => {
    session.userId = await userIdByEmail("fx50436-admin@e2e.exp.local");
    await expectRefusal(settings.getTenantDesignSettings("cmuZZZZZZZZZZZZZZZZZZZZZZZ"));
  });

  it("طلب بلا معرّف جهة يعيد افتراضيات المنصة فقط (لا بيانات مستأجر)", async () => {
    session.userId = await userIdByEmail("fx50436-admin@e2e.exp.local");
    const out = await settings.getTenantDesignSettings("   ");
    expect(out.hasOverrides).toBe(false);
    expect(out.tokens.primaryColor).toBe("#015e63");
  });

  it("SUPER_ADMIN يقرأ أي tenant", async () => {
    const superAdmin = await prisma.user.findFirstOrThrow({
      where: { role: "SUPER_ADMIN" },
      orderBy: { createdAt: "asc" },
      select: { id: true },
    });
    session.userId = superAdmin.id;
    const out = await settings.getTenantDesignSettings(OTHER_TENANT);
    expect(out.tokens).toBeTypeOf("object");
  });

  it("getMyTenantDesignTokens يقرأ جهة المستخدم فقط بلا معامل", async () => {
    session.userId = await userIdByEmail("fx50436-specialist@e2e.exp.local");
    const out = await settings.getMyTenantDesignTokens();
    expect(out).not.toBeNull();
    expect(out?.primaryColor).toMatch(/^#[0-9a-fA-F]{6}$/);
  });

  it("مصدر القراءة هو الخادم: دمج قائمة بيضاء من DB (لا مدخلات عميل)", async () => {
    // داخل الـtenant المؤقت: نكتب تجاوزاً مع مفتاح غير معروف
    await prisma.tenantDesignSettings.upsert({
      where: { tenantId: tempTenantId },
      create: {
        tenantId: tempTenantId,
        tokens: { primaryColor: "#123456", __gxTest: "server-only" },
        updatedBy: tempAdminId,
      },
      update: {
        tokens: { primaryColor: "#123456", __gxTest: "server-only" },
        updatedBy: tempAdminId,
      },
    });

    session.userId = tempAdminId;
    const out = await settings.getTenantDesignSettings(tempTenantId);
    expect(out.hasOverrides).toBe(true);
    expect(out.tokens.primaryColor).toBe("#123456");
    // المفتاح غير المعروف لا يُعاد دمجه — القائمة بيضاء
    expect(Object.keys(out.tokens)).not.toContain("__gxTest");

    // وغير مخوَّل: مسؤول من الـbaseline لا يستطيع قراءة الـtenant المؤقت
    session.userId = await userIdByEmail("fx50436-admin@e2e.exp.local");
    await expectRefusal(settings.getTenantDesignSettings(tempTenantId));
  });
});
