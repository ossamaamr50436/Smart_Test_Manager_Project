-- AlterTable
ALTER TABLE "students" ADD COLUMN     "approvedAt" TIMESTAMP(3),
ADD COLUMN     "assignedAt" TIMESTAMP(3),
ADD COLUMN     "finalizedAt" TIMESTAMP(3);