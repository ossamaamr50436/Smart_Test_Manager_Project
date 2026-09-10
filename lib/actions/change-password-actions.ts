"use server";

import bcrypt from "bcryptjs";
import { requireUser } from "@/lib/security";
import { prisma } from "@/lib/prisma";
import { AuditAction } from "@prisma/client";
import { passwordSchema } from "@/lib/validations/user";
import { revalidatePath } from "next/cache";
import { checkRateLimit } from "@/lib/rate-limit";

/**
 * تغيير كلمة مرور المستخدم الحالي (المرحلة 4)
 * إلزامية عند أول دخول (mustChangePassword) ثم برغبة المستخدم
 */
export async function changeMyPassword(
  currentPassword: string,
  newPassword: string
): Promise<{ success: boolean }> {
  const user = await requireUser();

  await checkRateLimit(`change-password:${user.id}`, 10);

  const parsedCurrent = typeof currentPassword === "string" ? currentPassword.trim() : "";
  if (!parsedCurrent) {
    throw new Error("كلمة المرور الحالية مطلوبة");
  }

  const parsedNew = passwordSchema.safeParse(newPassword);
  if (!parsedNew.success) {
    throw new Error(parsedNew.error.issues[0]?.message ?? "كلمة المرور الجديدة غير صالحة");
  }

  if (parsedNew.data === parsedCurrent) {
    throw new Error("كلمة المرور الجديدة يجب أن تختلف عن الحالية");
  }

  const row = await prisma.user.findUnique({
    where: { id: user.id },
    select: { id: true, password: true },
  });
  if (!row) throw new Error("المستخدم غير موجود");

  const isValid = await bcrypt.compare(parsedCurrent, row.password);
  if (!isValid) {
    throw new Error("كلمة المرور الحالية غير صحيحة");
  }

  const hashedPassword = await bcrypt.hash(parsedNew.data, 12);

  await prisma.$transaction(async (tx) => {
    await tx.user.update({
      where: { id: user.id },
      data: { password: hashedPassword, mustChangePassword: false },
    });
    await tx.auditLog.create({
      data: {
        userId: user.id,
        action: AuditAction.UPDATE,
        details: JSON.stringify({
          entity: "User",
          actionType: "change_password",
          mustChangePasswordCleared: true,
        }),
      },
    });
  });

  revalidatePath("/change-password");
  return { success: true };
}