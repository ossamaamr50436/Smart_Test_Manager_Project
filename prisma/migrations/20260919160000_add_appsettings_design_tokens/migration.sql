-- AlterTable
-- B5 — تصميم المظهر: إضافة توكنات التصميم إلى إعدادات المنصة (AppSettings)
-- النمط: additive فقط — لا حذف أو تعديل لعمود قائم، والصف singleton الوحيد
-- يحصل على القيم الافتراضية المطابقة للهوية الحالية (صفر تغيير بصري).

ALTER TABLE "app_settings"
  ADD COLUMN "accentColor"       TEXT NOT NULL DEFAULT '#1a262e',
  ADD COLUMN "backgroundColor"   TEXT NOT NULL DEFAULT '#ffffff',
  ADD COLUMN "textColor"         TEXT NOT NULL DEFAULT '#0f172a',
  ADD COLUMN "borderColor"       TEXT NOT NULL DEFAULT '#e2e8f0',
  ADD COLUMN "headingFont"       TEXT NOT NULL DEFAULT 'Cairo',
  ADD COLUMN "bodyFont"          TEXT NOT NULL DEFAULT 'Cairo',
  ADD COLUMN "borderRadius"      TEXT NOT NULL DEFAULT '0.5rem',
  ADD COLUMN "shadowIntensity"   TEXT NOT NULL DEFAULT 'md',
  ADD COLUMN "buttonStyle"       TEXT NOT NULL DEFAULT 'rounded';
