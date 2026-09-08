import { test } from "node:test";
import assert from "node:assert/strict";

// ============================================================
// اختبار CSV Injection / Formula Injection
// الخانات القادمة من بيانات الطلاب (أسماء، هواتف، عناوين) يجب
// ألا تحتوي صيغ Excel ضارة عند تصديرها من /api/export
// ============================================================

// نسخة مطابقة لمنطق escape الموجود في app/api/export/route.ts
function escapeCSV(v: unknown): string {
  const s = String(v ?? "");
  // OWASP CSV Injection (CWE-1236): تحييد بادئات صيغ Excel
  const neutralized = /^[=+\-@\t\r]/.test(s) ? `'${s}` : s;
  return /[",\n]/.test(neutralized)
    ? `"${neutralized.replace(/"/g, '""')}"`
    : neutralized;
}

test("CSV: صيغ Excel الضارة تُبطّل (Formula Injection)", () => {
  assert.deepEqual(escapeCSV("=cmd|' /C calc'!A0"), "'=cmd|' /C calc'!A0");
  // بعد إزالة علامات الاقتباس المحيطة (Excel يراها خلية نصية)
  const plus = escapeCSV("+SUM(1,1)").replace(/^"|"$/g, "");
  assert.equal(plus.startsWith("'"), true);
  // الخلية لا تبدأ بأي بادئة صيغة (لن ينفّذ Excel الصيغة)
  assert.equal(/^[-+=@]/.test(plus), false);
  assert.deepEqual(escapeCSV("-1+1"), "'-1+1");
  const at = escapeCSV("@SUM(1,1)").replace(/^"|"$/g, "");
  assert.equal(at.startsWith("'"), true);
});

test("CSV: القيم العادية تبقى كما هي", () => {
  assert.deepEqual(escapeCSV("أحمد"), "أحمد");
  assert.deepEqual(escapeCSV(12), "12");
  assert.deepEqual(escapeCSV("0599999999"), "0599999999");
});

test("CSV: الفواصل والاقتباسات تُهرب بشكل صحيح", () => {
  assert.deepEqual(escapeCSV('طالب, "خاص"'), '"طالب, ""خاص"""');
  assert.deepEqual(escapeCSV("سطر\nجديد"), '"سطر\nجديد"');
});