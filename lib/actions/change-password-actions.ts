"use server";

import bcrypt from "bcryptjs";
import { requireUser } from "@/lib/security";
import { prisma } from "@/lib/prisma";
import { AuditAction } from "@prisma/client";
import { passwordSchema } from "@/lib/validations/user";
import { revalidatePath } from "next/cache";
import { checkRateLimit } from "@/lib/rate-limit";

export type ChangePasswordResult =
  | { success: true }
  | { success: false; error: string; fieldErrors?: Record<string, string> };

/**
 * تغيير كلمة مرور المستخدم الحالي (المرحلة 4)
 * إلزامية عند أول دخول (mustChangePassword) ثم برغبة المستخدم
 * جميع رسائل الخطأ عربية، والإرجاع Union Type بدلاً من throw.
 */
export async function changeMyPassword(
  currentPassword: string,
  newPassword: string,
  confirmPassword?: string
): Promise<ChangePasswordResult> {
  const user = await requireUser();

  await checkRateLimit(`change-password:${user.id}`, 10);

  const parsedCurrent = typeof currentPassword === "string" ? currentPassword.trim() : "";
  if (!parsedCurrent) {
    return {
      success: false,
      error: "كلمة المرور الحالية مطلوبة",
      fieldErrors: { currentPassword: "كلمة المرور الحالية مطلوبة" },
    };
  }

  const parsedNew = passwordSchema.safeParse(newPassword);
  if (!parsedNew.success) {
    const details = parsedNew.error.issues.map((issue) => issue.message).join("، ");
    return {
      success: false,
      error: `كلمة المرور ضعيفة: ${details}`,
      fieldErrors: { newPassword: details },
    };
  }

  if (parsedNew.data === parsedCurrent) {
    return {
      success: false,
      error: "كلمة المرور الجديدة يجب أن تختلف عن كلمة المرور الحالية",
      fieldErrors: {
        newPassword: "كلمة المرور الجديدة يجب أن تختلف عن كلمة المرور الحالية",
      },
    };
  }

  if (confirmPassword !== undefined && parsedNew.data !== confirmPassword) {
    return {
      success: false,
      error: "كلمتا المرور غير متطابقتين",
      fieldErrors: { confirmPassword: "كلمتا المرور غير متطابقتين" },
    };
  }

  const row = await prisma.user.findUnique({
    where: { id: user.id },
    select: { id: true, password: true },
  });
  if (!row) {
    return { success: false, error: "المستخدم غير موجود" };
  }

  const isValid = await bcrypt.compare(parsedCurrent, row.password);
  if (!isValid) {
    return {
      success: false,
      error: "كلمة المرور الحالية غير صحيحة",
      fieldErrors: { currentPassword: "كلمة المرور الحالية غير صحيحة" },
    };
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