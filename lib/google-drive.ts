import { Readable } from "stream";
import { google, type Auth } from "googleapis";

// ============================================================
// خدمة Google Drive (المادة 3 — تخزين الملفات حصراً على Drive)
// تُستخدم لرفع ملفات PDF الخاصة بالشهادات عبر حساب خدمة
// ============================================================

/**
 * إحضار عميل Google Drive Authentication باستخدام حساب خدمة
 * يتم تحميل المتغيرات من .env (لا تُخزن في الكود أبداً)
 */
function getAuthClient(): Auth.GoogleAuth {
  const clientEmail = process.env.GOOGLE_CLIENT_EMAIL;
  const privateKey = process.env.GOOGLE_PRIVATE_KEY;
  const folderId = process.env.GOOGLE_DRIVE_FOLDER_ID;

  if (!clientEmail || !privateKey || !folderId) {
    throw new Error(
      "إعدادات Google Drive غير مكتملة: تأكد من تعيين GOOGLE_CLIENT_EMAIL و GOOGLE_PRIVATE_KEY و GOOGLE_DRIVE_FOLDER_ID في .env"
    );
  }

  return new google.auth.GoogleAuth({
    credentials: {
      client_email: clientEmail,
      private_key: privateKey.replace(/\\n/g, "\n"),
    },
    scopes: ["https://www.googleapis.com/auth/drive.file"],
  });
}

/** معرف مجلد Drive المحدد (مطلوب للرفع) */
export function getDriveFolderId(): string {
  const folderId = process.env.GOOGLE_DRIVE_FOLDER_ID;
  if (!folderId) {
    throw new Error("GOOGLE_DRIVE_FOLDER_ID غير معرّف في .env");
  }
  return folderId;
}

/**
 * تطهير اسم الملف من الأحرف الخطرة (منع path traversal / أحرف Drive غير صالحة)
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
 * رفع ملف إلى Google Drive داخل المجلد المحدد.
 *
 * @param fileBuffer محتوى الملف (على سبيل المثال PDF الشهادة)
 * @param fileName    اسم الملف الظاهر في Drive (يُطهَّر من الأحرف الخطرة)
 * @param mimeType    نوع MIME للملف (افتراضياً application/pdf)
 * @returns { fileId, webViewLink }
 */
const MAX_UPLOAD_SIZE = 20 * 1024 * 1024; // 20MB

export async function uploadFileToDrive(
  fileBuffer: Buffer,
  fileName: string,
  mimeType = "application/pdf"
): Promise<{ fileId: string; webViewLink: string }> {
  // حد أقصى للحجم لمنع DoS
  if (fileBuffer.byteLength > MAX_UPLOAD_SIZE) {
    throw new Error(`حجم الملف (${(fileBuffer.byteLength / 1024 / 1024).toFixed(1)}MB) يتجاوز الحد الأقصى (20MB)`);
  }

  const auth = getAuthClient();
  const drive = google.drive({ version: "v3", auth });
  const folderId = getDriveFolderId();

  const response = await drive.files.create({
    requestBody: {
      name: sanitizeFileName(fileName, "file"),
      parents: [folderId],
      mimeType,
    },
    media: {
      mimeType,
      body: Readable.from(fileBuffer),
    },
    fields: "id, webViewLink",
  });

  if (!response.data.id) {
    throw new Error("فشل رفع الملف إلى Google Drive");
  }

  return {
    fileId: response.data.id,
    webViewLink: response.data.webViewLink ?? "",
  };
}

/**
 * استخراج معرّف ملف Drive من أي صيغة رابط (webViewLink / open?id= / /d/..)
 */
export function extractDriveFileId(urlOrId: string): string | null {
  if (!urlOrId) return null;
  const trimmed = urlOrId.trim();

  // إن كان معرّفاً خالصاً (بدون روابط) — مع حد أقصى للطول
  if (/^[A-Za-z0-9_-]{20,200}$/.test(trimmed)) {
    return trimmed;
  }

  try {
    const u = new URL(trimmed);
    const id = u.searchParams.get("id");
    if (id) return id;
    const match = trimmed.match(/\/d\/([^/]+)/);
    if (match?.[1]) return match[1];
  } catch {
    // ليس رابطاً — نعود للقاعدة أعلاه
  }

  return null;
}

/**
 * جلب نوع MIME لملف على Drive (افتراضياً PDF)
 */
