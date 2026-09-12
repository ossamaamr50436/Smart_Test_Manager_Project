-- AlterTable
ALTER TABLE "notifications" ALTER COLUMN "tenantId" DROP NOT NULL;

-- AlterTable
ALTER TABLE "audit_logs" ALTER COLUMN "tenantId" DROP NOT NULL;