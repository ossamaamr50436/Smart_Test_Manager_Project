import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import path from "node:path";
import { PDFDocument } from "pdf-lib";
import { generateCertificatePdfBuffer } from "@/lib/certificate-pdf";

// ============================================================
// توليد ملف الشهادة (M38) — اختبار وحدة
// ------------------------------------------------------------
// هذا هو بالضبط شرط الإنتاج: `@react-pdf/reconciler` يُحمَّل خارج
// حزمة Next.js، فيحلّ `react` إلى إصدار المشروع (18.2.0) ويستخدم
// مُوائِم React 18 الذي لا يقبل إلا عناصر `react.element`.
// أي اعتماد على JSX (عناصر من نسخة React المضمّنة في Next 19.x)
// يُسقط الإصدار بخطأ React رقم 31 و HTTP 500 — لذلك نتحقق هنا من:
//   1) أن التوليد ينجح داخل هذا السياق (شرط الإنتاج).
//   2) أن الناتج PDF حقيقي وغير فارغ وقابل للفك والتحليل.
//   3) أن المولّد لا يعود لي depend على React المحيط إطلاقًا.
// ============================================================

const FIXTURE = {
  studentName: "طالب ألف تجريبي 50436",
  finalScore: 95,
  issuedDate: new Date("2026-03-01T00:00:00.000Z"),
  serialNumber: "CERT-T50436-0001",
  managerName: "مدير الاختبارات",
  organizationName: "جهة تجريبية أوبن كود 50436",
};

describe("توليد ملف الشهادة", () => {
  it("ينجح في بيئة مُوائِم React 18 (شرط الإنتاج)", async () => {
    const buffer = await generateCertificatePdfBuffer(FIXTURE);
    expect(Buffer.isBuffer(buffer)).toBe(true);
    expect(buffer.byteLength).toBeGreaterThan(0);
  });

  it("ينتج ملف PDF حقيقيًا غير فارغ قابلًا للفك", async () => {
    const buffer = await generateCertificatePdfBuffer(FIXTURE);

    expect(buffer.subarray(0, 5).toString("latin1")).toBe("%PDF-");
    expect(buffer.byteLength).toBeGreaterThan(3000);

    const doc = await PDFDocument.load(buffer);
    expect(doc.getPageCount()).toBe(1);
    const page = doc.getPage(0)!;
    expect(page.getWidth()).toBeGreaterThan(0);
    expect(page.getHeight()).toBeGreaterThan(0);
  });

  it("يضمّن الخط العربي داخل الملف", async () => {
    const raw = (await generateCertificatePdfBuffer(FIXTURE)).toString("latin1");
    expect(raw).toContain("Amiri");
    expect(raw).toContain("FontFile");
  });

  it("لا يعتمد على React المحيط ولا على JSX", () => {
    const source = readFileSync(
      path.join(process.cwd(), "lib", "certificate-pdf.tsx"),
      "utf8"
    );

    expect(source).not.toMatch(/from\s+["']react["']/);
    expect(source).not.toMatch(/react\/jsx-(dev-)?runtime/);
    expect(source).not.toMatch(/=<\s*[A-Za-z]/);
    expect(source).toContain('Symbol.for("react.element")');
  });
});
