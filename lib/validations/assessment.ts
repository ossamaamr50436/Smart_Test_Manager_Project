import { z } from "zod";

// مخطط التحقق من مدخلات التقييم (OWASP — تحقق من صحة المدخلات)
// وفق لائحة اختيار فرع كامل القرآن — 100 درجة
export const assessmentInputSchema = z.object({
  examSessionId: z
    .string()
    .min(1, "معرّف الجلسة مطلوب")
    .max(64, "معرّف الجلسة غير صالح"),
  // أخطاء الحفظ (خصم من 70 درجة)
  wordErrors: z.coerce
    .number({ invalid_type_error: "عدد أخطاء الكلمات يجب أن يكون رقماً" })
    .int("عدد أخطاء الكلمات يجب أن يكون عدداً صحيحاً")
    .min(0, "عدد أخطاء الكلمات لا يمكن أن يكون سالباً")
    .max(70, "عدد أخطاء الكلمات غير منطقي (الحد الأقصى 70)"),
  letterErrors: z.coerce
    .number({ invalid_type_error: "عدد أخطاء الحروف يجب أن يكون رقماً" })
    .int("عدد أخطاء الحروف يجب أن يكون عدداً صحيحاً")
    .min(0, "عدد أخطاء الحروف لا يمكن أن يكون سالباً")
    .max(70, "عدد أخطاء الحروف غير منطقي (الحد الأقصى 70)"),
  diacriticErrors: z.coerce
    .number({ invalid_type_error: "عدد أخطاء الضبط يجب أن يكون رقماً" })
    .int("عدد أخطاء الضبط يجب أن يكون عدداً صحيحاً")
    .min(0, "عدد أخطاء الضبط لا يمكن أن يكون سالباً")
    .max(70, "عدد أخطاء الضبط غير منطقي (الحد الأقصى 70)"),
  seriousErrors: z.coerce
    .number({ invalid_type_error: "عدد أخطاء اللحن الجلي يجب أن يكون رقماً" })
    .int("عدد أخطاء اللحن الجلي يجب أن يكون عدداً صحيحاً")
    .min(0, "عدد أخطاء اللحن الجلي لا يمكن أن يكون سالباً")
    .max(50, "عدد أخطاء اللحن الجلي غير منطقي (الحد الأقصى 50)"),
  subtleErrors: z.coerce
    .number({ invalid_type_error: "عدد أخطاء اللحن الخفي يجب أن يكون رقماً" })
    .int("عدد أخطاء اللحن الخفي يجب أن يكون عدداً صحيحاً")
    .min(0, "عدد أخطاء اللحن الخفي لا يمكن أن يكون سالباً")
    .max(70, "عدد أخطاء اللحن الخفي غير منطقي (الحد الأقصى 70)"),
  // التنبيه
  promptingCount: z.coerce
    .number({ invalid_type_error: "عدد مرات التنبيه يجب أن يكون رقماً" })
    .int("عدد مرات التنبيه يجب أن يكون عدداً صحيحاً")
    .min(0, "عدد مرات التنبيه لا يمكن أن يكون سالباً")
    .max(50, "عدد مرات التنبيه غير منطقي (الحد الأقصى 50)"),
  // الشك (التردد)
  doubtCount: z.coerce
    .number({ invalid_type_error: "عدد مرات الشك يجب أن يكون رقماً" })
    .int("عدد مرات الشك يجب أن يكون عدداً صحيحاً")
    .min(0, "عدد مرات الشك لا يمكن أن يكون سالباً")
    .max(70, "عدد مرات الشك غير منطقي (الحد الأقصى 70)"),
  // أخطاء التجويد (المهمة 6 — عدّاد بدلاً من درجة مباشرة)
  tajweedErrors: z.coerce
    .number({ invalid_type_error: "عدد أخطاء التجويد يجب أن يكون رقماً" })
    .int("عدد أخطاء التجويد يجب أن يكون عدداً صحيحاً")
    .min(0, "عدد أخطاء التجويد لا يمكن أن يكون سالباً")
    .max(50, "عدد أخطاء التجويد غير منطقي (الحد الأقصى 50)"),
  // التلاوة وحسن الأداء (20 درجة) — تُقيّم مباشرة
  recitationScore: z.coerce
    .number({ invalid_type_error: "درجة التلاوة يجب أن تكون رقماً" })
    .min(0, "درجة التلاوة لا يمكن أن تكون سالبة")
    .max(20, "درجة التلاوة لا تتجاوز 20"),
  // التجويد التطبيقي (10 درجات) — يُقيّم مباشرة
  tajweedScore: z.coerce
    .number({ invalid_type_error: "درجة التجويد يجب أن تكون رقماً" })
    .min(0, "درجة التجويد لا يمكن أن تكون سالبة")
    .max(10, "درجة التجويد لا تتجاوز 10"),
});

