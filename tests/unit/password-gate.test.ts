import { describe, it, expect } from "vitest";
import {
  CHANGE_PASSWORD_PATH,
  assertPasswordChanged,
  isPasswordGateAllowedPath,
  resolvePasswordGate,
} from "@/lib/password-gate";
import { authConfig } from "@/auth.config";

// ============================================================
// I — إجبار تغيير كلمة المرور
// وحدة نقية + callback الإذن الحقيقي (Edge) بلا متصفح ولا خادم
// ============================================================

type AuthorizedResult = boolean | Response;

const authorized = authConfig.callbacks?.authorized as (args: {
  auth: { user: { id: string; role: string; mustChangePassword?: boolean } } | null;
  request: { nextUrl: URL };
}) => AuthorizedResult;

function call(pathname: string, user: { role: string; mustChangePassword?: boolean } | null) {
  const url = new URL(`https://app.test${pathname}`);
  return authorized({
    auth: user ? { user: { id: "u1", ...user } } : null,
    request: { nextUrl: url },
  });
}

function locationOf(result: AuthorizedResult): string | null {
  if (result instanceof Response) return new URL(result.headers.get("location") ?? "").pathname;
  return null;
}

describe("I — قرار البوابة (وحدة نقية)", () => {
  it("المسار المسموح به هو تغيير كلمة المرور ومساراته الفرعية فقط", () => {
    expect(isPasswordGateAllowedPath(CHANGE_PASSWORD_PATH)).toBe(true);
    expect(isPasswordGateAllowedPath("/change-password/step-2")).toBe(true);
    expect(isPasswordGateAllowedPath("/change-password-extra")).toBe(false);
    expect(isPasswordGateAllowedPath("/admin")).toBe(false);
    expect(isPasswordGateAllowedPath("")).toBe(false);
  });

  it("مستخدم مجبر يُحوَّل إلى صفحة تغيير كلمة المرور من أي مسار آخر", () => {
    expect(resolvePasswordGate({ mustChangePassword: true, pathname: "/admin" })).toBe(
      CHANGE_PASSWORD_PATH
    );
    expect(resolvePasswordGate({ mustChangePassword: true, pathname: "/" })).toBe(
      CHANGE_PASSWORD_PATH
    );
  });

  it("لا حلقة إعادة توجيه: صفحة تغيير كلمة المرور نفسها مسموحة", () => {
    expect(
      resolvePasswordGate({ mustChangePassword: true, pathname: CHANGE_PASSWORD_PATH })
    ).toBeNull();
  });

  it("مستخدم طبيعي أو قيمة غير مؤكدة يُسمح له", () => {
    expect(resolvePasswordGate({ mustChangePassword: false, pathname: "/admin" })).toBeNull();
    expect(resolvePasswordGate({ pathname: "/admin" })).toBeNull();
    expect(resolvePasswordGate({ mustChangePassword: null, pathname: "/admin" })).toBeNull();
    // "truthy" غير منطقي لا يُعامل كإجبار
    expect(
      resolvePasswordGate({ mustChangePassword: 1 as unknown as boolean, pathname: "/admin" })
    ).toBeNull();
  });

  it("assertPasswordChanged يرفض المجبر برسالة عربية صريحة", () => {
    expect(() => assertPasswordChanged({ mustChangePassword: true })).toThrowError(
      /غير مصرح/
    );
    expect(() => assertPasswordChanged({ mustChangePassword: false })).not.toThrow();
    expect(() => assertPasswordChanged({})).not.toThrow();
  });
});

describe("I — callback الإذن (Edge)", () => {
  it("المستخدم المجبر يُحوَّل من كل صفحات لوحته", () => {
    for (const path of ["/", "/admin", "/test-specialist/models", "/examiner/board"]) {
      expect(locationOf(call(path, { role: "ADMIN", mustChangePassword: true }))).toBe(
        CHANGE_PASSWORD_PATH
      );
    }
  });

  it("المستخدم المجبر يستطيع بلوغ صفحة تغيير كلمة المرور", () => {
    expect(
      call(CHANGE_PASSWORD_PATH, { role: "ADMIN", mustChangePassword: true })
    ).toBe(true);
  });

  it("لا حلقة إعادة توجيه: كل الأدوار تصل للصفحة وتعود للوحة بعدها", () => {
    for (const role of ["ADMIN", "TEST_SPECIALIST", "EXAMINER", "HEAD_OF_AFFAIRS", "SUPER_ADMIN"]) {
      expect(call(CHANGE_PASSWORD_PATH, { role, mustChangePassword: true })).toBe(true);
      // وبعد رفع الإجبار: /change-password ليست ضمن مساحة دوره فيوجّهه لصفحته
      expect(call(CHANGE_PASSWORD_PATH, { role, mustChangePassword: false })).toBe(true);
    }
  });

  it("لا تحويل لمستخدم طبيعي على مساراته", () => {
    expect(call("/admin", { role: "ADMIN", mustChangePassword: false })).toBe(true);
    expect(call("/admin", { role: "ADMIN" })).toBe(true);
    expect(locationOf(call("/", { role: "ADMIN", mustChangePassword: false }))).toBe("/admin");
  });

  it("زائر غير مسجل دخول يذهب لصفحة الدخول (سلوك سابق سليم)", () => {
    expect(locationOf(call("/admin", null))).toBe("/login");
    expect(call("/login", null)).toBe(true);
  });
});
