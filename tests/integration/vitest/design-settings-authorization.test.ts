import { describe, it, expect, beforeAll, afterAll, vi } from "vitest";
import { config as loadEnv } from "dotenv";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import type { Prisma } from "@prisma/client";

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

  // ------------------------------------------------------------
  // الكتابة: لا يوجد أي معرّف جهة في عقد الإدخال — المصدر هو الجلسة
  // ------------------------------------------------------------
  it("معرّف الجهة غير جزء من عقد الإدخال (tenantId من الجلسة حصراً)", () => {
    const src = readFileSync(
      join(process.cwd(), "lib/actions/settings-actions.ts"),
      "utf8"
    );
    const marker = "export async function updateTenantDesignSettings(input: {";
    const start = src.indexOf(marker);
    expect(start).toBeGreaterThan(-1);
    const paramEnd = src.indexOf("}): Promise<{ success: boolean }> {", start);
    expect(paramEnd).toBeGreaterThan(start);
    // عقد الإدخال لا يحوي أي معرّف جهة
    expect(src.slice(start, paramEnd)).not.toContain("tenantId");
    // والتعيين يسبق أول لمس لـ prisma داخل جسم الدالة
    const nextExport = src.indexOf("\nexport async function", paramEnd);
    const body = src.slice(paramEnd, nextExport === -1 ? undefined : nextExport);
    const assignAt = body.indexOf("const tenantId = requireTenantId(user);");
    const firstPrismaAt = body.indexOf("prisma.tenantDesignSettings");
    expect(assignAt).toBeGreaterThan(-1);
    expect(firstPrismaAt).toBeGreaterThan(assignAt);
    // ولا تمرير معرّف جهة من الطلب في أي مكان
    expect(body).not.toContain("input.tenantId");
  });

  it("غير ADMIN يُرفض في تحديث إعدادات التصميم", async () => {
    for (const email of [
      "fx50436-head@e2e.exp.local",
      "fx50436-examiner1@e2e.exp.local",
      "fx50436-specialist@e2e.exp.local",
    ]) {
      session.userId = await userIdByEmail(email);
      await expectRefusal(
        settings.updateTenantDesignSettings({ primaryColor: "#000000" })
      );
    }
    session.userId = null;
    await expectRefusal(
      settings.updateTenantDesignSettings({ primaryColor: "#000000" })
    );
  });

  it("ADMIN يكتب في جهته فقط — لا يمسّ أي جهة أخرى", async () => {
    // لقطة لإعدادات جهة أخرى قبل الكتابة (سواء وُجد صف أو لم يوجد)
    const otherBefore = await prisma.tenantDesignSettings.findUnique({
      where: { tenantId: OTHER_TENANT },
      select: { tokens: true },
    });

    session.userId = tempAdminId;
    const res = await settings.updateTenantDesignSettings({
      primaryColor: "#0a5c63",
    });
    expect(res.success).toBe(true);

    const ownRow = await prisma.tenantDesignSettings.findUniqueOrThrow({
      where: { tenantId: tempTenantId },
      select: { tokens: true },
    });
    expect(
      (ownRow.tokens as Record<string, string>).primaryColor
    ).toBe("#0a5c63");

    // الجهة الأخرى لم تُمَسّ إطلاقاً
    const otherAfter = await prisma.tenantDesignSettings.findUnique({
      where: { tenantId: OTHER_TENANT },
      select: { tokens: true },
    });
    expect(otherAfter).toEqual(otherBefore);
  });

  it("مسؤول 50436 يكتب في جهته (50436) فقط — الـtenant المؤقت لا يُمَس", async () => {
    // لا وجود لمعرّف جهة في الإدخال: الكتابة تسير حتماً إلى جهة الجلسة
    const tempBefore = await prisma.tenantDesignSettings.findUnique({
      where: { tenantId: tempTenantId },
      select: { tokens: true },
    });
    const ownBefore = await prisma.tenantDesignSettings.findUnique({
      where: { tenantId: OWN_TENANT },
      select: { tokens: true },
    });

    session.userId = await userIdByEmail("fx50436-admin@e2e.exp.local");
    const res = await settings.updateTenantDesignSettings({ primaryColor: "#010203" });
    expect(res.success).toBe(true);

    // سجل الجهة المؤقت لم يتغيّر إطلاقاً
    const tempAfter = await prisma.tenantDesignSettings.findUnique({
      where: { tenantId: tempTenantId },
      select: { tokens: true },
    });
    expect(tempAfter).toEqual(tempBefore);

    // والتغيير وقع في سجل جهة الجلسة (50436)
    const ownAfter = await prisma.tenantDesignSettings.findUnique({
      where: { tenantId: OWN_TENANT },
      select: { tokens: true },
    });
    expect(ownAfter).not.toEqual(ownBefore);
    expect((ownAfter?.tokens as Record<string, string>).primaryColor).toBe(
      "#010203"
    );

    // إعادة الحالة الأصلية حتى لا نلوّث خط الأساس
    if (ownBefore) {
      const original = ownBefore.tokens as Prisma.InputJsonValue;
      await prisma.tenantDesignSettings.update({
        where: { tenantId: OWN_TENANT },
        data: { tokens: original },
      });
    } else {
      await prisma.tenantDesignSettings.deleteMany({
        where: { tenantId: OWN_TENANT },
      });
    }
  });
});
