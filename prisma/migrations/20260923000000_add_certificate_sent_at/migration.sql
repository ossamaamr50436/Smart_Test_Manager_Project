-- AlterTable — M16-E: تسجيل وقت الإرسال الفعلي للشهادة
-- sentAt nullable حتى لا تتأثر الشهادات القديمة (تبقى NULL قبل الإرسال)
ALTER TABLE "certificates" ADD COLUMN "sentAt" TIMESTAMP(3);