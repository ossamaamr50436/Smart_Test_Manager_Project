-- DropIndex
DROP INDEX "exam_models_institutionId_modelNumber_seasonId_branch_key";

-- CreateIndex
CREATE UNIQUE INDEX "exam_models_modelNumber_seasonId_branch_key" ON "exam_models"("modelNumber", "seasonId", "branch");
