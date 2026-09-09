// ============================================================
// استراتيجية التخزين المؤقت (Caching)
// - unstable_cache من Next.js للبيانات شبه الثابتة
// - تجنب استعلامات قاعدة البيانات المتكررة للقوائم الكبيرة
// ============================================================
import { unstable_cache } from "next/cache";
import { prisma } from "@/lib/prisma";

/**
 * قائمة النماذج الاختبارية مخزّنة مؤقتاً (بيانات شبه ثابتة)
 * إعادة التحقق كل ساعة — تُستخدم في لوحات العرض
 */
export const getCachedExamModels = unstable_cache(
  async () => {
    return prisma.examModel.findMany({
      select: {
        id: true,
        modelNumber: true,
        branch: true,
        institution: { select: { name: true } },
        season: { select: { name: true } },
      },
      orderBy: [{ branch: "asc" }, { modelNumber: "asc" }],
    });
  },
  ["exam-models"],
  { revalidate: 3600 }
);

/**
 * قائمة الجهات التعليمية مخزّنة مؤقتاً
 * إعادة التحقق كل ساعة
 */
export const getCachedInstitutions = unstable_cache(
  async () => {
    return prisma.institution.findMany({
      select: {
        id: true,
        name: true,
        contactInfo: true,
        _count: { select: { students: true } },
      },
      orderBy: { name: "asc" },
    });
  },
  ["institutions"],
  { revalidate: 3600 }
);

/**
 * الموسم النشط الحالي (يتغير نادراً — يُخزّن مؤقتاً لـ 5 دقائق)
 * يُستخدم في عمليات توزيع اللجان وإيجاد النماذج
 */
export const getCachedActiveSeason = unstable_cache(
  async () => {
    return prisma.examSeason.findFirst({
      where: { isActive: true },
      select: { id: true, name: true },
      orderBy: { startDate: "desc" },
    });
  },
  ["active-season"],
  { revalidate: 300 }
);

/**
 * قائمة المعلمين المختصرين (المتوفرون لتشكيل اللجان)
 * البيانات شبه ثابتة — تُحدّث كل 10 دقائق
 */
export const getCachedExaminers = unstable_cache(
  async () => {
    return prisma.user.findMany({
      where: { role: "EXAMINER" },
      select: { id: true, name: true },
      orderBy: { name: "asc" },
    });
  },
  ["examiners"],
  { revalidate: 600 }
);