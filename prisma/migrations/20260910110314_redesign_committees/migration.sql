-- DropForeignKey
ALTER TABLE "committee_model_allocations" DROP CONSTRAINT "committee_model_allocations_committeeId_fkey";

-- AlterTable
ALTER TABLE "students" ADD COLUMN     "committeeId" TEXT,
ADD COLUMN     "nationality" TEXT NOT NULL DEFAULT 'السعودية';

-- CreateTable
CREATE TABLE "committees" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "branch" TEXT NOT NULL,
    "seasonId" TEXT NOT NULL,
    "teacher1Id" TEXT NOT NULL,
    "teacher2Id" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "committees_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "assessment_settings" (
    "id" TEXT NOT NULL DEFAULT 'singleton',
    "errorDeduction" DOUBLE PRECISION NOT NULL DEFAULT 2.0,
    "doubtDeduction" DOUBLE PRECISION NOT NULL DEFAULT 1.0,
    "tajweedDeduction" DOUBLE PRECISION NOT NULL DEFAULT 0.5,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "assessment_settings_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "committees_seasonId_idx" ON "committees"("seasonId");

-- CreateIndex
CREATE INDEX "committees_branch_idx" ON "committees"("branch");

-- CreateIndex
CREATE UNIQUE INDEX "committees_name_seasonId_key" ON "committees"("name", "seasonId");

-- CreateIndex
CREATE INDEX "students_committeeId_idx" ON "students"("committeeId");

-- AddForeignKey
ALTER TABLE "students" ADD CONSTRAINT "students_committeeId_fkey" FOREIGN KEY ("committeeId") REFERENCES "committees"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "committees" ADD CONSTRAINT "committees_seasonId_fkey" FOREIGN KEY ("seasonId") REFERENCES "exam_seasons"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "committees" ADD CONSTRAINT "committees_teacher1Id_fkey" FOREIGN KEY ("teacher1Id") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "committees" ADD CONSTRAINT "committees_teacher2Id_fkey" FOREIGN KEY ("teacher2Id") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "committee_model_allocations" ADD CONSTRAINT "committee_model_allocations_committeeId_fkey" FOREIGN KEY ("committeeId") REFERENCES "committees"("id") ON DELETE CASCADE ON UPDATE CASCADE;
