import { PrismaClient, Role } from "@prisma/client";
import bcrypt from "bcryptjs";

const prisma = new PrismaClient();

// ============================================================
// سكربت تصحيح/تنظيف المستخدمين (المهمة المطلوبة من o.txt)
// - الإبقاء على ستة مستخدمين فقط (بريد/دور/كلمة مرور محددة)
// - حذف بقية المستخدمين الزائدين مع بياناتهم المرتبطة
// - ربط حساب الجهة inst.cmtubnfm@example.com بجهة رسمية
// ============================================================

type TargetUser = {
  email: string;
  role: Role;
  password: string;
  name: string;
};

const TARGET_USERS: TargetUser[] = [
  {
    email: "admin@example.com",
    role: Role.ADMIN,
    password: "QuranAdmin2026!Strong",
    name: "المسؤول العام",
  },
  {
    email: "specialist@example.com",
    role: Role.TEST_SPECIALIST,
    password: "QuranTest2026!Strong",
    name: "أخصائي الاختبارات",
  },
  {
    email: "head.affairs@example.com",
    role: Role.HEAD_OF_AFFAIRS,
    password: "QuranTest2026!Strong",
    name: "رئيس الشؤون التعليمية",
  },
  {
    email: "certificate.source@example.com",
    role: Role.CERTIFICATE_SOURCE,
    password: "QuranTest2026!Strong",
    name: "مصدر الشهادات",
  },
  {
    email: "ahmed.mohammad@example.com",
    role: Role.EXAMINER,
    password: "QuranTest2026!Strong",
    name: "أحمد محمد",
  },
  {
    email: "inst.cmtubnfm@example.com",
    role: Role.INSTITUTION,
    password: "oossaammaammrr2011@",
    name: "حساب جمعية تعليم القرآن وعلومه",
  },
];

const TARGET_EMAILS = TARGET_USERS.map((u) => u.email);

async function main() {
  const allUsers = await prisma.user.findMany({
    select: { id: true, email: true, role: true },
  });

  const toDelete = allUsers.filter((u) => !TARGET_EMAILS.includes(u.email));
  const toDeleteIds = toDelete.map((u) => u.id);

  console.log(
    `ℹ️  إجمالي المستخدمين: ${allUsers.length} — سيتم حذف ${toDelete.length} (الإبقاء على 6)`
  );

  if (toDeleteIds.length > 0) {
    // 1) حذف جلسات الاختبار المرتبطة بالمعلمين المحذوفين (قيد Restrict)
    const sessions = await prisma.examSession.findMany({
      where: {
        OR: [
          { teacher1Id: { in: toDeleteIds } },
          { teacher2Id: { in: toDeleteIds } },
        ],
      },
      select: { id: true },
    });
    await prisma.examSession.deleteMany({
      where: { id: { in: sessions.map((s) => s.id) } },
    });
    if (sessions.length > 0) {
      console.log(`🗑️  حذف ${sessions.length} جلسة اختبار مرتبطة بمعلمين محذوفين`);
    }

    // 2) حذف المستخدمين الزائدين (سجلات التدقيق والإشعارات تُصفَّر عبر SetNull)
    const deleted = await prisma.user.deleteMany({
      where: { id: { in: toDeleteIds } },
    });
    console.log(`🗑️  حذف ${deleted.count} مستند من المستخدمين الزائدين`);
  }

  // 3) ضمان وجود الجهة الرسمية لحساب الجهة
  const entityInstitution = await prisma.institution.findFirst({
    where: { name: "جمعية تعليم القرآن وعلومه — فرع المدينة المنورة" },
  });
  const institutionId = entityInstitution?.id ?? null;
  if (!institutionId) {
    const created = await prisma.institution.create({
      data: {
        name: "جمعية تعليم القرآن وعلومه — فرع المدينة المنورة",
        managerName: "مدير الجهة",
        supervisorName: "مشرف الجهة",
        managerPhone: "+966500000000",
        supervisorPhone: "+966500000001",
        licenseNumber: "LIC-0001",
        district: "الحي العام",
        contactInfo: "0590000000",
      },
    });
    console.log("✅ إنشاء الجهة الرسمية:", created.id);
  }

  // 4) تحديث/إنشاء المستخدمين الستة بأدوارهم وكلمات مرورهم
  for (const target of TARGET_USERS) {
    const hashed = await bcrypt.hash(target.password, 12);
    const data = {
      name: target.name,
      role: target.role,
      password: hashed,
      birthDate: new Date("1990-01-01"),
      ...(target.role === Role.INSTITUTION
        ? { institutionId: institutionId ?? undefined }
        : {}),
    };
    await prisma.user.upsert({
      where: { email: target.email },
      update: data,
      create: { email: target.email, ...data },
    });
    console.log(`✅ ${target.email} ← ${target.role}`);
  }

  const finalCount = await prisma.user.count();
  console.log(`🏁 اكتمل التنظيف — عدد المستخدمين النهائي: ${finalCount}`);
}

main()
  .catch((e) => {
    console.error("❌ حدث خطأ:", e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });