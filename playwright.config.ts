import { defineConfig, devices } from "@playwright/test";

// ============================================================
// إعداد اختبارات E2E (Playwright)
// التشغيل: pnpm test:e2e  (يتطلب تشغيل التطبيق أولاً + تثبيت المتصفح)
//   pnpm e2e:install  → لتثبيت متصفحات Playwright
// ============================================================
export default defineConfig({
  testDir: "tests/e2e",
  fullyParallel: true,
  forbidOnly: !!process.env.CI,
  retries: process.env.CI ? 2 : 0,
  reporter: "list",
  timeout: 30_000,
  use: {
    baseURL: process.env.E2E_BASE_URL ?? "http://localhost:3000",
    trace: "on-first-retry",
    screenshot: "only-on-failure",
    locale: "ar-SA",
  },
  projects: [
    {
      name: "chromium",
      use: { ...devices["Desktop Chrome"] },
    },
  ],
  webServer: process.env.CI
    ? {
        command: "pnpm build && pnpm start",
        url: "http://localhost:3000",
        reuseExistingServer: !process.env.CI,
        timeout: 120_000,
      }
    : undefined,
});