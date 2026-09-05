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
 * رفع ملف إلى Google Drive داخل المجلد المحدد.
 *
 * @param fileBuffer محتوى الملف (على سبيل المثال PDF الشهادة)
 * @param fileName    اسم الملف الظاهر في Drive
 * @param mimeType    نوع MIME للملف (افتراضياً application/pdf)
 * @returns { fileId, webViewLink }
 */
export async function uploadFileToDrive(
  fileBuffer: Buffer,
  fileName: string,
  mimeType = "application/pdf"
): Promise<{ fileId: string; webViewLink: string }> {
  const auth = getAuthClient();
  const drive = google.drive({ version: "v3", auth });
  const folderId = getDriveFolderId();

  const response = await drive.files.create({
    requestBody: {
      name: fileName,
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

  // السماح بالعرض لأي شخص لديه الرابط (لضمان فتح الشهادة من الواجهة)
  await drive.permissions.create({
    fileId: response.data.id,
    requestBody: {
      role: "reader",
      type: "anyone",
    },
  });

  return {
    fileId: response.data.id,
    webViewLink: response.data.webViewLink ?? "",
  };
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
 */
export async function downloadFileFromDrive(fileId: string): Promise<Buffer> {
  const auth = getAuthClient();
  const drive = google.drive({ version: "v3", auth });
  const response = await drive.files.get(
    { fileId, alt: "media" },
    { responseType: "arraybuffer" }
  );
  return Buffer.from(response.data as ArrayBuffer);
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
      name: fileName,
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

  await drive.permissions.create({
    fileId: response.data.id,
    requestBody: { role: "reader", type: "anyone" },
  });

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