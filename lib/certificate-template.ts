import { PDFDocument, rgb } from "pdf-lib";
import { downloadFileByUrl } from "./file-storage";

// ============================================================
// القالب الذكي للشهادات (pdf-lib)
// يحمّل ملف PDF قالب من وحدة التخزين ويبحث عن النصوص
// [NAME]، [SCORE]، [DATE] ويستبدلها بالبيانات الفعلية
// ============================================================

/**
 * تحميل ملف القالب من رابط مباشر (UploadThing)
 */
export async function downloadTemplateBytes(
  url: string
): Promise<Uint8Array> {
  const buffer = await downloadFileByUrl(url);
  return new Uint8Array(buffer);
}

/**
 * تعبئة قالب الشهادة بالبيانات الفعلية
 * يستخدم AcroForm fields: يجب أن يحتوي القالب على حقول نصية
 * باسماء: NAME، SCORE، DATE
 * إذا لم توجد حقول، يُعيد القالب كما هو (بدون تعديل)
 */
export async function fillPdfTemplate(
  templateBytes: Uint8Array,
  studentName: string,
  score: number,
  date: string
): Promise<Buffer> {
  const pdfDoc = await PDFDocument.load(templateBytes);
  const form = pdfDoc.getForm();

  const fieldValues: Record<string, string> = {
    NAME: studentName,
    SCORE: `${score} / 100`,
    DATE: date,
  };

  const fields = form.getFields();
  for (const field of fields) {
    const fieldName = field.getName();
    const upperName = fieldName.toUpperCase();
    if (upperName in fieldValues) {
      try {
        form.getTextField(fieldName).setText(fieldValues[upperName]);
      } catch {
        // الحقل ليس حقل نصي — نتجاهله
      }
    }
  }

  form.flatten();
  const filledPdfBytes = await pdfDoc.save();
  return Buffer.from(filledPdfBytes);
}
