-- DropForeignKey
ALTER TABLE "exam_models" DROP CONSTRAINT "exam_models_seasonId_fkey";

-- AlterTable
ALTER TABLE "exam_models" ALTER COLUMN "seasonId" DROP NOT NULL;

-- AddForeignKey
ALTER TABLE "exam_models" ADD CONSTRAINT "exam_models_seasonId_fkey" FOREIGN KEY ("seasonId") REFERENCES "exam_seasons"("id") ON DELETE SET NULL ON UPDATE CASCADE;