export async function getDriveFileMimeType(fileId: string): Promise<string | null> {
  try {
    const auth = getAuthClient();
    const drive = google.drive({ version: "v3", auth });
    const response = await drive.files.get({
      fileId,
      fields: "mimeType, name",
    });
    return response.data.mimeType ?? null;
  } catch {
    return null;
  }
}

/**
 * استرجاع رابط العرض العام لملف موجود على Drive
 */
export async function getPublicUrl(fileId: string): Promise<string> {
  const auth = getAuthClient();
  const drive = google.drive({ version: "v3", auth });
  const response = await drive.files.get({
    fileId,
    fields: "webViewLink",
  });
  return response.data.webViewLink ?? "";
}

/**
 * تحميل محتوى ملف من Google Drive كـ Buffer
 * مع حد أقصى للحجم لمنع استهلاك الذاكرة في البيئة Serverless
 */
const MAX_DOWNLOAD_SIZE = 20 * 1024 * 1024; // 20MB

export async function downloadFileFromDrive(fileId: string, maxSize?: number): Promise<Buffer> {
  const limit = maxSize ?? MAX_DOWNLOAD_SIZE;
  const auth = getAuthClient();
  const drive = google.drive({ version: "v3", auth });

  // جلب حجم الملف أولاً للتحقق من الحد قبل التحميل
  const meta = await drive.files.get({
    fileId,
    fields: "size",
  });
  const size = Number(meta.data.size ?? 0);
  if (size > limit) {
    throw new Error("حجم الملف أكبر من الحد المسموح");
  }

  const response = await drive.files.get(
    { fileId, alt: "media" },
    { responseType: "arraybuffer" }
  );
  const buffer = Buffer.from(response.data as ArrayBuffer);
  if (buffer.byteLength > limit) {
    throw new Error("حجم الملف أكبر من الحد المسموح");
  }
  return buffer;
}

/**
 * حذف ملف من Drive (تُستخدم عند إلغاء/تصحيح شهادة)
 */
export async function deleteFileFromDrive(fileId: string): Promise<void> {
  const auth = getAuthClient();
  const drive = google.drive({ version: "v3", auth });
  await drive.files.delete({ fileId });
}

/**
 * إنشاء مجلد داخل مجلد Drive الأصلي
 */
export async function createDriveFolder(folderName: string): Promise<string> {
  const drive = google.drive({ version: "v3", auth: getAuthClient() });
  const folderId = getDriveFolderId();

  const response = await drive.files.create({
    requestBody: {
      name: folderName,
      parents: [folderId],
      mimeType: "application/vnd.google-apps.folder",
    },
    fields: "id",
  });

  if (!response.data.id) {
    throw new Error("فشل إنشاء المجلد على Google Drive");
  }
  return response.data.id;
}

/**
 * رفع ملف نموذج اختباري (JSON) إلى Google Drive
 * (المادة 3 — لا تُخزن النماذج محلياً)
 */
export async function uploadExamModelFile(
  buffer: Buffer,
  fileName: string,
  mimeType = "application/json"
): Promise<{ fileId: string; webViewLink: string }> {
  const auth = getAuthClient();
  const drive = google.drive({ version: "v3", auth });
  const parentFolder = process.env.GOOGLE_DRIVE_MODELS_FOLDER_ID || getDriveFolderId();

  const response = await drive.files.create({
    requestBody: {
      name: sanitizeFileName(fileName, "exam-model"),
      parents: [parentFolder],
      mimeType,
    },
    media: {
      mimeType,
      body: Readable.from(buffer),
    },
    fields: "id, webViewLink",
  });

  if (!response.data.id) {
    throw new Error("فشل رفع النموذج إلى Google Drive");
  }

  return {
    fileId: response.data.id,
    webViewLink: response.data.webViewLink ?? "",
  };
}

/**
 * جلب قائمة النماذج من Google Drive
 */
export async function getExamModelsFromDrive(folderId?: string) {
  const drive = google.drive({ version: "v3", auth: getAuthClient() });
  const parentFolder = folderId || process.env.GOOGLE_DRIVE_MODELS_FOLDER_ID || getDriveFolderId();

  const response = await drive.files.list({
    q: `'${parentFolder}' in parents and mimeType='application/json' and trashed=false`,
    fields: "files(id, name, webViewLink, mimeType, size, modifiedTime)",
    orderBy: "name",
  });

  return (response.data.files ?? []).map((f) => ({
    fileId: f.id ?? "",
    name: f.name ?? "",
    webViewLink: f.webViewLink ?? "",
    mimeType: f.mimeType ?? "",
    size: f.size ?? "",
    modifiedTime: f.modifiedTime ?? "",
  }));
}