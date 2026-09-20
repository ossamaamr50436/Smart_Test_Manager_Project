-- AlterTable
-- D1 — Dark Mode Tokens: إضافة نظام ألوان متكامل للوضع الداكن إلى إعدادات المنصة (AppSettings)
-- التسلسل: snapshot → schema → migration يدوي (additive) → generate → verify → runtime test
-- آمنة: إضافة أعمدة مع قيم افتراضية فقط، لا حذف بيانات ولا RLS
-- كل لون داكن مقترن بلون نص مناسب يضمن تبايناً واضحاً في الوضع الداكن.

ALTER TABLE "app_settings"
  ADD COLUMN "primaryColorDark"             TEXT NOT NULL DEFAULT '#0e6e73',
  ADD COLUMN "secondaryColorDark"           TEXT NOT NULL DEFAULT '#e2d3ab',
  ADD COLUMN "accentColorDark"              TEXT NOT NULL DEFAULT '#0f1a22',
  ADD COLUMN "backgroundColorDark"          TEXT NOT NULL DEFAULT '#0e171b',
  ADD COLUMN "textColorDark"                TEXT NOT NULL DEFAULT '#eef1f4',
  ADD COLUMN "borderColorDark"              TEXT NOT NULL DEFAULT '#24343e',
  ADD COLUMN "sidebarBgDark"                TEXT NOT NULL DEFAULT '#071014',
  ADD COLUMN "sidebarTextDark"              TEXT NOT NULL DEFAULT '#dbe7ec',
  ADD COLUMN "sidebarActiveBgDark"          TEXT NOT NULL DEFAULT '#015e63',
  ADD COLUMN "sidebarActiveTextDark"        TEXT NOT NULL DEFAULT '#ffffff',
  ADD COLUMN "topbarBgDark"                 TEXT NOT NULL DEFAULT '#121c22',
  ADD COLUMN "topbarTextDark"               TEXT NOT NULL DEFAULT '#eef1f4',
  ADD COLUMN "loginBgDark"                  TEXT NOT NULL DEFAULT '#0a1416',
  ADD COLUMN "loginGradientFromDark"        TEXT NOT NULL DEFAULT '#06282b',
  ADD COLUMN "loginGradientToDark"          TEXT NOT NULL DEFAULT '#182830',
  ADD COLUMN "loginCardBgDark"              TEXT NOT NULL DEFAULT '#121c22',
  ADD COLUMN "buttonPrimaryBgDark"          TEXT NOT NULL DEFAULT '#0e6e73',
  ADD COLUMN "buttonPrimaryTextDark"        TEXT NOT NULL DEFAULT '#ffffff',
  ADD COLUMN "buttonSecondaryBgDark"        TEXT NOT NULL DEFAULT '#d3bb8b',
  ADD COLUMN "buttonSecondaryTextDark"      TEXT NOT NULL DEFAULT '#0f172a';