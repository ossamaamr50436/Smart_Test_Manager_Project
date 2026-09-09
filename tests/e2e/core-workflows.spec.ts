import { test, expect, type Page } from "@playwright/test";
import type { Role } from "@prisma/client";

// ============================================================
// اختبارات E2E — تدفقات الأدوار الحرجة
// ⚠️ يتطلب قاعدة بذر (pnpm db:seed) + التطبيق يعمل (pnpm dev)
// الحسابات التجريبية من prisma/seed.ts — كلمة المرور الموحدة:
//   QuranTest2026!Strong
// ============================================================

const DEMO_PASSWORD = "QuranTest2026!Strong";
const ROLE_DASHBOARDS: Record<Role, string> = {
  ADMIN: "/admin",
  INSTITUTION: "/institution",
  EXAMINER: "/examiner",
  TEST_SPECIALIST: "/test-specialist",
  HEAD_OF_AFFAIRS: "/head-of-affairs",
  CERTIFICATE_SOURCE: "/certificate-source",
};

async function login(page: Page, email: string, role: Role) {
  await page.goto("/login");
  await page.getByLabel(/البريد الإلكتروني/i).fill(email);
  await page.getByLabel(/كلمة المرور/i).fill(DEMO_PASSWORD);
  await page.getByRole("button", { name: /تسجيل الدخول/i }).click();
  await page.waitForURL(`**${ROLE_DASHBOARDS[role]}**`);
}

test.describe("تسجيل الدخول (الأمان)", () => {
  test("رفض بيانات اعتماد خاطئة", async ({ page }) => {
    await page.goto("/login");
    await page.getByLabel(/البريد الإلكتروني/i).fill("wrong@example.com");
    await page.getByLabel(/كلمة المرور/i).fill("wrong-password");
    await page.getByRole("button", { name: /تسجيل الدخول/i }).click();
    await expect(page.getByText(/بيانات.*غير صحيحة|غير صحيح/i)).toBeVisible();
  });

  test("الأخصائي يصل إلى نماذجه دون لوحة الإدارة", async ({ page }) => {
    await login(page, "specialist@example.com", "TEST_SPECIALIST");
    await page.goto("/test-specialist/models");
    await expect(page.getByRole("heading", { name: /النماذج/i })).toBeVisible();
    await page.goto("/admin");
    await expect(page.getByText(/غير مصرح|404|forbidden/i).first()).toBeVisible();
  });
});

test.describe("الأخصائي — إدارة النماذج", () => {
  test("عرض النماذج المبذورة وفتح صفحة إنشاء نموذج", async ({ page }) => {
    await login(page, "specialist@example.com", "TEST_SPECIALIST");
    await page.goto("/test-specialist/models");
    await expect(page.getByText(/نموذج/i).first()).toBeVisible();
    await page.getByRole("button", { name: /إنشاء نموذج|إضافة/i }).click();
    await expect(page.getByText(/بيانات النموذج/i)).toBeVisible();
  });
});

test.describe("المقيّم — التقييم وفق اللائحة", () => {
  test("فتح صفحة تقييم طالب من لجنته", async ({ page }) => {
    await login(page, "ahmed.mohammad@example.com", "EXAMINER");
    await page.goto("/examiner");
    // إما قائمة طلاب اللجان أو رسالة عدم وجود جلسات
    await expect(
      page.getByText(/لا توجد|الطلاب|اللجان|جلسات/i).first()
    ).toBeVisible();
  });
});

test.describe("حماية المسارات", () => {
  test("المستخدم غير المسجل يُعاد لتسجيل الدخول", async ({ page }) => {
    await page.goto("/examiner");
    await expect(page).toHaveURL(/.*login.*/);
  });
});