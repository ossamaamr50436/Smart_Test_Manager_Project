-- ============================================================
-- Smart Test Manager — الإصلاحات الشاملة
-- المهام: 100 نموذج/فرع، نماذج بلا جهة، مقاطع ديناميكية،
-- توزيع النماذج على اللجان، ملفات ترشيح PDF، إعداد إلزام الملف
-- ============================================================

-- AlterTable: نماذج الاختبار
ALTER TABLE "exam_models"
  ALTER COLUMN "institutionId" DROP NOT NULL,
  ADD COLUMN "segmentsCount" INTEGER NOT NULL DEFAULT 10;

-- AlterTable: الطلاب — ملف الترشيح (PDF)
ALTER TABLE "students"
  ADD COLUMN "applicationFileId" TEXT,
  ADD COLUMN "applicationFileUrl" TEXT;

-- AlterTable: إعدادات المنصة — إلزام ملف ترشيح الطالب
ALTER TABLE "app_settings"
  ADD COLUMN "requireStudentApplicationFile" BOOLEAN NOT NULL DEFAULT false;

-- CreateTable: توزيع النماذج على اللجان
CREATE TABLE "committee_model_allocations" (
    "id" TEXT NOT NULL,
    "committeeId" TEXT NOT NULL,
    "branch" TEXT NOT NULL,
    "startModelNumber" INTEGER NOT NULL,
    "endModelNumber" INTEGER NOT NULL,
    "seasonId" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "committee_model_allocations_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "committee_model_allocations_committeeId_branch_key" ON "committee_model_allocations"("committeeId", "branch");
CREATE INDEX "committee_model_allocations_seasonId_idx" ON "committee_model_allocations"("seasonId");

-- AddForeignKey
ALTER TABLE "committee_model_allocations" ADD CONSTRAINT "committee_model_allocations_committeeId_fkey" FOREIGN KEY ("committeeId") REFERENCES "exam_sessions"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "committee_model_allocations" ADD CONSTRAINT "committee_model_allocations_seasonId_fkey" FOREIGN KEY ("seasonId") REFERENCES "exam_seasons"("id") ON DELETE RESTRICT ON UPDATE CASCADE;