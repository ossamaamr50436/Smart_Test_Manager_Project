-- DropIndex
DROP INDEX "committees_name_seasonId_key";

-- DropIndex
DROP INDEX "exam_models_modelNumber_seasonId_branch_key";

-- AlterTable
ALTER TABLE "assessment_settings" ALTER COLUMN "tenantId" SET NOT NULL;

-- AlterTable
ALTER TABLE "assessments" ALTER COLUMN "tenantId" SET NOT NULL;

-- AlterTable
ALTER TABLE "audit_logs" ALTER COLUMN "tenantId" SET NOT NULL;

-- AlterTable
ALTER TABLE "certificates" ALTER COLUMN "tenantId" SET NOT NULL;

-- AlterTable
ALTER TABLE "committees" ALTER COLUMN "tenantId" SET NOT NULL;

-- AlterTable
ALTER TABLE "exam_models" ALTER COLUMN "tenantId" SET NOT NULL;

-- AlterTable
ALTER TABLE "exam_seasons" ALTER COLUMN "tenantId" SET NOT NULL;

-- AlterTable
ALTER TABLE "exam_sessions" ALTER COLUMN "tenantId" SET NOT NULL;

-- AlterTable
ALTER TABLE "institutions" ALTER COLUMN "tenantId" SET NOT NULL;

-- AlterTable
ALTER TABLE "notifications" ALTER COLUMN "tenantId" SET NOT NULL;

-- AlterTable
ALTER TABLE "students" ALTER COLUMN "tenantId" SET NOT NULL;

-- CreateIndex
CREATE UNIQUE INDEX "assessment_settings_tenantId_key" ON "assessment_settings"("tenantId");

-- CreateIndex
CREATE UNIQUE INDEX "committees_tenantId_name_seasonId_key" ON "committees"("tenantId", "name", "seasonId");

-- CreateIndex
CREATE UNIQUE INDEX "exam_models_tenantId_modelNumber_seasonId_branch_key" ON "exam_models"("tenantId", "modelNumber", "seasonId", "branch");