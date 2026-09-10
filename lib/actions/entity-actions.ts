"use server";

import bcrypt from "bcryptjs";
import { requireUser, requireRole } from "@/lib/security";
import { prisma } from "@/lib/prisma";
import { AuditAction, Role } from "@prisma/client";
import { revalidatePath } from "next/cache";
import { checkRateLimit } from "@/lib/rate-limit";
import {
  isUniqueConstraintError,
  friendlyUniqueMessage,
} from "@/lib/actions/unique-guard";
import { validatePhoneE164 } from "@/lib/phone-countries";

// ============================================================
// إنشاء جهة تعليمية (المرحلتان 4 و 10 — لوحة الأخصائي)
// - كلمة المرور التلقائية = رقم التصريح (licenseNumber)
// - mustChangePassword = true (إجبار التغيير بعد أول دخول)
// - معاملة ذرّية: الجهة + حسابها المرتبط بدور INSTITUTION
// - إرجاع كلمة المرور لعرضها مع زر نسخ
// ============================================================

/** إنشاء جهة تعليمية جديدة برمز وصول — خاص بالأخصائي/الأدمن */
export async function createInstitutionBySpecialist(input: {
  name: string;
  managerName: string;
  supervisorName: string;
  managerPhone: string;
  supervisorPhone: string;
  licenseNumber: string;
  district: string;
  email: string;
}): Promise<{
  success: true;
  institutionId: string;
  password: string;
  email: string;
}> {
  const user = await requireUser();

  // عزل الصلاحيات: الأخصائي أو الأدمن (الجهات تُدار من الأخصائي)
  requireRole(user, [Role.TEST_SPECIALIST, Role.ADMIN]);

  // منع إساءة الاستخدام
  await checkRateLimit(`specialist-create-entity:${user.id}`, 10);

  const name = (input.name ?? "").trim();
  const managerName = (input.managerName ?? "").trim();
  const supervisorName = (input.supervisorName ?? "").trim();
  const managerPhone = (input.managerPhone ?? "").trim();
  const supervisorPhone = (input.supervisorPhone ?? "").trim();
  const licenseNumber = (input.licenseNumber ?? "").trim();
  const district = (input.district ?? "").trim();
  const email = (input.email ?? "").trim().toLowerCase();

  // ---- تحققات المدخلات ----
  if (name.length < 2) throw new Error("اسم الجهة مطلوب (حرفان على الأقل)");
  if (name.length > 200) throw new Error("اسم الجهة طويل جداً (الحد الأقصى 200 حرف)");
  if (/<[^>]*>/.test(name)) throw new Error("اسم الجهة لا يسمح بوسوم HTML");
  if (managerName.length < 2) throw new Error("اسم مدير الجهة مطلوب");
  if (supervisorName.length < 2) throw new Error("اسم مشرف الجهة مطلوب");
  if (district.length < 2) throw new Error("الحي مطلوب");
  if (licenseNumber.length < 3) throw new Error("رقم التصريح مطلوب (3 أحرف على الأقل)");
  if (licenseNumber.length > 50) throw new Error("رقم التصريح طويل جداً");

  if (!validatePhoneE164(managerPhone)) {
    throw new Error("رقم هاتف المدير غير صالح — يبدأ بـ+ وأرقام فقط (6-15 خانة)");
  }
  if (!validatePhoneE164(supervisorPhone)) {
    throw new Error("رقم هاتف المشرف غير صالح — يبدأ بـ+ وأرقام فقط (6-15 خانة)");
  }

  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
    throw new Error("البريد الإلكتروني غير صالح");
  }
  if (email.length > 254) throw new Error("البريد الإلكتروني طويل جداً");

  // منع التكرار (فحص مسبق سريع + درع P2002 عند التسابق)
  const existingUser = await prisma.user.findUnique({ where: { email } });
  if (existingUser) throw new Error("يوجد حساب بنفس البريد الإلكتروني مسبقاً");
  const existingLicense = await prisma.institution.findUnique({
    where: { licenseNumber },
  });
  if (existingLicense) throw new Error("رقم التصريح مستخدم مسبقاً — اختر رقماً آخر");

  // كلمة المرور التلقائية = رقم التصريح (تُشفّر بـ bcrypt cost 12)
  const plainPassword = licenseNumber;
  const hashedPassword = await bcrypt.hash(plainPassword, 12);

  // معاملة ذرّية: إنشاء الجهة + حسابها المرتبط (مع إجبار تغيير كلمة المرور)
  let result: { institutionId: string };
  try {
    result = await prisma.$transaction(async (tx) => {
      const institution = await tx.institution.create({
        data: {
          name,
          managerName,
          supervisorName,
          managerPhone,
          supervisorPhone,
          licenseNumber,
          district,
        },
      });

      const createdUser = await tx.user.create({
        data: {
          name: `حساب ${name}`,
          email,
          password: hashedPassword,
          role: Role.INSTITUTION,
          birthDate: new Date("1990-01-01"),
          institutionId: institution.id,
          mustChangePassword: true,
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
            licenseNumber,
            district,
            managerName,
            supervisorName,
            userId: createdUser.id,
          }),
        },
      });

      return { institutionId: institution.id };
    });
  } catch (error) {
    if (isUniqueConstraintError(error)) throw new Error(friendlyUniqueMessage(error));
    throw error;
  }

  revalidatePath("/test-specialist/entities/create");
  revalidatePath("/test-specialist/entities");
  revalidatePath("/admin/institutions");

  // إرجاع كلمة المرور (رقم التصريح) مرة واحدة فقط لعرضها مع زر النسخ
  return { success: true, ...result, password: plainPassword, email };
}

/** جلب قائمة الجهات (للأخصائي/الأدمن) — بأعمدة المرحلة 10.4 */
export async function listInstitutions() {
  const user = await requireUser();
  requireRole(user, [Role.TEST_SPECIALIST, Role.ADMIN]);

  const institutions = await prisma.institution.findMany({
    select: {
      id: true,
      name: true,
      managerName: true,
      supervisorName: true,
      managerPhone: true,
      supervisorPhone: true,
      licenseNumber: true,
      district: true,
      createdAt: true,
      _count: { select: { students: true, users: true, examModels: true } },
    },
    orderBy: { createdAt: "desc" },
  });

  return { institutions };
}