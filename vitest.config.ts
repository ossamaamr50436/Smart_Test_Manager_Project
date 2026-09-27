import { defineConfig } from "vitest/config";
import path from "node:path";

export default defineConfig({
  resolve: {
    alias: [
      { find: "@", replacement: path.resolve(__dirname, ".") },
      { find: "server-only", replacement: path.resolve(__dirname, "tests/vitest-stubs/server-only.ts") },
      // Next.js لا يستخدم حزمة `react` من node_modules بل نسخته المدمجة
      // (‎19.2 canary‎). نحاكي ذلك هنا حتى تُشغَّل اختبارات الخادم بنفس
      // بيئة React الفعلية (وهي البيئة التي سبّبت خطأ #31 في M38).
      { find: /^react$/, replacement: path.resolve(__dirname, "node_modules/next/dist/compiled/react") },
    ],
  },
  test: {
    environment: "node",
    // اختبارات الوحدة + اختبارات تكاملية تعمل على vitest (تحتاج محمّلًا
    // يحمّل تبعيات @react-pdf عبر require الأصلي). بقية ملفات
    // tests/integration تعمل عبر `tsx --test` (node:test).
    include: ["tests/unit/**/*.test.ts", "tests/integration/vitest/**/*.test.ts"],
    exclude: ["node_modules", "tests/security", "tests/e2e"],
  },
});