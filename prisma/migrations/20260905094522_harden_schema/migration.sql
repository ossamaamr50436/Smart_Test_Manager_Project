-- Harden schema (المادة 4 في الجولة النهائية)
-- 1) birthDate إجبارية للمستخدمين (نظام الترتيب العمري)
-- 2) seasonId إجبارية في exam_models و exam_sessions (المادة 6)
-- 3) قيد فريد يمنع تكرار نفس النموذج لنفس الموسم (على مستوى الجلسة)
-- 4) استبدال @@unique([examSessionId, modelId]) بـ @@unique([examSessionId, evaluatorId])
-- 5) serialNumber افتراضي cuid + حقول fileId/signatureFileId للخصوصية

-- DropForeignKey
ALTER TABLE "exam_models" DROP CONSTRAINT "exam_models_seasonId_fkey";

-- DropForeignKey
ALTER TABLE "exam_sessions" DROP CONSTRAINT "exam_sessions_seasonId_fkey";

-- DropIndex
DROP INDEX "assessments_examSessionId_modelId_key";

-- AlterTable
ALTER TABLE "certificates" ADD COLUMN     "fileId" TEXT,
ADD COLUMN     "signatureFileId" TEXT;

-- AlterTable
ALTER TABLE "exam_models" ALTER COLUMN "seasonId" SET NOT NULL;

-- AlterTable
ALTER TABLE "exam_sessions" ADD COLUMN     "modelId" TEXT,
ALTER COLUMN "seasonId" SET NOT NULL;

-- AlterTable
ALTER TABLE "users" ALTER COLUMN "birthDate" SET NOT NULL;

-- CreateIndex
CREATE UNIQUE INDEX "assessments_examSessionId_evaluatorId_key" ON "assessments"("examSessionId", "evaluatorId");

-- CreateIndex
CREATE UNIQUE INDEX "exam_sessions_seasonId_modelId_key" ON "exam_sessions"("seasonId", "modelId");

-- AddForeignKey
ALTER TABLE "exam_models" ADD CONSTRAINT "exam_models_seasonId_fkey" FOREIGN KEY ("seasonId") REFERENCES "exam_seasons"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "exam_sessions" ADD CONSTRAINT "exam_sessions_seasonId_fkey" FOREIGN KEY ("seasonId") REFERENCES "exam_seasons"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "exam_sessions" ADD CONSTRAINT "exam_sessions_modelId_fkey" FOREIGN KEY ("modelId") REFERENCES "exam_models"("id") ON DELETE SET NULL ON UPDATE CASCADE;