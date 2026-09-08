import { prisma } from "@/lib/prisma";

// ============================================================
// Rate Limiting مبني على قاعدة البيانات (يعمل على Vercel Serverless)
// - يستخدم UPSERT ذري عبر raw query لمنع سباقات التزامن
// - يعمل في بيئة Serverless الموزعة بشكل موثوق
// ============================================================

const WINDOW_MS = 15 * 60 * 1000; // 15 دقيقة

/**
 * تطبيق حد معدل الطلبات باستخدام قاعدة بيانات PostgreSQL (Neon)
 *
 * يستخدم INSERT ... ON CONFLICT DO UPDATE ذري لضمان أن
 * طلبين متزامنين لا يتجاوزان الحد الأقصى.
 *
 * @param key مفتاح فريد للنقطة (مثل login:email أو userId)
 * @param max الحد الأقصى من الطلبات خلال النافذة
 * @param windowMs مدة النافذة بالمللي ثانية (افتراضياً 15 دقيقة)
 */
export async function checkRateLimit(
  key: string,
  max: number,
  windowMs: number = WINDOW_MS
): Promise<void> {
  const now = new Date();
  const windowEnd = new Date(now.getTime() + windowMs);

  // تنظيف عشوائي (1%) للسجلات المنتهية
  if (Math.random() < 0.01) {
    await prisma.rateLimit.deleteMany({
      where: { resetAt: { lt: now } },
    }).catch(() => {});
  }

  // UPSERT ذري: إنشاء أو تحديث في استعلام واحد
  // CASE WHEN يتعامل مع انتهاء النافذة تلقائياً
  await prisma.$executeRaw`
    INSERT INTO rate_limits (key, count, "resetAt")
    VALUES (${key}, 1, ${windowEnd})
    ON CONFLICT (key) DO UPDATE
    SET
      count = CASE
        WHEN rate_limits."resetAt" <= ${now} THEN 1
        ELSE rate_limits.count + 1
      END,
      "resetAt" = CASE
        WHEN rate_limits."resetAt" <= ${now} THEN ${windowEnd}
        ELSE rate_limits."resetAt"
      END
  `;

  // قراءة العدد الفعلي بعد التحديث الذري
  const rows = await prisma.$queryRaw<{ count: number; resetAt: Date }[]>`
    SELECT count, "resetAt" FROM rate_limits WHERE key = ${key}
  `;

  if (!rows || rows.length === 0 || !rows[0]) {
    throw new Error("خطأ في فحص حد الطلبات");
  }

  const current = rows[0];
  // إذا انتهت النافذة، العدد الفعلي = 1 (الطلب الحالي)
  const effectiveCount = current.resetAt <= now ? 1 : current.count;

  if (effectiveCount > max) {
    throw new Error("تم تجاوز حد الطلبات المسموح، حاول لاحقاً");
  }
}
