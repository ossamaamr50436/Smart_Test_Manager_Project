import { PrismaClient, Role } from "@prisma/client";
import bcrypt from "bcryptjs";

const prisma = new PrismaClient();

// ============================================================
// سكربت التنظيف التام لقاعدة البيانات (Neon)
// - حذف كل الجداول بالترتيب الصحيح (من المرتبطة إلى الأساسية)
// - استثناء وحيد: سجل app_settings (إعدادات المنصة) محفوظ
// - بعد الحذف: إنشاء حساب أدمن واحد فقط (المادة من o.txt)
// ============================================================

const ADMIN_EMAIL = "ossamaamr50436@gmail.com";
const ADMIN_PASSWORD = "ossamaamr50436@";
const ADMIN_NAME = "المسؤول العام";
const ADMIN_BIRTH_DATE = "1990-01-01";

async function main() {
  console.log("═══ مرحلة التنظيف التام ═══");
  console.log("قبل التنظيف — عدد المستخدمين:", await prisma.user.count());

  // 1) حذف كل البيانات بالترتيب الصحيح من الجداول المرتبطة إلى الأساسية
  // (الاستثناء الوحيد: app_settings تُحفظ)
  await prisma.$transaction([
    prisma.assessment.deleteMany(),
    prisma.certificate.deleteMany(),
    prisma.notification.deleteMany(),
    prisma.auditLog.deleteMany(),
    prisma.committeeModelAllocation.deleteMany(),
    prisma.examSession.deleteMany(),
    prisma.committee.deleteMany(),
    prisma.student.deleteMany(),
    prisma.examModel.deleteMany(),
    prisma.examSeason.deleteMany(),
    prisma.institution.deleteMany(),
    prisma.user.deleteMany(),
    prisma.rateLimit.deleteMany(),
    prisma.assessmentSettings.deleteMany(),
  ]);

  console.log("🗑️  تم حذف جميع البيانات.");

  // 2) ضمان وجود سجل إعدادات المنصة الوحيد (app_settings) — الاستثناء الوحيد
  const settingsCount = await prisma.appSettings.count();
  if (settingsCount === 0) {
    await prisma.appSettings.create({ data: {} });
    console.log("✅ تم إنشاء سجل app_settings الوحيد (الافتراضي).");
  } else {
    console.log(`✅ app_settings موجود (${settingsCount} سجل) — محفوظ كالمطلوب.`);
  }

  // 3) إنشاء حساب الأدمن الوحيد
  const hashed = await bcrypt.hash(ADMIN_PASSWORD, 12);
  await prisma.user.create({
    data: {
      name: ADMIN_NAME,
      email: ADMIN_EMAIL,
      password: hashed,
      role: Role.ADMIN,
      birthDate: new Date(ADMIN_BIRTH_DATE),
    },
  });
  console.log(`✅ تم إنشاء حساب الأدمن الوحيد: ${ADMIN_EMAIL}`);

  // 4) التحقق النهائي
  const userCount = await prisma.user.count();
  const institutionCount = await prisma.institution.count();
  const studentCount = await prisma.student.count();
  const modelCount = await prisma.examModel.count();
  const settingsFinal = await prisma.appSettings.count();

  console.log("═ النتائج النهائية ═");
  console.log("المستخدمون:", userCount, "(المطلوب: 1)");
  console.log("الجهات:", institutionCount, "(المطلوب: 0)");
  console.log("الطلاب:", studentCount, "(المطلوب: 0)");
  console.log("النماذج:", modelCount);
  console.log("app_settings:", settingsFinal, "(المطلوب: 1 — محفوظ)");

  if (userCount !== 1) {
    throw new Error(
      `فشل التحقق: عدد المستخدمين يجب أن يكون 1 فقط (الموجود: ${userCount})`
    );
  }
}

main()
  .catch((e) => {
    console.error("❌ حدث خطأ:", e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });