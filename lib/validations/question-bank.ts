import { z } from "zod";
import { examSegmentSchema } from "./assessment";

// مخطط التحقق من إنشاء/تعديل نموذج في بنك الأسئلة
// نموذج دائم (بلا موسم) — يُختار يدوياً للجان (المهمة I)
export const questionBankSchema = z.object({
  modelNumber: z.coerce
    .number()
    .int("رقم النموذج يجب أن يكون عدداً صحيحاً")
    .min(1, "رقم النموذج يبدأ من 1")
    .max(100, "عدد النماذج لكل فرع هو 100"),
  branch: z.enum(["5", "10", "15", "20", "25", "30"], { message: "الفرع غير صالح" }),
  segmentsCount: z.coerce
    .number({ invalid_type_error: "عدد المقاطع يجب أن يكون رقماً" })
    .int("عدد المقاطع يجب أن يكون عدداً صحيحاً")
    .min(1, "عدد المقاطع لا يقل عن 1")
    .max(30, "عدد المقاطع لا يتجاوز 30"),
  segments: z
    .array(examSegmentSchema)
    .min(1, "يجب أن يتضمن النموذج مقطعاً واحداً على الأقل")
    .max(30, "عدد المقاطع لا يتجاوز 30"),
});

export type QuestionBankInput = z.infer<typeof questionBankSchema>;