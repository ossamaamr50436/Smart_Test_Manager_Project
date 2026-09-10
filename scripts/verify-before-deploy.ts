import { PrismaClient } from "@prisma/client";

const p = new PrismaClient();

(async () => {
  console.log("=== إحصائيات ===");
  console.log("Users:", await p.user.count());
  console.log("Institutions:", await p.institution.count());
  console.log("Students:", await p.student.count());
  console.log("Seasons:", await p.examSeason.count());
  console.log("Models branch 30:", await p.examModel.count({ where: { branch: "30" } }));

  console.log("");
  console.log("=== المستخدمون ===");
  const users = await p.user.findMany({
    select: { email: true, role: true, mustChangePassword: true },
  });
  users.forEach((u) =>
    console.log("-", u.email, "|", u.role, "| mustChange:", u.mustChangePassword)
  );

  await p.$disconnect();
})();
