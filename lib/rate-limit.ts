import { prisma } from "@/lib/prisma";
import { raiseSecurityAlert } from "@/lib/security-alerts";

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

// ============================================================
// Layer 3 — فحص متعدد المستويات (IP / User / Tenant)
// ============================================================

const IP_MAX = 100; // أقصى 100 طلب لكل عنوان IP خلال النافذة
const USER_MAX = 50; // أقصى 50 طلب لكل مستخدم خلال النافذة
const TENANT_MAX = 500; // أقصى 500 طلب لكل مستأجر خلال النافذة

export type RateLimitActor = {
  id?: string;
  tenantId?: string | null;
} | null;

/**
 * تطبيق حد معدل الطلبات على ثلاثة مستويات دفعة واحدة:
 *   - مستوى IP: 100 طلب / نافذة
 *   - مستوى المستخدم: 50 طلب / نافذة
 *   - مستوى المستأجر: 500 طلب / نافذة
 *
 * عند تجاوز أي حد يُرفع تنبيه أمني RATE_LIMIT_HIT مرة واحدة لكل نافذة
 * (لكل نقرة bucket) ثم يُرمى الخطأ الأصلي.
 *
 * @param user المستخدم الحالي (قد يكون null في الطلبات ما قبل المصادقة)
 * @param ip عنوان IP الطالب
 * @param action اسم العملية (مثل "api" أو "import")
 */
export async function checkMultiLevelRateLimit(
  user: RateLimitActor,
  ip: string,
  action: string
): Promise<void> {
  const buckets: { key: string; max: number }[] = [
    { key: `ip:${action}:${sanitizeKey(ip)}`, max: IP_MAX },
  ];
  if (user?.id) {
    buckets.push({ key: `user:${action}:${user.id}`, max: USER_MAX });
  }
  if (user?.tenantId) {
    buckets.push({ key: `tenant:${action}:${user.tenantId}`, max: TENANT_MAX });
  }

  for (const bucket of buckets) {
    try {
      await checkRateLimit(bucket.key, bucket.max);
    } catch (e) {
      await raiseRateLimitHitOnce(user, ip, action, bucket.key);
      throw e;
    }
  }
}

/** تطبيع مفتاح النقطة (منع مفاتيح طويلة/غير صالحة) */
function sanitizeKey(value: string): string {
  return value.trim().slice(0, 64) || "unknown";
}

/** رفع تنبيه RATE_LIMIT_HIT مرة واحدة لكل نافذة (نقطة alert فريدة) */
async function raiseRateLimitHitOnce(
  user: RateLimitActor,
  ip: string,
  action: string,
  bucketKey: string
): Promise<void> {
  try {
    await checkRateLimit(`alert:${bucketKey}`, 1);
    await raiseSecurityAlert({
      type: "rate_limit_hit",
      message: `تجاوز حد الطلبات: ${action}`,
      userId: user?.id ?? null,
      tenantId: user?.tenantId ?? null,
      ip,
      details: { bucket: bucketKey },
    });
  } catch {
    // سبق التنبيه لهذه النافذة — لا نكرره (منع الإغراق حرفياً)
  }
}
