"use server";

import bcrypt from "bcryptjs";
import { requireUser, requireRole, requireTenantId } from "@/lib/security";
import { prisma } from "@/lib/prisma";
import { getTenantFilter, assertSameTenant } from "@/lib/tenancy";
import { AuditAction, Prisma, Role } from "@prisma/client";
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

/** نوع نتيجة إنشاء جهة — union ليعرض العميل رسالة الخطأ الحقيقية بدل الحجب في الإنتاج */
export type CreateInstitutionResult =
  | { success: true; institutionId: string; password: string; email: string }
  | { success: false; error: string };

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
}): Promise<CreateInstitutionResult> {
  let user;
  try {
    user = await requireUser();

    // عزل الصلاحيات: الأخصائي أو الأدمن (الجهات تُدار من الأخصائي)
    requireRole(user, [Role.TEST_SPECIALIST, Role.ADMIN]);
  } catch {
    return { success: false, error: "غير مصرح — يجب أن تكون أخصائي اختبارات أو أدمن" };
  }

  // منع إساءة الاستخدام
  try {
    await checkRateLimit(`specialist-create-entity:${user.id}`, 10);
  } catch (e) {
    return {
      success: false,
      error: e instanceof Error ? e.message : "تم تجاوز حد الطلبات المسموح، حاول لاحقاً",
    };
  }

  const name = (input.name ?? "").trim();
  const managerName = (input.managerName ?? "").trim();
  const supervisorName = (input.supervisorName ?? "").trim();
  const managerPhone = (input.managerPhone ?? "").trim();
  const supervisorPhone = (input.supervisorPhone ?? "").trim();
  const licenseNumber = (input.licenseNumber ?? "").trim();
  const district = (input.district ?? "").trim();
  const email = (input.email ?? "").trim().toLowerCase();

  // ---- تحققات المدخلات ----
  if (name.length < 2) return { success: false, error: "اسم الجهة مطلوب (حرفان على الأقل)" };
  if (name.length > 200) return { success: false, error: "اسم الجهة طويل جداً (الحد الأقصى 200 حرف)" };
  if (/<[^>]*>/.test(name)) return { success: false, error: "اسم الجهة لا يسمح بوسوم HTML" };
  if (managerName.length < 2) return { success: false, error: "اسم مدير الجهة مطلوب" };
  if (supervisorName.length < 2) return { success: false, error: "اسم مشرف الجهة مطلوب" };
  if (district.length < 2) return { success: false, error: "الحي مطلوب" };
  if (licenseNumber.length < 3) return { success: false, error: "رقم التصريح مطلوب (3 أحرف على الأقل)" };
  if (licenseNumber.length > 50) return { success: false, error: "رقم التصريح طويل جداً" };

  if (!validatePhoneE164(managerPhone)) {
    return { success: false, error: "رقم هاتف المدير غير صالح — يبدأ بـ+ وأرقام فقط (6-15 خانة)" };
  }
  if (!validatePhoneE164(supervisorPhone)) {
    return { success: false, error: "رقم هاتف المشرف غير صالح — يبدأ بـ+ وأرقام فقط (6-15 خانة)" };
  }

  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
    return { success: false, error: "البريد الإلكتروني غير صالح" };
  }
  if (email.length > 254) return { success: false, error: "البريد الإلكتروني طويل جداً" };

  // منع التكرار (فحص مسبق سريع + درع P2002 عند التسابق)
  const existingUser = await prisma.user.findUnique({ where: { email } });
  if (existingUser) return { success: false, error: "يوجد حساب بنفس البريد الإلكتروني مسبقاً" };
  const existingLicense = await prisma.institution.findUnique({
    where: { licenseNumber },
  });
  if (existingLicense) return { success: false, error: "رقم التصريح مستخدم مسبقاً — اختر رقماً آخر" };

  // كلمة المرور التلقائية = رقم التصريح (تُشفّر بـ bcrypt cost 12)
  const plainPassword = licenseNumber;
  const hashedPassword = await bcrypt.hash(plainPassword, 12);

  // معاملة ذرّية: إنشاء الجهة + حسابها المرتبط (دخول مباشر بدون إجبار تغيير كلمة المرور)
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
          tenantId: requireTenantId(user),
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
          mustChangePassword: false,
          tenantId: requireTenantId(user),
        },
      });

      await tx.auditLog.create({
        data: {
          userId: user.id,
          tenantId: requireTenantId(user),
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
    if (isUniqueConstraintError(error)) {
      return { success: false, error: friendlyUniqueMessage(error) };
    }
    return { success: false, error: "حدث خطأ غير متوقع أثناء إنشاء الجهة — تحقق من السجلات" };
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
    where: getTenantFilter(user),
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
      _count: { select: { students: true, users: true } },
    },
    orderBy: { createdAt: "desc" },
    take: 100,
  });

  return { institutions };
}

