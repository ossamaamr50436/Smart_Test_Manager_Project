import { PrismaClient } from "@prisma/client";
const p = new PrismaClient();
(async () => {
  const users = await p.user.findMany({
    select: { email: true, role: true, name: true, institutionId: true },
  });
  console.log("عدد المستخدمين:", users.length);
  users.forEach((u) => console.log(`- ${u.email} (${u.role}) — ${u.name}`));
  const committees = await p.committee.count();
  const models = await p.examModel.count();
  const students = await p.student.count();
  const assessments = await p.assessment.count();
  const institutions = await p.institution.count();
  const sessions = await p.examSession.count();
  console.log("--- إحصائيات ---");
  console.log("اللجان:", committees);
  console.log("النماذج:", models);
  console.log("الطلاب:", students);
  console.log("التقييمات:", assessments);
  console.log("الجهات:", institutions);
  console.log("الجلسات:", sessions);
})().finally(() => p.$disconnect());