import { z } from "zod";

// فروع الاختبار: عدد الأجزاء المحفوظة
export const BRANCHES = ["5", "10", "15", "20", "25", "30"] as const;

// فترات الاختبار
export const PERIODS = ["صباحي", "مسائي"] as const;

// مخطط ترشيح طالب جديد — خاص بالجهة التعليمية
export const studentApplicationSchema = z.object({
  name: z.string().min(2, "اسم الطالب لا يقل عن حرفين"),
  age: z.coerce
    .number({ invalid_type_error: "أدخل عمر الطالب" })
    .int("العمر يجب أن يكون عدداً صحيحاً")
    .min(4, "العمر يجب أن يكون 4 سنوات فأكثر")
    .max(18, "العمر يجب أن يكون 18 سنة فأقل"),
  branch: z.enum(BRANCHES, { message: "اختر عدد الأجزاء المحفوظة" }),
  teacherName: z.string().min(2, "اسم المعلم لا يقل عن حرفين"),
  parentPhone: z
    .string()
    .min(9, "رقم ولي الأمر غير صحيح")
    .max(15, "رقم ولي الأمر طويل جداً"),
  address: z.string().optional(),
  phone: z.string().optional(),
});

export type StudentApplicationInput = z.infer<typeof studentApplicationSchema>;

// مخطط تشكيل لجنة — خاص بأخصائي الاختبارات
export const committeeSchema = z.object({
  studentId: z.string().min(1, "اختر الطالب"),
  teacher1Id: z.string().min(1, "اختر المعلم الأول"),
  teacher2Id: z.string().min(1, "اختر المعلم الثاني"),
  examDate: z.string().min(1, "حدد تاريخ الاختبار"),
  period: z.enum(PERIODS, { message: "اختر الفترة" }),
});

export type CommitteeInput = z.infer<typeof committeeSchema>;

export type ReviewDecision = "APPROVED" | "REJECTED";