export type AssessmentInput = z.infer<typeof assessmentInputSchema>;

// مخطط التحقق من عملية الاعتماد المتسلسل (المادة 5)
export const assessmentApprovalSchema = z.object({
  examSessionId: z
    .string()
    .min(1, "معرّف الجلسة مطلوب")
    .max(64, "معرّف الجلسة غير صالح"),
  action: z.enum(["approve", "finalize"], { message: "إجراء غير صحيح" }),
});

export type AssessmentApprovalInput = z.infer<typeof assessmentApprovalSchema>;

// مخطط التحقق من بيانات المقطع (حتى 30 مقطعاً)
export const examSegmentSchema = z.object({
  number: z.coerce
    .number()
    .int("رقم المقطع يجب أن يكون عدداً صحيحاً")
    .min(1, "رقم المقطع يبدأ من 1")
    .max(30, "رقم المقطع لا يتجاوز 30"),
  fromText: z
    .string()
    .min(1, "نص «من قوله تعالى» مطلوب")
    .max(500, "نص «من قوله تعالى» طويل جداً"),
  fromSurah: z.string().min(1, "اسم السورة الابتدائية مطلوب").max(100),
  fromVerse: z.coerce
    .number()
    .int("رقم الآية الابتدائية يجب أن يكون عدداً صحيحاً")
    .min(1, "رقم الآية الابتدائية غير صالح")
    .max(6236, "رقم الآية الابتدائية غير صالح"),
  toText: z
    .string()
    .min(1, "نص «إلى قوله تعالى» مطلوب")
    .max(500, "نص «إلى قوله تعالى» طويل جداً"),
  toSurah: z.string().min(1, "اسم السورة الختامية مطلوب").max(100),
  toVerse: z.coerce
    .number()
    .int("رقم الآية الختامية يجب أن يكون عدداً صحيحاً")
    .min(1, "رقم الآية الختامية غير صالح")
    .max(6236, "رقم الآية الختامية غير صالح"),
});

export type ExamSegmentInput = z.infer<typeof examSegmentSchema>;

// مخطط التحقق من إنشاء/تعديل نموذج اختباري كامل (مقاطع ديناميكية 1-30)
export const examModelSchema = z.object({
  modelNumber: z.coerce
    .number()
    .int("رقم النموذج يجب أن يكون عدداً صحيحاً")
    .min(1, "رقم النموذج يبدأ من 1")
    .max(100, "عدد النماذج لكل فرع هو 100"),
  branch: z.enum(["5", "10", "15", "20", "25", "30"], { message: "الفرع غير صالح" }),
  institutionId: z
    .string()
    .min(1, "معرّف الجهة غير صالح")
    .max(64, "معرّف الجهة غير صالح")
    .nullable()
    .optional(),
  seasonId: z.string().min(1, "الموسم مطلوب").max(64),
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

export type ExamModelInput = z.infer<typeof examModelSchema>;

// الأفرع المتاحة (بأجزاء القرآن)
export const BRANCHES = ["5", "10", "15", "20", "25", "30"] as const;