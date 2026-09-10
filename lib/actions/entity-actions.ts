"use server";

import { randomBytes } from "crypto";
import bcrypt from "bcryptjs";
import { requireUser, requireRole } from "@/lib/security";
import { prisma } from "@/lib/prisma";
import { AuditAction, Role } from "@prisma/client";
import { revalidatePath } from "next/cache";
import { checkRateLimit } from "@/lib/rate-limit";

// ============================================================
// المهمة 5: إنشاء جهة تعليمية (من لوحة الأخصائي)
// - توليد كلمة مرور عشوائية (8 أحرف) عبر crypto.randomBytes
// - تشفيرها بـ bcrypt
// - إنشاء جهة + مستخدم مرتبط بدور INSTITUTION (معاملة ذرّية)
// - إرجاع كلمة المرور النصية لعرضها مع زر نسخ
// ============================================================

const PASSWORD_LENGTH = 8;
const UPPER = "ABCDEFGHIJKLMNOPQRSTUVWXYZ";
const LOWER = "abcdefghijklmnopqrstuvwxyz";
const DIGITS = "0123456789";
const SYMBOLS = "!@#$%^&*_-+=";
const ALL = UPPER + LOWER + DIGITS + SYMBOLS;

/** توليد كلمة مرور قوية عشوائياً بتوزيع آمن (crypto.randomBytes) */
function generateStrongPassword(length = PASSWORD_LENGTH): string {
  if (length < 4) throw new Error("كلمة المرور قصيرة جداً");

  // ضمان الأمان: أرقام/رموز من عند البداية وتجنب البداية الحساسة
  const bytes = randomBytes(Math.max(length, 64));
  const required = [
    UPPER[bytes[0]! % UPPER.length]!,
    LOWER[bytes[1]! % LOWER.length]!,
    DIGITS[bytes[2]! % DIGITS.length]!,
    SYMBOLS[bytes[3]! % SYMBOLS.length]!,
  ];
  const picked: string[] = [...required];
  for (let i = 4; i < length; i++) {
    picked.push(ALL[bytes[i]! % ALL.length]!);
  }

  // خلط (Fisher–Yates) بأرقام عشوائية آمنة
  const shuffleBytes = randomBytes(picked.length * 2);
  for (let i = picked.length - 1; i > 0; i--) {
    const j = shuffleBytes[i]! % (i + 1);
    const tmp = picked[i]!;
    picked[i] = picked[j]!;
    picked[j] = tmp;
  }

  return picked.join("");
}

/** إنشاء جهة تعليمية جديدة برمز وصول — خاص بالأخصائي/الأدمن */
export async function createInstitutionBySpecialist(input: {
  name: string;
  email: string;
}): Promise<{ success: true; institutionId: string; password: string; email: string }> {
  const user = await requireUser();

  // عزل الصلاحيات: الأخصائي فقط (الجهات لا تُدار من المسؤول فقط)
  requireRole(user, [Role.TEST_SPECIALIST, Role.ADMIN]);

  // منع إساءة الاستخدام
  await checkRateLimit(`specialist-create-entity:${user.id}`, 10);

  const name = (input.name ?? "").trim();
  const email = (input.email ?? "").trim().toLowerCase();

  if (name.length < 2) throw new Error("اسم الجهة مطلوب (حرفان على الأقل)");
  if (name.length > 200) throw new Error("اسم الجهة طويل جداً (الحد الأقصى 200 حرف)");
  if (/<[^>]*>/.test(name)) throw new Error("اسم الجهة لا يسمح بوسوم HTML");
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
    throw new Error("البريد الإلكتروني غير صالح");
  }
  if (email.length > 254) throw new Error("البريد الإلكتروني طويل جداً");

  // منع التكرار
  const existing = await prisma.user.findUnique({ where: { email } });
  if (existing) throw new Error("يوجد حساب بنفس البريد الإلكتروني مسبقاً");

  // توليد كلمة مرور قوية (8 أحرف) وتشفيرها
  const plainPassword = generateStrongPassword(PASSWORD_LENGTH);
  const hashedPassword = await bcrypt.hash(plainPassword, 12);

  // معاملة ذرّية: إنشاء الجهة + حسابها المرتبط
  const result = await prisma.$transaction(async (tx) => {
    const institution = await tx.institution.create({
      data: { name },
    });

    const createdUser = await tx.user.create({
      data: {
        name: `حساب ${name}`,
        email,
        password: hashedPassword,
        role: Role.INSTITUTION,
        birthDate: new Date("1990-01-01"),
        institutionId: institution.id,
      },
    });

    await tx.auditLog.create({
      data: {
        userId: user.id,
        action: AuditAction.CREATE,
        details: JSON.stringify({
          entity: "Institution",
          institutionId: institution.id,
          name: institution.name,
          userId: createdUser.id,
        }),
      },
    });

    return { institutionId: institution.id };
  });

  revalidatePath("/test-specialist/entities/create");
  revalidatePath("/admin/institutions");

  // إرجاع كلمة المرور النصية مرة واحدة فقط لعرضها مع زر النسخ
  return { success: true, ...result, password: plainPassword, email };
}