import { PrismaClient } from '@prisma/client';
import bcrypt from 'bcryptjs';

const prisma = new PrismaClient();

async function main() {
  // تشفير كلمة المرور
  const hashedPassword = await bcrypt.hash('admin123', 10);

  // إنشاء مستخدم أخصائي اختبارات
  const user = await prisma.user.upsert({
    where: { email: 'specialist@example.com' },
    update: {},
    create: {
      email: 'specialist@example.com',
      name: 'أخصائي الاختبارات',
      password: hashedPassword,
      role: 'TEST_SPECIALIST',
      birthDate: new Date('1980-01-01'), // تاريخ ميلاد وهمي
    },
  });

  console.log('✅ تم إنشاء المستخدم بنجاح:', user.email);
}

main()
  .catch((e) => {
    console.error('❌ حدث خطأ:', e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });