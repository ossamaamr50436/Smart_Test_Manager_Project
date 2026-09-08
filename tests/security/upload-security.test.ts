import { test } from "node:test";
import assert from "node:assert/strict";
import {
  validateMagicBytes,
  validateFileUpload,
} from "../../lib/upload-security";

// ============================================================
// اختبارات أمان رفع الملفات (File Upload Security)
// - التحقق من Magic Bytes لمنع رفع ملفات منسقة
// - التحقق من الحجم والنوع وأسماء الملفات
// ============================================================

test("Upload: يرفض ملفات لا تتطابق Magic Bytes مع النوع المعلن", () => {
  // محتوى ليس PDF لكن يدّعي أنه PDF
  const fakePdf = Buffer.from("NOT_PDF_CONTENT_BUT_RANDOM").slice(0, 4);
  assert.equal(validateMagicBytes(fakePdf, "application/pdf"), false);

  // ملف HTML يقدم نفسه كصورة PNG
  const fakePng = Buffer.from("<html><body>hi</body></html>").slice(0, 4);
  assert.equal(validateMagicBytes(fakePng, "image/png"), false);
});

test("Upload: يقبل ملفات صحيحة تطابق Magic Bytes", () => {
  // رأس PDF حقيقي: %PDF
  assert.equal(validateMagicBytes(Buffer.from("%PDF-1.4 test data"), "application/pdf"), true);
  // رأس PNG حقيقي: \x89PNG
  assert.equal(validateMagicBytes(Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x1a, 0x0a]), "image/png"), true);
  // رأس JPEG: \xff\xd8\xff
  assert.equal(validateMagicBytes(Buffer.from([0xff, 0xd8, 0xff, 0xe0, 0x00]), "image/jpeg"), true);
});

test("Upload: يرفض أنواع MIME غير مسموحة", () => {
  assert.throws(
    () =>
      validateFileUpload(Buffer.from("%PDF"), "image/svg+xml", "evil.svg", {
        maxBytes: 1024,
        allowedMimes: ["image/png", "image/jpeg", "application/pdf"],
      }),
    /نوع الملف غير مسموح/
  );
});

test("Upload: يرفض ملفات تتجاوز الحد الأقصى", () => {
  const big = Buffer.alloc(2048);
  assert.throws(
    () =>
      validateFileUpload(big, "image/png", "big.png", {
        maxBytes: 1024,
        allowedMimes: ["image/png"],
      }),
    /حجم الملف/
  );
});

test("Upload: يرفض أسماء ملفات تحتوي على path traversal", () => {
  assert.throws(
    () =>
      validateFileUpload(Buffer.from("%PDF"), "application/pdf", "../../etc/passwd", {
        maxBytes: 1024,
        allowedMimes: ["application/pdf"],
      }),
    /أحرف غير صالحة/
  );
});

test("Upload: يقبل ملفاً صالحاً تماماً", () => {
  assert.doesNotThrow(() =>
    validateFileUpload(Buffer.from("%PDF-1.4 ok"), "application/pdf", "cert.pdf", {
      maxBytes: 1024,
      allowedMimes: ["application/pdf"],
    })
  );
});

test("Upload: يرفض محتوى غير متطابق حتى لو كان الحجم والنوع صحيحين", () => {
  assert.throws(
    () =>
      validateFileUpload(Buffer.from("SVG content here"), "image/png", "fake.png", {
        maxBytes: 1024,
        allowedMimes: ["image/png"],
      }),
    /لا يتوافق/
  );
});
