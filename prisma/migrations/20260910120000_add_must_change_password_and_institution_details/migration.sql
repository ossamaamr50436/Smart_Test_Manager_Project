-- AlterTable
ALTER TABLE "institutions" ADD COLUMN     "district" TEXT NOT NULL,
ADD COLUMN     "licenseNumber" TEXT NOT NULL,
ADD COLUMN     "managerName" TEXT NOT NULL,
ADD COLUMN     "managerPhone" TEXT NOT NULL,
ADD COLUMN     "supervisorName" TEXT NOT NULL,
ADD COLUMN     "supervisorPhone" TEXT NOT NULL;

-- AlterTable
ALTER TABLE "users" ADD COLUMN     "mustChangePassword" BOOLEAN NOT NULL DEFAULT false;

-- CreateIndex
CREATE UNIQUE INDEX "institutions_licenseNumber_key" ON "institutions"("licenseNumber");

-- CreateIndex
CREATE INDEX "institutions_licenseNumber_idx" ON "institutions"("licenseNumber");
