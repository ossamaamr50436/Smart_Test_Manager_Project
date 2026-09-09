-- Migration: هيكلة النماذج الاختبارية وفق لائحة اختيار فرع كامل القرآن
-- 1) إضافة الفرع (branch) إلى النماذج مع تعبئة افتراضية ثم فرض الإلزام
ALTER TABLE "exam_models" ADD COLUMN "branch" TEXT DEFAULT '5';
UPDATE "exam_models" SET "branch" = '5' WHERE "branch" IS NULL;
ALTER TABLE "exam_models" ALTER COLUMN "branch" SET NOT NULL;
ALTER TABLE "exam_models" ALTER COLUMN "branch" DROP DEFAULT;

-- 2) فهرسة الفرع لأداء الاستعلامات
CREATE INDEX "exam_models_branch_idx" ON "exam_models"("branch");

-- 3) استبدال القيد الفريد ليشمل الفرع
DROP INDEX "exam_models_institutionId_modelNumber_seasonId_key";
CREATE UNIQUE INDEX "exam_models_institutionId_modelNumber_seasonId_branch_key"
  ON "exam_models"("institutionId", "modelNumber", "seasonId", "branch");

-- 4) إضافة حقول التقييم الجديدة وفق اللائحة (100 درجة)
ALTER TABLE "assessments"
  ADD COLUMN "wordErrors" INTEGER NOT NULL DEFAULT 0,
  ADD COLUMN "letterErrors" INTEGER NOT NULL DEFAULT 0,
  ADD COLUMN "diacriticErrors" INTEGER NOT NULL DEFAULT 0,
  ADD COLUMN "seriousErrors" INTEGER NOT NULL DEFAULT 0,
  ADD COLUMN "subtleErrors" INTEGER NOT NULL DEFAULT 0,
  ADD COLUMN "promptingCount" INTEGER NOT NULL DEFAULT 0,
  ADD COLUMN "doubtCount" INTEGER NOT NULL DEFAULT 0,
  ADD COLUMN "recitationScore" DOUBLE PRECISION NOT NULL DEFAULT 0,
  ADD COLUMN "tajweedScore" DOUBLE PRECISION NOT NULL DEFAULT 0,
  ADD COLUMN "memorizationDeduction" DOUBLE PRECISION NOT NULL DEFAULT 0;

-- 5) فهرسة حالة الطالب لتسريع تصفية القوائم الكبيرة
CREATE INDEX "students_status_idx" ON "students"("status");