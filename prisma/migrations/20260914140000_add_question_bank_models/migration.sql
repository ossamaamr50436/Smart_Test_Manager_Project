-- CreateTable
CREATE TABLE "question_bank_models" (
    "id" TEXT NOT NULL,
    "modelNumber" INTEGER NOT NULL,
    "branch" TEXT NOT NULL,
    "detailsJSON" JSONB NOT NULL,
    "segmentsCount" INTEGER NOT NULL DEFAULT 10,
    "tenantId" TEXT NOT NULL,

    CONSTRAINT "question_bank_models_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "question_bank_models_tenantId_idx" ON "question_bank_models"("tenantId");

-- CreateIndex
CREATE INDEX "question_bank_models_tenantId_branch_idx" ON "question_bank_models"("tenantId", "branch");

-- CreateIndex
CREATE UNIQUE INDEX "question_bank_models_tenantId_modelNumber_branch_key" ON "question_bank_models"("tenantId", "modelNumber", "branch");

-- AddForeignKey
ALTER TABLE "question_bank_models" ADD CONSTRAINT "question_bank_models_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "tenants"("id") ON DELETE CASCADE ON UPDATE CASCADE;