/** تعديل بيانات جهة تعليمية — خاص بالأخصائي/الأدمن (نفس حقول الإنشاء بدون البريد/كلمة المرور) */
export async function updateInstitution(
  institutionId: string,
  input: {
    name?: string;
    managerName?: string;
    supervisorName?: string;
    managerPhone?: string;
    supervisorPhone?: string;
    licenseNumber?: string;
    district?: string;
  }
) {
  const user = await requireUser();
  requireRole(user, [Role.TEST_SPECIALIST, Role.ADMIN]);

  await checkRateLimit(`entity-update:${user.id}`, 10);

  if (!institutionId || typeof institutionId !== "string" || institutionId.length < 1 || institutionId.length > 64) {
    throw new Error("معرّف الجهة غير صالح");
  }
  const existing = await prisma.institution.findUnique({ where: { id: institutionId } });
  if (!existing) throw new Error("الجهة غير موجودة");
  assertSameTenant(user, existing);

  const data: Prisma.InstitutionUpdateInput = {};
  if (input.name !== undefined && input.name.trim() !== existing.name) {
    if (input.name.trim().length < 2) throw new Error("اسم الجهة مطلوب (حرفان على الأقل)");
    if (input.name.length > 200) throw new Error("اسم الجهة طويل جداً (الحد الأقصى 200 حرف)");
    if (/<[^>]*>/.test(input.name)) throw new Error("اسم الجهة لا يسمح بوسوم HTML");
    data.name = input.name.trim();
  }
  if (input.managerName !== undefined && input.managerName.trim() !== existing.managerName) {
    if (input.managerName.trim().length < 2) throw new Error("اسم مدير الجهة مطلوب");
    data.managerName = input.managerName.trim();
  }
  if (input.supervisorName !== undefined && input.supervisorName.trim() !== existing.supervisorName) {
    if (input.supervisorName.trim().length < 2) throw new Error("اسم مشرف الجهة مطلوب");
    data.supervisorName = input.supervisorName.trim();
  }
  if (input.district !== undefined && input.district.trim() !== existing.district) {
    if (input.district.trim().length < 2) throw new Error("الحي مطلوب");
    data.district = input.district.trim();
  }
  if (input.managerPhone !== undefined && input.managerPhone.trim() !== existing.managerPhone) {
    if (!validatePhoneE164(input.managerPhone)) {
      throw new Error("رقم هاتف المدير غير صالح — يبدأ بـ+ وأرقام فقط (6-15 خانة)");
    }
    data.managerPhone = input.managerPhone.trim();
  }
  if (input.supervisorPhone !== undefined && input.supervisorPhone.trim() !== existing.supervisorPhone) {
    if (!validatePhoneE164(input.supervisorPhone)) {
      throw new Error("رقم هاتف المشرف غير صالح — يبدأ بـ+ وأرقام فقط (6-15 خانة)");
    }
    data.supervisorPhone = input.supervisorPhone.trim();
  }
  if (input.licenseNumber !== undefined && input.licenseNumber.trim() !== existing.licenseNumber) {
    if (input.licenseNumber.trim().length < 3) throw new Error("رقم التصريح مطلوب (3 أحرف على الأقل)");
    if (input.licenseNumber.length > 50) throw new Error("رقم التصريح طويل جداً");
    // منع التصادم مع جهة أخرى
    const clash = await prisma.institution.findFirst({
      where: { id: { not: institutionId }, licenseNumber: input.licenseNumber.trim() },
      select: { id: true },
    });
    if (clash) throw new Error("رقم التصريح مستخدم لجهة أخرى — اختر رقماً آخر");
    data.licenseNumber = input.licenseNumber.trim();
  }

  if (Object.keys(data).length === 0) return { success: true, noChange: true as const };

  try {
    await prisma.institution.update({ where: { id: institutionId }, data });
  } catch (error) {
    if (isUniqueConstraintError(error)) throw new Error(friendlyUniqueMessage(error));
    throw error;
  }

  await prisma.auditLog.create({
    data: {
      userId: user.id,
      tenantId: requireTenantId(user),
      action: AuditAction.UPDATE,
      details: JSON.stringify({
        entity: "Institution",
        institutionId,
        updatedFields: Object.keys(data),
      }),
    },
  });

  revalidatePath("/test-specialist/entities");
  revalidatePath("/admin/institutions");

  return { success: true };
}

