-- AlterTable — Tenant Design Settings (Tenant-Scoped Design Tokens)
-- جدول جديد لتخزين إعدادات التصميم الخاصة بكل مؤسسة
CREATE TABLE "TenantDesignSettings" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "tokens" JSONB NOT NULL DEFAULT '{}',
    "updatedBy" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    CONSTRAINT "TenantDesignSettings_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "TenantDesignSettings_tenantId_key" ON "TenantDesignSettings"("tenantId");

ALTER TABLE "TenantDesignSettings" ADD CONSTRAINT "TenantDesignSettings_tenantId_fkey"
  FOREIGN KEY ("tenantId") REFERENCES "tenants"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "TenantDesignSettings" ADD CONSTRAINT "TenantDesignSettings_updatedBy_fkey"
  FOREIGN KEY ("updatedBy") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;
