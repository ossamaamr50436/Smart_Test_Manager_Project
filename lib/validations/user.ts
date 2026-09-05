import { z } from "zod";

// ============================================================
// مخططات التحقق من بيانات المستخدم
// يضمن وجود birthDate صالح لجميع المستخدمين خاصة المعلمين
// (المادة 5 — الاعتماد حسب العمر)
// ============================================================

/**
 * تحقق من أن تاريخ الميلاد في الماضي ومنطقي (بين 1900 واليوم)
 */
export const birthDateSchema = z
  .date({
    required_error: "تاريخ الميلاد مطلوب",
    invalid_type_error: "تاريخ ميلاد غير صحيح",
  })
  .refine((date) => date < new Date(), "تاريخ الميلاد يجب أن يكون في الماضي")
  .refine(
    (date) => date.getFullYear() > 1900,
    "تاريخ الميلاد غير منطقي (يجب أن يكون بعد 1900)"
  );

/**
 * مثال على مخطط مستخدم كامل يُستخدم في أي عملية إنشاء مستخدم
 * (خاصة المعلمين EXAMINER حيث يلزم birthDate للاعتماد المتسلسل)
 */
export const createUserSchema = z.object({
  name: z.string().min(2, "اسم المستخدم لا يقل عن حرفين"),
  email: z.string().email("بريد إلكتروني غير صحيح"),
  password: z.string().min(8, "كلمة المرور لا تقل عن 8 أحرف"),
  role: z.enum(
    ["ADMIN", "HEAD_OF_AFFAIRS", "CERTIFICATE_SOURCE", "TEST_SPECIALIST", "EXAMINER", "INSTITUTION"],
    { message: "دور غير صحيح" }
  ),
  birthDate: birthDateSchema,
  institutionId: z.string().optional(),
});

export type CreateUserInput = z.infer<typeof createUserSchema>;
