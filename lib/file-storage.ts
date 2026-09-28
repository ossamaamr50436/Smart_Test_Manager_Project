import { UTApi } from "uploadthing/server";

// ============================================================
// وحدة تخزين الملفات (UploadThing)
// - رفع الملفات وإرجاع { fileId = key, url = ufsUrl }
// - حذف الملفات عبر UTApi
// - downloadFileByUrl لتحميل المحتوى عبر رابط عام
// ============================================================

const utapi = new UTApi();

export type StoredFile = { fileId: string; url: string };

export type UploadOptions = {
  /**
   * رمز UploadThing الخاص بالمستأجر (Tenant.uploadthingToken).
   * عند وجوده يُبنى عميل مرتبط بحساب المستأجر بدل الحساب العام.
   */
  token?: string | null;
};

const MAX_UPLOAD_SIZE = 20 * 1024 * 1024; // 20MB
const MAX_DOWNLOAD_SIZE = 20 * 1024 * 1024; // 20MB

/**
 * يختار عميل الرفع: حساب المستأجر إن توفّر رمزه، وإلا العميل العام.
 */
export function resolveUploader(token?: string | null): UTApi {
  const clean = typeof token === "string" ? token.trim() : "";
  if (clean.length === 0) return utapi;
  return new UTApi({ token: clean });
}

/**
 * تطهير اسم الملف من الأحرف الخطرة (منع path traversal / أحرف غير صالحة)
 */
export function sanitizeFileName(fileName: string, fallback = "file"): string {
  const safe = String(fileName || "")
    .replace(/[\u0000-\u001f\\/:*?"<>|\r\n]/g, "")
    .replace(/\.\./g, "")
    .replace(/\s+/g, " ")
    .trim()
    .slice(0, 100);
  if (safe.length === 0) return fallback;
  return safe;
}

/**
 * هل رمز UploadThing بالصيغة التي يقبلها الخادم؟
 * الصيغة المعتمدة: base64 لـ JSON يحوي { apiKey, appId, regions }.
 * المفتاح المجرّد (sk_live_...) ليس رمزاً صالحاً ويرفضه الخادم برسالة
 * "Invalid token"، لذا نكشفها مبكراً برسالة توضيحية بدل خطأ رفع غامض.
 */
export function isValidUploadToken(token: string): boolean {
  const raw = token.trim();
  if (raw.length === 0) return false;
  if (raw.startsWith("sk_")) return false;
  try {
    const decoded = JSON.parse(Buffer.from(raw, "base64").toString("utf8")) as {
      apiKey?: unknown;
      appId?: unknown;
      regions?: unknown;
    };
    return (
      typeof decoded.apiKey === "string" &&
      decoded.apiKey.length > 0 &&
      typeof decoded.appId === "string" &&
      Array.isArray(decoded.regions)
    );
  } catch {
    return false;
  }
}

/**
 * يرفع ملفًا إلى UploadThing
 * @returns { fileId, url } — key + ufsUrl (رابط مباشر عام)
 */
export async function uploadFile(
  buffer: Buffer,
  fileName: string,
  mimeType = "application/pdf",
  options: UploadOptions = {}
): Promise<StoredFile> {
  if (buffer.byteLength > MAX_UPLOAD_SIZE) {
    throw new Error(
      `حجم الملف (${(buffer.byteLength / 1024 / 1024).toFixed(1)}MB) يتجاوز الحد الأقصى (20MB)`
    );
  }

  const tenantToken = typeof options.token === "string" ? options.token.trim() : "";
  if (tenantToken.length > 0 && !isValidUploadToken(tenantToken)) {
    throw new Error(
      "رمز UploadThing الخاص بالمستأجر غير صالح — يجب أن يكون base64 لـ JSON يحوي { apiKey, appId, regions } وليس المفتاح المجرّد"
    );
  }

  const file = new File([new Uint8Array(buffer)], sanitizeFileName(fileName, "file"), {
    type: mimeType,
  });

  const result = await resolveUploader(tenantToken).uploadFiles(file);

  if (result.error) {
    throw new Error(`فشل رفع الملف: ${result.error.message}`);
  }

  const uploaded = result.data;
  return {
    fileId: uploaded.key,
    url: uploaded.ufsUrl,
  };
}

/**
 * حذف ملف من UploadThing
 */
export async function deleteFile(
  fileId: string | null | undefined
): Promise<void> {
  if (!fileId) {
    return;
  }

  const result = await utapi.deleteFiles(fileId);
  if (!result.success) {
    throw new Error("فشل حذف الملف من وحدة التخزين");
  }
}

/**
 * تحميل محتوى ملف عبر رابط مباشر (ufsUrl) كـ Buffer
 * مع حد أقصى للحجم لمنع استهلاك الذاكرة في البيئة Serverless
 */
export async function downloadFileByUrl(
  url: string,
  maxSize?: number
): Promise<Buffer> {
  const limit = maxSize ?? MAX_DOWNLOAD_SIZE;
  const response = await fetch(url);
  if (!response.ok) {
    throw new Error("تعذر تحميل الملف من وحدة التخزين");
  }
  const buffer = Buffer.from(await response.arrayBuffer());
  if (buffer.byteLength > limit) {
    throw new Error("حجم الملف أكبر من الحد المسموح");
  }
  return buffer;
}

/**
 * هل القيمة رابط مباشر صالح (ufsUrl)؟
 */
export function isStoredUrl(url: string | null | undefined): url is string {
  return (
    !!url && (url.startsWith("http://") || url.startsWith("https://"))
  );
}

/**
 * هل الرابط من مضيف UploadThing الموثوق؟
 * (يُستخدم للتحقق من الروابط القادمة من العميل قبل حفظها في قاعدة البيانات)
 */
export function isTrustedStoredUrl(
  url: string | null | undefined
): url is string {
  if (!isStoredUrl(url)) {
    return false;
  }
  let host: string;
  try {
    host = new URL(url).hostname;
  } catch {
    return false;
  }
  return host === "ufs.sh" || host.endsWith(".ufs.sh") || host === "utfs.io";
}

/**
 * هل معرّف ملف UploadThing صالح (key)?
 */
export function isValidFileKey(
  fileKey: string | null | undefined
): fileKey is string {
  return (
    !!fileKey &&
    fileKey.length <= 200 &&
    /^[a-zA-Z0-9_-]+$/.test(fileKey)
  );
}