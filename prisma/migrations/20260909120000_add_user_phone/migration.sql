-- Migration: إضافة حقل رقم الجوال إلى جدول المستخدمين
-- يستخدم في قناة إشعارات SMS (متعددة القنوات)

ALTER TABLE "users" ADD COLUMN "phone" TEXT;