/**
 * حذف جهة تعليمية بالكامل — خاص بالأخصائي/الأدمن (المهمة D)
 * - يوظّف معاملة ذرّية لضمان السلامة.
 * - يحذف الحسابات المرتبطة بالجهة + الطلاب (وجلساتهم وتقييماتهم وشهاداتهم).
 * - النماذج المرتبطة لا تُحذف — فقط يُفك ارتباطها (تبقى معلّقة إن لزم).
 */
export async function deleteInstitution(institutionId: string) {
  const user = await requireUser();

  // عزل الصلاحيات: الأخصائي أو الأدمن
  requireRole(user, [Role.TEST_SPECIALIST, Role.ADMIN]);

  await checkRateLimit(`entity-delete:${user.id}`, 5);

  if (!institutionId || typeof institutionId !== "string" || institutionId.length < 1 || institutionId.length > 64) {
    throw new Error("معرّف الجهة غير صالح");
  }

  const existing = await prisma.institution.findUnique({ where: { id: institutionId } });
  if (!existing) throw new Error("الجهة غير موجودة");
  assertSameTenant(user, existing);

  await prisma.$transaction(async (tx) => {
    // حسابات الجهة المرتبطة (دور INSTITUTION)
    const instUsers = await tx.user.findMany({
      where: { institutionId },
      select: { id: true },
    });
    const instUserIds = instUsers.map((u) => u.id);

    // طلاب الجهة وجلساتهم
    const instStudents = await tx.student.findMany({
      where: { institutionId },
      select: { id: true },
    });
    const studentIds = instStudents.map((s) => s.id);
    const sessions = await tx.examSession.findMany({
      where: { studentId: { in: studentIds } },
      select: { id: true },
    });
    const sessionIds = sessions.map((s) => s.id);

    // إشعارات الحسابات المرتبطة والمرسلة منها + إشعارات جلسات طلاب الجهة
    const notificationOrs: Prisma.NotificationWhereInput[] = [];
    if (instUserIds.length > 0) {
      notificationOrs.push({ userId: { in: instUserIds } });
      notificationOrs.push({ senderId: { in: instUserIds } });
    }
    if (sessionIds.length > 0) {
      notificationOrs.push({ examSessionId: { in: sessionIds } });
    }
    if (notificationOrs.length > 0) {
      await tx.notification.deleteMany({ where: { OR: notificationOrs } });
    }

    // فك اقتران الطلاب المقدَّمين بحسابات الجهة ثم حذف تلك الحسابات
    if (instUserIds.length > 0) {
      await tx.student.updateMany({
        where: { submittedById: { in: instUserIds } },
        data: { submittedById: null },
      });
      await tx.auditLog.deleteMany({ where: { userId: { in: instUserIds } } });
      await tx.user.deleteMany({ where: { id: { in: instUserIds } } });
    }

    // النماذج أصبحت في بنك الأسئلة (لا ترتبط بجهة) — المهمة I
    // حذف الطلاب (يترتّب عليه حذف الجلسات والتقييمات والشهادات)
    if (studentIds.length > 0) {
      await tx.student.deleteMany({ where: { id: { in: studentIds } } });
    }

    // حذف الجهة
    await tx.institution.delete({ where: { id: institutionId } });

    await tx.auditLog.create({
      data: {
        userId: user.id,
        tenantId: requireTenantId(user),
        action: AuditAction.DELETE,
        details: JSON.stringify({
          entity: "Institution",
          institutionId,
          name: existing.name,
          deletedUsers: instUserIds.length,
          deletedStudents: studentIds.length,
        }),
      },
    });
  });

  revalidatePath("/test-specialist/entities");
  revalidatePath("/admin/institutions");

  return { success: true };
}