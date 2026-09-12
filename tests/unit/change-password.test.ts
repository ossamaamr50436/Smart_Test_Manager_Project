import { describe, it, expect, vi, beforeEach } from "vitest";
import bcrypt from "bcryptjs";
import { changeMyPassword } from "@/lib/actions/change-password-actions";
import { prisma } from "@/lib/prisma";

vi.mock("@/lib/security", () => ({
  requireUser: vi.fn(async () => ({
    id: "user-1",
    role: "ADMIN",
    email: "admin@example.com",
    name: "المسؤول",
    institutionId: null,
  })),
}));

vi.mock("@/lib/rate-limit", () => ({
  checkRateLimit: vi.fn(async () => {}),
}));

vi.mock("next/cache", () => ({
  revalidatePath: vi.fn(),
}));

vi.mock("@/lib/prisma", () => {
  return {
    prisma: {
      user: {
        findUnique: vi.fn(async () => null),
        update: vi.fn(async () => ({})),
      },
      auditLog: {
        create: vi.fn(async () => ({})),
      },
      $transaction: vi.fn(
        async (callback: (tx: unknown) => Promise<unknown>) => {
          return callback({
            user: { update: vi.fn(async () => ({})) },
            auditLog: { create: vi.fn(async () => ({})) },
          });
        }
      ),
    },
  };
});

const CURRENT_PASSWORD = "CurrentPass1";
const findUniqueMock = prisma.user.findUnique as ReturnType<typeof vi.fn>;

function asString(v: unknown): string {
  return typeof v === "string" ? v : "";
}

beforeEach(async () => {
  vi.clearAllMocks();
  const currentHash = await bcrypt.hash(CURRENT_PASSWORD, 4);
  findUniqueMock.mockImplementation(async () => ({
    id: "user-1",
    password: currentHash,
  }));
});

describe("changeMyPassword — حالات الخطأ بالعربية", () => {
  it("كلمة جديدة = الحالية ← رسالة الفرق بينهما", async () => {
    const result = await changeMyPassword(CURRENT_PASSWORD, CURRENT_PASSWORD, CURRENT_PASSWORD);
    expect(result.success).toBe(false);
    if (result.success) return;
    expect(asString(result.error)).toContain("يجب أن تختلف");
  });

  it("كلمتان غير متطابقتين ← رسالة عدم التطابق", async () => {
    const result = await changeMyPassword(CURRENT_PASSWORD, "NewPass1", "Different1");
    expect(result.success).toBe(false);
    if (result.success) return;
    expect(asString(result.error)).toContain("غير متطابقتين");
  });

  it("كلمة مرور ضعيفة (قصيرة) ← رسالة ضعف كلمة المرور", async () => {
    const result = await changeMyPassword(CURRENT_PASSWORD, "Ab1", "Ab1");
    expect(result.success).toBe(false);
    if (result.success) return;
    expect(asString(result.error)).toContain("كلمة المرور ضعيفة");
  });

  it("كلمة حالية خاطئة ← رسالة غير صحيحة", async () => {
    const result = await changeMyPassword("WrongPass1", "NewPass1", "NewPass1");
    expect(result.success).toBe(false);
    if (result.success) return;
    expect(asString(result.error)).toContain("غير صحيحة");
  });
});

describe("changeMyPassword — النجاح", () => {
  it("كلمة مرور صحيحة كاملة ← نجاح", async () => {
    const result = await changeMyPassword(CURRENT_PASSWORD, "NewPass1", "NewPass1");
    expect(result.success).toBe(true);
  });
});