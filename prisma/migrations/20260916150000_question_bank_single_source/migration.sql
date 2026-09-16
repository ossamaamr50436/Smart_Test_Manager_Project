-- ============================================================
-- المهمة I: توحيد النماذج في بنك الأسئلة فقط + اختيار يدوي للجان
-- 1) نقل النماذج من exam_models إلى question_bank_models
-- 2) إعادة توجيه الجلسات والتقييمات إلى بنك الأسئلة
-- 3) استبدال النطاق الرقمي (committee_model_allocations) بنماذج محددة يدوياً
-- ============================================================

-- إسقاط القيود المرجعية على الجداول التي ستُحذف أو ستُعاد توجيهها
ALTER TABLE "exam_sessions" DROP CONSTRAINT "exam_sessions_modelId_fkey";
ALTER TABLE "assessments" DROP CONSTRAINT "assessments_modelId_fkey";
ALTER TABLE "exam_models" DROP CONSTRAINT "exam_models_tenantId_fkey";
ALTER TABLE "exam_models" DROP CONSTRAINT "exam_models_institutionId_fkey";
ALTER TABLE "exam_models" DROP CONSTRAINT "exam_models_seasonId_fkey";
ALTER TABLE "committee_model_allocations" DROP CONSTRAINT "committee_model_allocations_committeeId_fkey";
ALTER TABLE "committee_model_allocations" DROP CONSTRAINT "committee_model_allocations_seasonId_fkey";

-- 1) نسخ النماذج غير الموجودة في بنك الأسئلة (مع الحفاظ على المعرفات)
INSERT INTO "question_bank_models" ("id", "modelNumber", "branch", "detailsJSON", "segmentsCount", "tenantId")
SELECT e."id", e."modelNumber", e."branch", e."detailsJSON", e."segmentsCount", e."tenantId"
FROM "exam_models" e
ON CONFLICT ("tenantId", "modelNumber", "branch") DO NOTHING;

-- 2) إعادة توجيه جلسات الاختبار إلى النموذج المقابل في بنك الأسئلة
UPDATE "exam_sessions" s
SET "modelId" = qb."id"
FROM "exam_models" e
JOIN "question_bank_models" qb
  ON qb."tenantId" = e."tenantId"
 AND qb."branch" = e."branch"
 AND qb."modelNumber" = e."modelNumber"
WHERE s."modelId" = e."id";

-- 3) إعادة توجيه التقييمات إلى النموذج المقابل في بنك الأسئلة
UPDATE "assessments" a
SET "modelId" = qb."id"
FROM "exam_models" e
JOIN "question_bank_models" qb
  ON qb."tenantId" = e."tenantId"
 AND qb."branch" = e."branch"
 AND qb."modelNumber" = e."modelNumber"
WHERE a."modelId" = e."id";

-- إنشاء جدول النماذج المختارة يدوياً للجنة
CREATE TABLE "committee_model_selections" (
    "id" TEXT NOT NULL,
    "committeeId" TEXT NOT NULL,
    "modelId" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "committee_model_selections_pkey" PRIMARY KEY ("id")
);

-- 4) تحويل توزيعات النطاق السابقة إلى نماذج مختارة يدوياً
INSERT INTO "committee_model_selections" ("id", "committeeId", "modelId", "createdAt")
SELECT 'cmis_' || md5(c."id" || ':' || m."id"), c."id", m."id", CURRENT_TIMESTAMP
FROM "committee_model_allocations" al
JOIN "committees" c ON c."id" = al."committeeId"
JOIN "question_bank_models" m
  ON m."tenantId" = c."tenantId"
 AND m."branch" = al."branch"
 AND m."modelNumber" BETWEEN al."startModelNumber" AND al."endModelNumber";

-- حذف الجداول القديمة
DROP TABLE "committee_model_allocations";
DROP TABLE "exam_models";

-- إنشاء الفهارس
CREATE INDEX "committee_model_selections_modelId_idx" ON "committee_model_selections"("modelId");
CREATE UNIQUE INDEX "committee_model_selections_committeeId_modelId_key" ON "committee_model_selections"("committeeId", "modelId");

-- إعادة إنشاء القيود المرجعية إلى بنك الأسئلة
ALTER TABLE "exam_sessions" ADD CONSTRAINT "exam_sessions_modelId_fkey" FOREIGN KEY ("modelId") REFERENCES "question_bank_models"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "committee_model_selections" ADD CONSTRAINT "committee_model_selections_committeeId_fkey" FOREIGN KEY ("committeeId") REFERENCES "committees"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "committee_model_selections" ADD CONSTRAINT "committee_model_selections_modelId_fkey" FOREIGN KEY ("modelId") REFERENCES "question_bank_models"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "assessments" ADD CONSTRAINT "assessments_modelId_fkey" FOREIGN KEY ("modelId") REFERENCES "question_bank_models"("id") ON DELETE RESTRICT ON UPDATE CASCADE;