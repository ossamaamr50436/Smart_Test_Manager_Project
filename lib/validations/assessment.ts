import { z } from "zod";

// مخطط التحقق من مدخلات التقييم (OWASP — تحقق من صحة المدخلات)
export const assessmentInputSchema = z.object({
  examSessionId: z.string().min(1, "معرّف الجلسة مطلوب"),
  errorsCount: z.coerce
    .number({ invalid_type_error: "عدد الأخطاء يجب أن يكون رقماً" })
    .int("عدد الأخطاء يجب أن يكون عدداً صحيحاً")
    .min(0, "عدد الأخطاء لا يمكن أن يكون سالباً")
    .max(20, "عدد الأخطاء غير منطقي (الحد الأقصى 20)"),
  doubtsCount: z.coerce
    .number({ invalid_type_error: "عدد الشكوك يجب أن يكون رقماً" })
    .int("عدد الشكوك يجب أن يكون عدداً صحيحاً")
    .min(0, "عدد الشكوك لا يمكن أن يكون سالباً")
    .max(20, "عدد الشكوك غير منطقي (الحد الأقصى 20)"),
  tajweedCount: z.coerce
    .number({ invalid_type_error: "عدد أخطاء التجويد يجب أن يكون رقماً" })
    .int("عدد أخطاء التجويد يجب أن يكون عدداً صحيحاً")
    .min(0, "عدد أخطاء التجويد لا يمكن أن يكون سالباً")
    .max(20, "عدد أخطاء التجويد غير منطقي (الحد الأقصى 20)"),
});

export type AssessmentInput = z.infer<typeof assessmentInputSchema>;

// مخطط التحقق من عملية الاعتماد المتسلسل (المادة 5)
export const assessmentApprovalSchema = z.object({
  examSessionId: z.string().min(1, "معرّف الجلسة مطلوب"),
  action: z.enum(["approve", "finalize"], { message: "إجراء غير صحيح" }),
});

export type AssessmentApprovalInput = z.infer<typeof assessmentApprovalSchema>;