import { test } from "node:test";
import assert from "node:assert/strict";
import { buildCsp } from "../../lib/csp";

// ============================================================
// اختبارات سياسة أمان المحتوى (CSP)
// يجب ألا تسمح CSP بتنفيذ كود JavaScript غير منسوب أو من مصادر خارجية
// ============================================================

test("CSP: لا يحتوي على unsafe-inline أو unsafe-eval في script-src", () => {
  const csp = buildCsp("test-nonce-123");
  assert.match(csp, /script-src 'self' 'nonce-test-nonce-123'/);
  const scriptSection = csp.split(";").find((p) => p.trim().startsWith("script-src"));
  assert.ok(scriptSection, "يجب وجود script-src");
  assert.ok(!scriptSection.includes("unsafe-inline"), "ممنوع unsafe-inline في script-src");
  assert.ok(!scriptSection.includes("unsafe-eval"), "ممنوع unsafe-eval في script-src");
});

test("CSP: يقيّد sources أخرى بطريقة آمنة", () => {
  const csp = buildCsp("n1");
  assert.match(csp, /default-src 'self'/);
  assert.match(csp, /object-src 'none'/);
  assert.match(csp, /frame-ancestors 'none'/);
  assert.match(csp, /base-uri 'self'/);
  assert.match(csp, /form-action 'self'/);
  assert.match(csp, /upgrade-insecure-requests/);
});

test("CSP: كل nonce مختلف ينتج CSP مختلفاً (منع إعادة الاستخدام)", () => {
  const csp1 = buildCsp("nonce-aaa");
  const csp2 = buildCsp("nonce-bbb");
  assert.notEqual(csp1, csp2);
});