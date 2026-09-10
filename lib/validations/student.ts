import { z } from "zod";

// فروع الاختبار: عدد الأجزاء المحفوظة
export const BRANCHES = ["5", "10", "15", "20", "25", "30"] as const;

// فترات الاختبار
export const PERIODS = ["صباحي", "مسائي"] as const;

// الدول (المهمة 3 — الجنسية)
export const NATIONALITIES = [
  "السعودية",
  "مصر",
  "الإمارات",
  "الكويت",
  "قطر",
  "البحرين",
  "عمان",
  "الأردن",
  "فلسطين",
  "سوريا",
  "لبنان",
  "العراق",
  "اليمن",
  "السودان",
  "المغرب",
  "الجزائر",
  "تونس",
  "ليبيا",
  "موريتانيا",
] as const;

// مخطط ترشيح طالب جديد — خاص بالجهة التعليمية
export const studentApplicationSchema = z.object({
  name: z
    .string()
    .min(2, "اسم الطالب لا يقل عن حرفين")
    .max(100, "اسم الطالب طويل جداً (الحد الأقصى 100 حرف)"),
  age: z.coerce
    .number({ invalid_type_error: "أدخل عمر الطالب" })
    .int("العمر يجب أن يكون عدداً صحيحاً")
    .min(4, "العمر يجب أن يكون 4 سنوات فأكثر")
    .max(18, "العمر يجب أن يكون 18 سنة فأقل"),
  branch: z.enum(BRANCHES, { message: "اختر عدد الأجزاء المحفوظة" }),
  nationality: z.enum(NATIONALITIES, { message: "اختر الجنسية" }),
  teacherName: z
    .string()
    .min(2, "اسم المعلم لا يقل عن حرفين")
    .max(100, "اسم المعلم طويل جداً (الحد الأقصى 100 حرف)"),
  parentPhone: z
    .string()
    .min(10, "رقم ولي الأمر غير صحيح (الحد الأدنى 10 أرقام)")
    .max(15, "رقم ولي الأمر طويل جداً"),
  address: z.string().max(200, "العنوان طويل جداً").optional(),
  phone: z.string().max(15, "رقم الهاتف طويل جداً").optional(),
});

export type StudentApplicationInput = z.infer<typeof studentApplicationSchema>;

// مخطط تشكيل لجنة — خاص بأخصائي الاختبارات
export const committeeSchema = z.object({
  studentId: z.string().min(1, "اختر الطالب").max(64, "معرّف الطالب غير صالح"),
  teacher1Id: z.string().min(1, "اختر المعلم الأول").max(64, "معرّف المعلم غير صالح"),
  teacher2Id: z.string().min(1, "اختر المعلم الثاني").max(64, "معرّف المعلم غير صالح"),
  examDate: z.string().min(1, "حدد تاريخ الاختبار").max(50, "تاريخ الاختبار غير صالح"),
  period: z.enum(PERIODS, { message: "اختر الفترة" }),
});

export type CommitteeInput = z.infer<typeof committeeSchema>;

export type ReviewDecision = "APPROVED" | "REJECTED";