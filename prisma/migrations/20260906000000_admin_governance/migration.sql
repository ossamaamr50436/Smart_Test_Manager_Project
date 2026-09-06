-- Admin Governance: extend AppSettings with colors, whatsapp, dark mode
ALTER TABLE "app_settings"
  ADD COLUMN "primaryColor" TEXT NOT NULL DEFAULT '#015e63',
  ADD COLUMN "secondaryColor" TEXT NOT NULL DEFAULT '#d3bb8b',
  ADD COLUMN "whatsappNumber" TEXT,
  ADD COLUMN "darkModeEnabled" BOOLEAN NOT NULL DEFAULT false;
