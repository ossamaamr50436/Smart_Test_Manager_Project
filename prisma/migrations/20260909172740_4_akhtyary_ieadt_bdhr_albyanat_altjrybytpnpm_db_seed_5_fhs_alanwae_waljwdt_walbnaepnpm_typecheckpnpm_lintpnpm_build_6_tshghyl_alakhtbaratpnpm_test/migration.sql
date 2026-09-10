/*
  Warnings:

  - You are about to drop the column `doubtsCount` on the `assessments` table. All the data in the column will be lost.
  - You are about to drop the column `errorsCount` on the `assessments` table. All the data in the column will be lost.
  - You are about to drop the column `tajweedCount` on the `assessments` table. All the data in the column will be lost.

*/
-- AlterTable
ALTER TABLE "assessments" DROP COLUMN "doubtsCount",
DROP COLUMN "errorsCount",
DROP COLUMN "tajweedCount";
