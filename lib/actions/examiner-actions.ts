"use server";

import bcrypt from "bcryptjs";
import {
  requireUser,
  requireRole,
  type SessionUser,
} from "@/lib/security";
import { prisma } from "@/lib/prisma";
import { AuditAction, Role } from "@prisma/client";
import { revalidatePath } from "next/cache";
import {
  isUniqueConstraintError,
  friendlyUniqueMessage,
} from "@/lib/actions/unique-guard";
import { passwordSchema, birthDateSchema } from "@/lib/validations/user";
import { z } from "zod";

// ============================================================
// إدارة المعلمين (المرحلة 13) — خاص بالأخصائي/الأدمن
// إنشاء + إعادة تعيين كلمة المرور + حذف (EXAMINER فقط)
// ============================================================

const createExaminerSchema = z.object({
  name: z.string().min(2, "اسم المعلم لا يقل عن حرفين").max(120),
  email: z.string().email("بريد إلكتروني غير صحيح").max(254),
  password: passwordSchema,
  birthDate: birthDateSchema,
});

export type CreateExaminerInput = z.infer<typeof createExaminerSchema>;

function assertRole(user: SessionUser) {
  requireRole(user, [Role.TEST_SPECIALIST, Role.ADMIN]);
}

export async function createExaminer(input: CreateExaminerInput) {
  const user = await requireUser();
  assertRole(user);

  const parsed = createExaminerSchema.safeParse(input);
  if (!parsed.success) {
    throw new Error(parsed.error.issues[0]?.message ?? "بيانات المعلم غير صحيحة");
  }
  const data = parsed.data;

  const hashedPassword = await bcrypt.hash(data.password, 12);

  let created;
  try {
    created = await prisma.user.create({
      data: {
        name: data.name,
        email: data.email,
        password: hashedPassword,
        role: Role.EXAMINER,
        birthDate: data.birthDate,
        mustChangePassword: true,
      },
      select: { id: true, name: true, email: true },
    });
  } catch (error) {
    if (isUniqueConstraintError(error)) throw new Error(friendlyUniqueMessage(error));
    throw error;
  }

  await prisma.auditLog.create({
    data: {
      userId: user.id,
      action: AuditAction.CREATE,
      details: JSON.stringify({
        entity: "User",
        role: Role.EXAMINER,
        examinerId: created.id,
        email: data.email,
      }),
    },
  });

  revalidatePath("/test-specialist/teachers");
  return { success: true, examinerId: created.id };
}

export async function resetExaminerPassword(examinerId: string, newPassword: string) {
  const user = await requireUser();
  assertRole(user);

  if (!examinerId || typeof examinerId !== "string" || examinerId.length > 64) {
    throw new Error("معرّف المعلم غير صالح");
  }

  const parsedPassword = passwordSchema.safeParse(newPassword);
  if (!parsedPassword.success) {
    throw new Error(
      parsedPassword.error.issues[0]?.message ?? "كلمة المرور غير صالحة"
    );
  }

  const examiner = await prisma.user.findUnique({
    where: { id: examinerId },
    select: { id: true, role: true },
  });
  if (!examiner) throw new Error("المعلم غير موجود");
  if (examiner.role !== Role.EXAMINER) {
    throw new Error("هذا الحساب ليس حساب معلم");
  }

  const hashedPassword = await bcrypt.hash(parsedPassword.data, 12);

  await prisma.$transaction(async (tx) => {
    await tx.user.update({
      where: { id: examinerId },
      data: { password: hashedPassword, mustChangePassword: true },
    });
    await tx.auditLog.create({
      data: {
        userId: user.id,
        action: AuditAction.UPDATE,
        details: JSON.stringify({
          entity: "User",
          actionType: "reset_examiner_password",
          examinerId,
        }),
      },
    });
  });

  revalidatePath("/test-specialist/teachers");
  return { success: true };
}

export async function deleteExaminer(examinerId: string) {
  const user = await requireUser();
  assertRole(user);

  if (!examinerId || typeof examinerId !== "string" || examinerId.length > 64) {
    throw new Error("معرّف المعلم غير صالح");
  }

  const examiner = await prisma.user.findUnique({
    where: { id: examinerId },
    select: {
      id: true,
      name: true,
      role: true,
      _count: {
        select: {
          sessionsAsTeacher1: true,
          sessionsAsTeacher2: true,
          committeesAsTeacher1: true,
          committeesAsTeacher2: true,
          assessments: true,
        },
      },
    },
  });
  if (!examiner) throw new Error("المعلم غير موجود");
  if (examiner.role !== Role.EXAMINER) {
    throw new Error("هذا الحساب ليس حساب معلم");
  }

  const inUse =
    examiner._count.sessionsAsTeacher1 +
    examiner._count.sessionsAsTeacher2 +
    examiner._count.committeesAsTeacher1 +
    examiner._count.committeesAsTeacher2 +
    examiner._count.assessments;

  if (inUse > 0) {
    throw new Error(
      `لا يمكن حذف المعلم «${examiner.name}» لارتباطه بـ ${inUse} لجنة/جلسة/تقييم — يمكن تعطيله عبر إعادة تعيين كلمة المرور فقط`
    );
  }

  await prisma.$transaction(async (tx) => {
    await tx.user.delete({ where: { id: examinerId } });
    await tx.auditLog.create({
      data: {
        userId: user.id,
        action: AuditAction.DELETE,
        details: JSON.stringify({
          entity: "User",
          role: Role.EXAMINER,
          examinerId,
          name: examiner.name,
        }),
      },
    });
  });

  revalidatePath("/test-specialist/teachers");
  return { success: true };
}

/** جلب قائمة المعلمين (EXAMINER) مع إحصاءات الارتباط */
export async function getExaminersList() {
  const user = await requireUser();
  assertRole(user);

  return prisma.user.findMany({
    where: { role: Role.EXAMINER },
    select: {
      id: true,
      name: true,
      email: true,
      birthDate: true,
      createdAt: true,
      _count: {
        select: {
          sessionsAsTeacher1: true,
          sessionsAsTeacher2: true,
          committeesAsTeacher1: true,
          committeesAsTeacher2: true,
        },
      },
    },
    orderBy: { name: "asc" },
  });
}