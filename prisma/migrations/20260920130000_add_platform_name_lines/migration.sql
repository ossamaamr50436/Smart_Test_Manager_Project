-- AlterTable
-- D3 — اسم المنصة في سطرين: إضافة platformNameLine1 / platformNameLine2
-- التسلسل: snapshot → schema → migration يدوي (additive) → generate → verify → runtime test
-- آمنة: إضافة أعمدة nullable فقط، لا حذف بيانات ولا RLS.
-- يُهيّأ السطر الأول من القيمة الحالية لاسم المنصة حتى لا تتغير الواجهة.

ALTER TABLE "app_settings" ADD COLUMN "platformNameLine1" TEXT;
ALTER TABLE "app_settings" ADD COLUMN "platformNameLine2" TEXT;

UPDATE "app_settings" SET "platformNameLine1" = "platformName" WHERE "platformNameLine1" IS NULL;