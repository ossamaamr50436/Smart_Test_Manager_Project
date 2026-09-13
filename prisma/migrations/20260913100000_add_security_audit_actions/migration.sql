-- AlterEnum
-- Phase C (Layer 2): إضافة أفعال أمنية جديدة لسجل التدقيق
-- تُستخدم من طبقة كشف الاختراق (Intrusion Detection):
--   SUSPICIOUS_ACCESS   — وصول مشبوه/غير طبيعي
--   RATE_LIMIT_HIT      — تجاوز حد معدل الطلبات
--   CROSS_TENANT_ATTEMPT— محاولة وصول عبر المستأجرين
--   FAILED_LOGIN        — محاولة دخول فاشلة (مضادة للـ Lockout)

ALTER TYPE "AuditAction" ADD VALUE 'SUSPICIOUS_ACCESS';
ALTER TYPE "AuditAction" ADD VALUE 'RATE_LIMIT_HIT';
ALTER TYPE "AuditAction" ADD VALUE 'CROSS_TENANT_ATTEMPT';
ALTER TYPE "AuditAction" ADD VALUE 'FAILED_LOGIN';