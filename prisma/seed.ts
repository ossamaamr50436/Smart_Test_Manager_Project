import { PrismaClient } from "@prisma/client";
import bcrypt from "bcryptjs";

const prisma = new PrismaClient();

// الحساب الرسمي النهائي للمنصة — المسؤول العام
// تُقرأ بيانات الأدمن من متغيرات البيئة بدلاً من تخزينها في الكود (أمان)
const ADMIN_EMAIL = process.env.ADMIN_EMAIL || "";
const ADMIN_NAME = process.env.ADMIN_NAME || "المسؤول العام";
const ADMIN_PASSWORD = process.env.ADMIN_PASSWORD || "";
const ADMIN_BIRTH_DATE = process.env.ADMIN_BIRTH_DATE || "1990-01-01";

async function main() {
  // منع تشغيل البذر بدون كلمة مرور للأدمن (لا ننشئ حساباً بكلمة مرور معروفة)
  if (!ADMIN_EMAIL || !ADMIN_PASSWORD) {
    console.error(
      "❌ يجب ضبط ADMIN_EMAIL و ADMIN_PASSWORD في متغيرات البيئة لتشغيل البذر — يُرفض بسبب الأمان"
    );
    process.exit(1);
  }

  if (ADMIN_PASSWORD.length < 12) {
    console.error(
      "❌ كلمة مرور الأدمن يجب أن تكون 12 حرفاً على الأقل — تُرفض كلمة المرور الضعيفة"
    );
    process.exit(1);
  }

  // تشفير كلمة المرور
  const hashedPassword = await bcrypt.hash(ADMIN_PASSWORD, 12);

  // 1) إنشاء/تحديث حساب الأدمن الرسمي الوحيد
  //    تحديث كلمة المرور أيضاً: كلمة المرور القديمة كانت مكشوفة في Git History
  //    لذا يجب تدويرها عند كل بذر متعمد بمتغير بيئة جديد.
  const admin = await prisma.user.upsert({
    where: { email: ADMIN_EMAIL },
    update: {
      name: ADMIN_NAME,
      role: "ADMIN",
      birthDate: new Date(ADMIN_BIRTH_DATE),
      password: hashedPassword,
    },
    create: {
      email: ADMIN_EMAIL,
      name: ADMIN_NAME,
      password: hashedPassword,
      role: "ADMIN",
      birthDate: new Date(ADMIN_BIRTH_DATE),
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