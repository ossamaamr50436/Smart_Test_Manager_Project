-- AlterEnum
ALTER TYPE "StudentStatus" ADD VALUE 'REJECTED_BY_HEAD';
ALTER TYPE "AssessmentStatus" ADD VALUE 'REJECTED_BY_HEAD';

-- AlterTable
ALTER TABLE "students" ADD COLUMN     "rejectionReason" TEXT,
ADD COLUMN     "rejectedAt" TIMESTAMP(3),
ADD COLUMN     "rejectedById" TEXT;

-- CreateIndex
CREATE INDEX "students_tenantId_rejectedById_idx" ON "students"("tenantId", "rejectedById");

-- AddForeignKey
ALTER TABLE "students" ADD CONSTRAINT "students_rejectedById_fkey" FOREIGN KEY ("rejectedById") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;