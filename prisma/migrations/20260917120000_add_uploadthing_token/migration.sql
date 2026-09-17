-- AlterTable
ALTER TABLE "tenants" DROP COLUMN "driveFolderId",
DROP COLUMN "driveFolderUrl",
ADD COLUMN     "uploadthingToken" TEXT,
ADD COLUMN     "uploadthingTokenHash" TEXT;

-- CreateIndex
CREATE INDEX "tenants_uploadthingTokenHash_idx" ON "tenants"("uploadthingTokenHash");