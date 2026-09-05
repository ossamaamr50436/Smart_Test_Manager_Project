import { PrismaClient } from "@prisma/client";
import bcrypt from "bcryptjs";

const prisma = new PrismaClient();

// الحساب الرسمي النهائي للمنصة — المسؤول العام
const ADMIN_EMAIL = "ossamaamr50436@gmail.com";
const ADMIN_NAME = "Osama Amr (المسؤول العام)";
// كلمة مرور مؤقتة بسيطة (حروف وأرقام) — تُغيَّر بعد أول دخول
const ADMIN_TEMP_PASSWORD = "Aa123456";

async function main() {
  // تشفير كلمة المرور المؤقتة
  const hashedPassword = await bcrypt.hash(ADMIN_TEMP_PASSWORD, 10);

  // 1) إنشاء/تحديث حساب الأدمن الرسمي الوحيد
  const admin = await prisma.user.upsert({
    where: { email: ADMIN_EMAIL },
    update: {
      name: ADMIN_NAME,
      role: "ADMIN",
      birthDate: new Date("1990-01-01"),
    },
    create: {
      email: ADMIN_EMAIL,
      name: ADMIN_NAME,
      password: hashedPassword,
      role: "ADMIN",
      birthDate: new Date("1990-01-01"),
    },
  });

  console.log("✅ تم إنشاء/تأكيد المسؤول العام:", admin.email);

  // 2) حذف أي حسابات أخرى (مثل الحسابات التجريبية القديمة)
  //    مع الحفاظ على أي حساب يملك بيانات حقيقية مرتبطة به (لتفادي فقدان البيانات)
  const otherUsers = await prisma.user.findMany({
    where: { email: { not: ADMIN_EMAIL } },
    select: { id: true, email: true },
  });

  for (const u of otherUsers) {
    const referencesTotals =
      (await prisma.examSession.count({
        where: { OR: [{ teacher1Id: u.id }, { teacher2Id: u.id }] },
      })) +
      (await prisma.assessment.count({ where: { evaluatorId: u.id } })) +
      (await prisma.certificate.count({ where: { issuedById: u.id } })) +
      (await prisma.notification.count({ where: { userId: u.id } })) +
      (await prisma.auditLog.count({ where: { userId: u.id } }));

    if (referencesTotals > 0) {
      // حساب حقيقي يملك بيانات مرتبطة — يُحتفظ به (تحذير في التعليمات)
      console.log(`⚠️ تم الإبقاء على الحساب «${u.email}» لأنه يملك بيانات مرتبطة`);
      continue;
    }

    await prisma.user.delete({ where: { id: u.id } });
    console.log(`🗑️ تم حذف الحساب التجريبي «${u.email}»`);
  }

  console.log("✅ اكتمل التهيئة — باقي المستخدمون:", ADMIN_EMAIL);
}

main()
  .catch((e) => {
    console.error("❌ حدث خطأ:", e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });