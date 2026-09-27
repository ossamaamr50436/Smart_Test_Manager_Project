import { z } from "zod";
import { examSegmentSchema } from "./assessment";

// مخطط التحقق من إنشاء/تعديل نموذج في بنك الأسئلة
// نموذج دائم (بلا موسم) — يُختار يدوياً للجان (المهمة I)
export const questionBankSchema = z.object({
  modelNumber: z.coerce
    .number({
      invalid_type_error: "رقم النموذج يجب أن يكون رقماً",
      required_error: "رقم النموذج مطلوب",
    })
    .int("رقم النموذج يجب أن يكون عدداً صحيحاً")
    .min(1, "رقم النموذج يبدأ من 1")
    .max(100, "عدد النماذج لكل فرع هو 100"),
  branch: z.enum(["5", "10", "15", "20", "25", "30"], { message: "الفرع غير صالح" }),
  segmentsCount: z.coerce
    .number({ invalid_type_error: "عدد المقاطع يجب أن يكون رقماً" })
    .int("عدد المقاطع يجب أن يكون عدداً صحيحاً")
    .min(1, "عدد المقاطع لا يقل عن 1")
    .max(10, "عدد المقاطع لا يتجاوز 10"),
  segments: z
    .array(examSegmentSchema, { required_error: "قائمة المقاطع مطلوبة" })
    .min(1, "يجب أن يتضمن النموذج مقطعاً واحداً على الأقل")
    .max(10, "عدد المقاطع لا يتجاوز 10"),
});

/**
 * الحد الأدنى لعدد المقاطع في مسار الاستيراد (المهمة F).
 * ملاحظة التوثيق: الحد في questionBankSchema يبقى 1 لأن هناك نماذج
 * legacy محفوظة بـ3 مقاطع يجب أن تبقى قابلة للتعديل من الواجهة،
 * بينما الاستيراد يجب أن يلتزم بالحد المعتمد (5).
 */
export const IMPORT_MIN_SEGMENTS = 5;

/**
 * مخطط الاستيراد = questionBankSchema نفسه + حد أدنى 5 مقاطع.
 * مصدر الحقيقة واحد (لا يوجد تحقق موازٍ في مسار الـAPI).
 */
export const importQuestionBankSchema = questionBankSchema.superRefine((data, ctx) => {
  if (data.segmentsCount < IMPORT_MIN_SEGMENTS) {
    ctx.addIssue({
      code: z.ZodIssueCode.custom,
      path: ["segmentsCount"],
      message: `عدد المقاطع لا يقل عن ${IMPORT_MIN_SEGMENTS} عند الاستيراد`,
    });
  }
  if (data.segments.length < IMPORT_MIN_SEGMENTS) {
    ctx.addIssue({
      code: z.ZodIssueCode.custom,
      path: ["segments"],
      message: `يجب أن يتضمن النموذج ${IMPORT_MIN_SEGMENTS} مقاطع على الأقل عند الاستيراد`,
    });
  }
});

export type QuestionBankInput = z.infer<typeof questionBankSchema>;