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
 * قواعد كلمة المرور (المرحلة 3): 5 أحرف كحد أدنى مع حرف كبير وصغير ورقم
 */
export const passwordSchema = z
  .string()
  .min(5, "كلمة المرور لا تقل عن 5 أحرف")
  .regex(/[A-Z]/, "كلمة المرور يجب أن تحتوي على حرف كبير واحد على الأقل")
  .regex(/[a-z]/, "كلمة المرور يجب أن تحتوي على حرف صغير واحد على الأقل")
  .regex(/[0-9]/, "كلمة المرور يجب أن تحتوي على رقم واحد على الأقل");

/**
 * مثال على مخطط مستخدم كامل يُستخدم في أي عملية إنشاء مستخدم
 * (خاصة المعلمين EXAMINER حيث يلزم birthDate للاعتماد المتسلسل)
 */
export const createUserSchema = z.object({
  name: z.string().min(2, "اسم المستخدم لا يقل عن حرفين"),
  email: z.string().email("بريد إلكتروني غير صحيح"),
  password: passwordSchema,
  role: z.enum(
    ["ADMIN", "HEAD_OF_AFFAIRS", "CERTIFICATE_SOURCE", "TEST_SPECIALIST", "EXAMINER", "INSTITUTION"],
    { message: "دور غير صحيح" }
  ),
  birthDate: birthDateSchema,
  institutionId: z.string().optional(),
});

export type CreateUserInput = z.infer<typeof createUserSchema>;
