-- AlterTable
-- B13 : توسيع Design Tokens — إضافة tokens جديدة للشريط الجانبي والعلوي وتسجيل الدخول والأزرار
-- التسلسل: snapshot → schema → migration يدوي (additive) → generate → verify → runtime test
-- آمنة: إضافة أعمدة مع قيم افتراضية فقط، لا حذف بيانات ولا RLS

ALTER TABLE "app_settings" ADD COLUMN     "buttonPrimaryBg" TEXT NOT NULL DEFAULT '#015e63',
ADD COLUMN     "buttonPrimaryText" TEXT NOT NULL DEFAULT '#ffffff',
ADD COLUMN     "buttonSecondaryBg" TEXT NOT NULL DEFAULT '#d3bb8b',
ADD COLUMN     "buttonSecondaryText" TEXT NOT NULL DEFAULT '#0f172a',
ADD COLUMN     "loginBg" TEXT NOT NULL DEFAULT '#015e63',
ADD COLUMN     "loginCardBg" TEXT NOT NULL DEFAULT '#ffffff',
ADD COLUMN     "loginGradientFrom" TEXT NOT NULL DEFAULT '#014a4e',
ADD COLUMN     "loginGradientTo" TEXT NOT NULL DEFAULT '#d3bb8b',
ADD COLUMN     "sidebarActiveBg" TEXT NOT NULL DEFAULT '#014a4e',
ADD COLUMN     "sidebarActiveText" TEXT NOT NULL DEFAULT '#ffffff',
ADD COLUMN     "sidebarBg" TEXT NOT NULL DEFAULT '#015e63',
ADD COLUMN     "sidebarText" TEXT NOT NULL DEFAULT '#ffffff',
ADD COLUMN     "topbarBg" TEXT NOT NULL DEFAULT '#ffffff',
ADD COLUMN     "topbarText" TEXT NOT NULL DEFAULT '#0f172a';