-- AlterTable
ALTER TABLE "students" ADD COLUMN     "submittedById" TEXT;

-- CreateIndex
CREATE INDEX "students_tenantId_submittedById_idx" ON "students"("tenantId", "submittedById");

-- AddForeignKey
ALTER TABLE "students" ADD CONSTRAINT "students_submittedById_fkey" FOREIGN KEY ("submittedById") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;