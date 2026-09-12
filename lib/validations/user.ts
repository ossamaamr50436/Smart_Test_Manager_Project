import { z } from "zod";

// ============================================================
// مخططات التحقق من بيانات المستخدم
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
 * قواعد كلمة المرور (شروط مخففة): 5 أحرف/رموز على الأقل — لا شروط أخرى
 */
export const passwordSchema = z
  .string()
  .min(5, "كلمة المرور يجب أن تكون 5 أحرف/رموز على الأقل")
  .max(128, "كلمة المرور طويلة جداً");

/**
 * بريد إلكتروني متسامح (يستبدل z.string().email() الصارم):
 * - trim يزيل المسافات (شائعة عند النسخ واللصق)
 * - toLowerCase يوحّد البريد
 * - regex بسيط يقبل أي بريد معقول
 */
export const emailSchema = z
  .string()
  .trim()
  .toLowerCase()
  .min(1, "البريد الإلكتروني مطلوب")
  .max(254, "البريد الإلكتروني طويل جداً")
  .regex(
    /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/,
    "البريد الإلكتروني غير صالح (مثال: name@domain.com)"
  );

/**
 * مثال على مخطط مستخدم كامل يُستخدم في أي عملية إنشاء مستخدم
 * (خاصة المعلمين EXAMINER حيث يلزم birthDate كبيانات تعريفية)
 */
export const createUserSchema = z.object({
  name: z.string().min(2, "اسم المستخدم لا يقل عن حرفين").max(100, "الاسم طويل جداً"),
  email: emailSchema,
  password: passwordSchema,
  role: z.enum(
    ["ADMIN", "HEAD_OF_AFFAIRS", "CERTIFICATE_SOURCE", "TEST_SPECIALIST", "EXAMINER", "INSTITUTION"],
    { message: "دور غير صحيح" }
  ),
  birthDate: birthDateSchema,
  institutionId: z.string().optional(),
});

export type CreateUserInput = z.infer<typeof createUserSchema>;
