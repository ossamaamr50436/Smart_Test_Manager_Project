// ============================================================
// أمان رفع الملفات (المادة 3 + OWASP File Upload Security)
// - التحقق من النوع والحجم ومحتوى الملف (Magic Bytes)
// - حماية من path traversal في أسماء الملفات
// ============================================================

const MAGIC_BYTES: Record<string, number[]> = {
  "application/pdf": [0x25, 0x50, 0x44, 0x46], // %PDF
  "image/png": [0x89, 0x50, 0x4e, 0x47], // .PNG
  "image/jpeg": [0xff, 0xd8, 0xff], // JPEG
  "image/webp": [0x52, 0x49, 0x46, 0x46], // RIFF (WEBP)
};

/**
 * التحقق من أن محتوى الملف (Magic Bytes) يتوافق مع النوع المُعلن
 */
export function validateMagicBytes(buffer: Uint8Array | Buffer, expectedMime: string): boolean {
  const magic = MAGIC_BYTES[expectedMime];
  if (!magic) return true; // نوع غير معروف — نعتمد على القوائم المسموحة فقط
  for (let i = 0; i < magic.length; i++) {
    if (buffer[i] !== magic[i]) return false;
  }
  return true;
}

/**
 * التحقق الشامل من ملف مرفوع:
 * - النوع (MIME) ضمن القائمة المسموحة
 * - الحجم ضمن الحد الأقصى
 * - المحتوى يتوافق مع النوع المُعلن
 * - اسم الملف خالٍ من أحرف path traversal
 */
export function validateFileUpload(
  buffer: Uint8Array | Buffer,
  mimeType: string,
  fileName: string,
  opts: { maxBytes: number; allowedMimes: string[] }
): void {
  if (!opts.allowedMimes.includes(mimeType)) {
    throw new Error("نوع الملف غير مسموح");
  }
  if (buffer.byteLength > opts.maxBytes) {
    throw new Error(`حجم الملف كبير جداً (الحد الأقصى ${Math.round(opts.maxBytes / 1024 / 1024)}MB)`);
  }
  if (!validateMagicBytes(buffer, mimeType)) {
    throw new Error("محتوى الملف لا يتوافق مع النوع المُعلن");
  }
  if (/[\\/:*?"<>|]/.test(fileName) || fileName.includes("..")) {
    throw new Error("اسم الملف يحتوي على أحرف غير صالحة");
  }
}