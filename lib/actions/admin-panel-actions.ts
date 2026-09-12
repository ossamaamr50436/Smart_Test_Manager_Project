"use server";

import { requireUser, requireRole } from "@/lib/security";
import { prisma } from "@/lib/prisma";
import {
  Role,
  AuditAction,
  StudentStatus,
  ExamSessionStatus,
  CertificateStatus,
  Prisma,
} from "@prisma/client";
import bcrypt from "bcryptjs";
import { revalidatePath } from "next/cache";
import { checkRateLimit } from "@/lib/rate-limit";
import { isUniqueConstraintError, friendlyUniqueMessage } from "@/lib/actions/unique-guard";
import { createUserSchema } from "@/lib/validations/user";

// ============================================================
// لوحة تحكم المسؤول — Server Actions (عزل صلاحيات: ADMIN فقط)
// كل إجراء يتحقق من الدور وأي ملكية/صلاحية مطلوبة Server-Side
// ============================================================

async function recordAudit(
  userId: string,
  action: AuditAction,
  details: Prisma.InputJsonValue
) {
  await prisma.auditLog.create({
    data: { userId, action, details },
  });
}

// ------------------------------------------------------------
// 1) لوحة المعلومات (إحصائيات حقيقية من قاعدة البيانات)
// ------------------------------------------------------------
export async function getAdminDashboardStats() {
  const user = await requireUser();
  requireRole(user, [Role.ADMIN]);

  const [
    totalUsers,
    totalInstitutions,
    totalStudents,
    totalExaminers,
    totalSeasons,
    totalSessions,
    upcomingSessions,
    completedSessions,
    pendingRequests,
    approvedStudents,
    rejectedStudents,
    totalCertificates,
    totalModels,
    readyCertificates,
    totalNotifications,
    certificateIssuedStudents,
  ] = await Promise.all([
    prisma.user.count(),
    prisma.institution.count(),
    prisma.student.count(),
    prisma.user.count({ where: { role: Role.EXAMINER } }),
    prisma.examSeason.count(),
    prisma.examSession.count(),
    prisma.examSession.count({ where: { examDate: { gte: new Date() } } }),
    prisma.examSession.count({ where: { status: "COMPLETED" } }),
    prisma.student.count({ where: { status: "PENDING" } }),
    prisma.student.count({ where: { status: "APPROVED" } }),
    prisma.student.count({ where: { status: "REJECTED" } }),
    prisma.certificate.count(),
    prisma.examModel.count(),
    prisma.certificate.count({ where: { status: "PENDING" } }),
    prisma.notification.count(),
    prisma.student.count({ where: { status: "CERTIFICATE_ISSUED" } }),
  ]);

  // آخر الأنشطة
  const recentActivity = await prisma.auditLog.findMany({
    orderBy: { timestamp: "desc" },
    take: 10,
    include: { user: { select: { name: true, email: true } } },
  });

  return {
    totalUsers: { label: "المستخدمون", value: totalUsers },
    totalInstitutions: { label: "المؤسسات", value: totalInstitutions },
    totalStudents: { label: "الطلاب", value: totalStudents },
    totalExaminers: { label: "الممتحنون", value: totalExaminers },
    totalSeasons: { label: "المواسم", value: totalSeasons },
    totalSessions: { label: "الجلسات", value: totalSessions },
    upcomingSessions: { label: "الجلسات القادمة", value: upcomingSessions },
    completedSessions: { label: "الجلسات المكتملة", value: completedSessions },
    pendingRequests: { label: "الطلبات المعلقة", value: pendingRequests },
    approvedStudents: { label: "الطلاب المقبولون", value: approvedStudents },
    rejectedStudents: { label: "الطلاب المرفوضون", value: rejectedStudents },
    totalCertificates: { label: "الشهادات", value: totalCertificates },
    totalModels: { label: "النماذج", value: totalModels },
    readyCertificates: { label: "شهادات جاهزة", value: readyCertificates },
    certificateIssuedStudents: { label: "طلاب صدرت شهاداتهم", value: certificateIssuedStudents },
    totalNotifications: { label: "التنبيهات", value: totalNotifications },
    recentActivity,
  };
}

// ------------------------------------------------------------
// 2) إدارة المستخدمين
// ------------------------------------------------------------
export async function getAdminUsers(params: {
  page?: number;
  pageSize?: number;
  search?: string;
  role?: string;
  institutionId?: string;
}) {
  const user = await requireUser();
  requireRole(user, [Role.ADMIN]);

  const page = Number(params.page ?? 1);
  const pageSize = Number(params.pageSize ?? 20);
  if (!Number.isInteger(page) || page < 1 || page > 10000) throw new Error("رقم الصفحة غير صالح");
  if (!Number.isInteger(pageSize) || pageSize < 1 || pageSize > 100) throw new Error("حجم الصفحة غير صالح");

  const where: Prisma.UserWhereInput = {};
  if (params.search && params.search.length > 0) {
    if (params.search.length > 100) throw new Error("نص البحث طويل جداً");
    where.OR = [
      { name: { contains: params.search, mode: "insensitive" } },
      { email: { contains: params.search, mode: "insensitive" } },
    ];
  }
  if (params.role && params.role !== "ALL") {
    if (!Object.values(Role).includes(params.role as Role)) {
      throw new Error("دور غير صالح");
    }
    where.role = params.role as Role;
  }
  if (params.institutionId && params.institutionId !== "ALL") {
    where.institutionId = params.institutionId;
  }

  const skip = (page - 1) * pageSize;
  const [users, total] = await Promise.all([
    prisma.user.findMany({
      where,
      select: {
        id: true,
        name: true,
        email: true,
        role: true,
        birthDate: true,
        institutionId: true,
        createdAt: true,
        institution: { select: { name: true } },
        _count: { select: { notifications: true } },
      },
      orderBy: { createdAt: "desc" },
      skip,
      take: pageSize,
    }),
    prisma.user.count({ where }),
  ]);

  return { users, total, page, pageSize, totalPages: Math.ceil(total / pageSize) };
}

export type CreateUserResult =
  | { success: true; userId: string }
  | { success: false; error: string; fieldErrors?: Record<string, string> };

export async function createAdminUser(input: {
  name: string;
  email: string;
  password: string;
  role: string;
  birthDate?: string;
  institutionId?: string;
  forcePasswordChange?: boolean; // ← جديد: إجبار المستخدم على تغيير كلمة المرور عند أول دخول
}): Promise<CreateUserResult> {
  let user;
  try {
    user = await requireUser();
    requireRole(user, [Role.ADMIN]);
  } catch {
    return { success: false, error: "غير مصرح — يجب أن تكون أدمن" };
  }

  try {
    await checkRateLimit(`admin-create-user:${user.id}`, 20);
  } catch (e) {
    return {
      success: false,
      error: e instanceof Error ? e.message : "تم تجاوز حد الطلبات المسموح، حاول لاحقاً",
    };
  }

  // التحقق من البيانات (Zod متسامح للبريد — المهمة 4)
  const parsed = createUserSchema.safeParse({
    ...input,
    birthDate:
      input.birthDate && input.birthDate.trim().length > 0
        ? new Date(input.birthDate)
        : undefined,
  });
  if (!parsed.success) {
    const fieldErrors: Record<string, string> = {};
    for (const issue of parsed.error.issues) {
      const field = issue.path.join(".");
      if (!fieldErrors[field]) fieldErrors[field] = issue.message;
    }
    return {
      success: false,
      error: `تحقق من البيانات: ${Object.values(fieldErrors).join(" | ")}`,
      fieldErrors,
    };
  }
  const data = parsed.data;

  // إذا كان الدور INSTITUTION، يجب ربط بمؤسسة موجودة فعلاً
  const institutionId = data.role === Role.INSTITUTION ? data.institutionId ?? null : null;
  if (institutionId) {
    const inst = await prisma.institution.findUnique({ where: { id: institutionId } });
    if (!inst) return { success: false, error: "المؤسسة غير موجودة" };
  }

  // منع التكرار (فحص مسبق ودّي + درع P2002 عند التسابق)
  const existing = await prisma.user.findUnique({ where: { email: data.email } });
  if (existing) return { success: false, error: "هذا البريد الإلكتروني مستخدم مسبقاً" };

  const hashedPassword = await bcrypt.hash(data.password, 12);

  let created;
  try {
    created = await prisma.user.create({
      data: {
        name: data.name,
        email: data.email,
        password: hashedPassword,
        role: data.role,
        birthDate: data.birthDate,
        institutionId,
        mustChangePassword: input.forcePasswordChange === true, // الافتراضي false
      },
    });
  } catch (error) {
    if (isUniqueConstraintError(error)) {
      return { success: false, error: friendlyUniqueMessage(error) };
    }
    if (error instanceof Prisma.PrismaClientKnownRequestError) {
      // P2021: الجدول غير موجود — P2022: العمود غير موجود (عدم مزامنة السكّيما)
      if (error.code === "P2022" || error.code === "P2021") {
        return { success: false, error: "خطأ في مزامنة قاعدة البيانات — تواصل مع المسؤول" };
      }
    }
    console.error("createAdminUser failed:", error);
    return { success: false, error: "حدث خطأ غير متوقع أثناء إنشاء الحساب" };
  }

  // تسجيل التدقيق مع حماية من فشل التسجيل (لا يُفشل إنشاء الحساب)
  try {
    await recordAudit(user.id, AuditAction.CREATE, {
      entity: "User",
      userId: created.id,
      name: created.name,
      role: created.role,
    });
  } catch {
    // فشل سجل التدقيق لا يمنع نجاح إنشاء المستخدم
  }

  revalidatePath("/admin/users");
  return { success: true, userId: created.id };
}

export type UpdateUserResult = { success: true } | { success: false; error: string };

export async function updateAdminUser(
  userId: string,
  input: {
    name?: string;
    email?: string;
    role?: string;
    birthDate?: string | null;
    institutionId?: string | null;
  }
): Promise<UpdateUserResult> {
  let user;
  try {
    user = await requireUser();
    requireRole(user, [Role.ADMIN]);
  } catch {
    return { success: false, error: "غير مصرح — يجب أن تكون أدمن" };
  }

  if (!userId || typeof userId !== "string" || userId.length < 1 || userId.length > 64) {
    return { success: false, error: "معرّف المستخدم غير صالح" };
  }

  const existing = await prisma.user.findUnique({ where: { id: userId } });
  if (!existing) return { success: false, error: "المستخدم غير موجود" };

  const data: Prisma.UserUncheckedUpdateInput = {};

  if (input.name !== undefined) {
    if (input.name.trim().length < 2) return { success: false, error: "الاسم مطلوب" };
    if (input.name.length > 100) return { success: false, error: "الاسم طويل جداً" };
    data.name = input.name.trim();
  }

  if (input.email !== undefined) {
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(input.email)) {
      return { success: false, error: "البريد الإلكتروني غير صالح" };
    }
    const dup = await prisma.user.findUnique({ where: { email: input.email.trim().toLowerCase() } });
    if (dup && dup.id !== userId) return { success: false, error: "هذا البريد مستخدم مسبقاً" };
    data.email = input.email.trim().toLowerCase();
  }

  if (input.role !== undefined) {
    if (!Object.values(Role).includes(input.role as Role)) {
      return { success: false, error: "دور غير صالح" };
    }
    const newInstitutionId =
      input.role === Role.INSTITUTION ? input.institutionId ?? existing.institutionId : null;
    if (newInstitutionId) {
      const inst = await prisma.institution.findUnique({ where: { id: newInstitutionId } });
      if (!inst) return { success: false, error: "المؤسسة غير موجودة" };
    }
    data.role = input.role as Role;
    data.institutionId = newInstitutionId;
  }

  if (input.birthDate !== undefined) {
    if (input.birthDate) {
      const bd = new Date(input.birthDate);
      if (Number.isNaN(bd.getTime())) return { success: false, error: "تاريخ الميلاد غير صالح" };
      data.birthDate = bd;
    } else {
      return { success: false, error: "تاريخ الميلاد مطلوب" };
    }
  }

  try {
    await prisma.user.update({ where: { id: userId }, data });
  } catch (error) {
    if (isUniqueConstraintError(error)) {
      return { success: false, error: friendlyUniqueMessage(error) };
    }
    return { success: false, error: "حدث خطأ غير متوقع أثناء حفظ التعديلات" };
  }

  try {
    await recordAudit(user.id, AuditAction.UPDATE, {
      entity: "User",
      userId,
      updatedFields: Object.keys(data),
    });
  } catch {
    // فشل سجل التدقيق لا يمنع نجاح التحديث
  }

  revalidatePath("/admin/users");
  return { success: true };
}

export async function resetAdminUserPassword(
  userId: string,
  newPassword: string
): Promise<UpdateUserResult> {
  let user;
  try {
    user = await requireUser();
    requireRole(user, [Role.ADMIN]);
  } catch {
    return { success: false, error: "غير مصرح — يجب أن تكون أدمن" };
  }

  try {
    await checkRateLimit(`admin-reset-pw:${user.id}`, 15);
  } catch (e) {
    return {
      success: false,
      error: e instanceof Error ? e.message : "تم تجاوز حد الطلبات المسموح، حاول لاحقاً",
    };
  }

  if (!userId || typeof userId !== "string" || userId.length < 1 || userId.length > 64) {
    return { success: false, error: "معرّف المستخدم غير صالح" };
  }
  if (!newPassword || newPassword.length < 5) {
    return { success: false, error: "كلمة المرور الجديدة يجب ألا تقل عن 5 أحرف" };
  }
  if (!/[A-Z]/.test(newPassword) || !/[a-z]/.test(newPassword) || !/[0-9]/.test(newPassword)) {
    return { success: false, error: "كلمة المرور يجب أن تحتوي على حرف كبير وحرف صغير ورقم" };
  }

  const target = await prisma.user.findUnique({ where: { id: userId } });
  if (!target) return { success: false, error: "المستخدم غير موجود" };

  const hashed = await bcrypt.hash(newPassword, 12);
  await prisma.user.update({ where: { id: userId }, data: { password: hashed } });

  try {
    await recordAudit(user.id, AuditAction.UPDATE, {
      entity: "User",
      userId,
      step: "PASSWORD_RESET",
    });
  } catch {
    // فشل سجل التدقيق لا يمنع نجاح تغيير كلمة المرور
  }

  return { success: true };
}

// ------------------------------------------------------------
// 3) إدارة الجهات (تُدار من الأخصائي — الأدمن للإشراف فقط، المرحلة 14)
// ------------------------------------------------------------
export async function getAdminInstitutions(params: {
  page?: number;
  pageSize?: number;
  search?: string;
}) {
  const user = await requireUser();
  requireRole(user, [Role.ADMIN]);

  const page = Number(params.page ?? 1);
  const pageSize = Number(params.pageSize ?? 20);
  if (!Number.isInteger(page) || page < 1 || page > 10000) throw new Error("رقم الصفحة غير صالح");
  if (!Number.isInteger(pageSize) || pageSize < 1 || pageSize > 100) throw new Error("حجم الصفحة غير صالح");

  const where: Prisma.InstitutionWhereInput = {};
  if (params.search && params.search.length > 0) {
    if (params.search.length > 100) throw new Error("نص البحث طويل جداً");
    where.OR = [
      { name: { contains: params.search, mode: "insensitive" } },
      { licenseNumber: { contains: params.search, mode: "insensitive" } },
      { district: { contains: params.search, mode: "insensitive" } },
    ];
  }

  const skip = (page - 1) * pageSize;
  const [institutions, total] = await Promise.all([
    prisma.institution.findMany({
      where,
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
      skip,
      take: pageSize,
    }),
    prisma.institution.count({ where }),
  ]);

  return { institutions, total, page, pageSize, totalPages: Math.ceil(total / pageSize) };
}

export async function createAdminInstitution(input: {
  name: string;
  managerName: string;
  supervisorName: string;
  managerPhone: string;
  supervisorPhone: string;
  licenseNumber: string;
  district: string;
  email: string;
}) {
  const user = await requireUser();
  requireRole(user, [Role.ADMIN]);

  await checkRateLimit(`admin-create-inst:${user.id}`, 20);

  const name = (input.name ?? "").trim();
  const managerName = (input.managerName ?? "").trim();
  const supervisorName = (input.supervisorName ?? "").trim();
  const managerPhone = (input.managerPhone ?? "").trim();
  const supervisorPhone = (input.supervisorPhone ?? "").trim();
  const licenseNumber = (input.licenseNumber ?? "").trim();
  const district = (input.district ?? "").trim();
  const email = (input.email ?? "").trim().toLowerCase();

  if (name.length < 2) throw new Error("اسم الجهة مطلوب (حرفان على الأقل)");
  if (name.length > 200) throw new Error("اسم الجهة طويل جداً");
  if (managerName.length < 2) throw new Error("اسم مدير الجهة مطلوب");
  if (supervisorName.length < 2) throw new Error("اسم مشرف الجهة مطلوب");
  if (district.length < 2) throw new Error("الحي مطلوب");
  if (licenseNumber.length < 3) throw new Error("رقم التصريح مطلوب (3 أحرف على الأقل)");
  if (!/^\+?\d+$/.test(managerPhone.replace(/\s/g, "")) || managerPhone.length < 7) {
    throw new Error("رقم هاتف المدير غير صالح");
  }
  if (!/^\+?\d+$/.test(supervisorPhone.replace(/\s/g, "")) || supervisorPhone.length < 7) {
    throw new Error("رقم هاتف المشرف غير صالح");
  }
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) throw new Error("البريد الإلكتروني غير صالح");

  const dupName = await prisma.institution.findFirst({
    where: { name: { equals: name, mode: "insensitive" } },
  });
  if (dupName) throw new Error("توجد جهة بنفس الاسم");
  const dupLicense = await prisma.institution.findUnique({ where: { licenseNumber } });
  if (dupLicense) throw new Error("رقم التصريح مستخدم مسبقاً");

  const plainPassword = licenseNumber;
  const hashedPassword = await bcrypt.hash(plainPassword, 12);

  let institutionId: string;
  try {
    institutionId = await prisma.$transaction(async (tx) => {
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
            name,
            licenseNumber,
            userId: createdUser.id,
          }),
        },
      });

      return institution.id;
    });
  } catch (error) {
    if (isUniqueConstraintError(error)) throw new Error(friendlyUniqueMessage(error));
    throw error;
  }

  revalidatePath("/admin/institutions");
  return { success: true, institutionId, password: plainPassword, email };
}

export async function updateAdminInstitution(
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
  requireRole(user, [Role.ADMIN]);

  if (!institutionId || typeof institutionId !== "string" || institutionId.length < 1 || institutionId.length > 64) {
    throw new Error("معرّف الجهة غير صالح");
  }
  const existing = await prisma.institution.findUnique({ where: { id: institutionId } });
  if (!existing) throw new Error("الجهة غير موجودة");

  const data: Prisma.InstitutionUpdateInput = {};
  if (input.name !== undefined) {
    if (input.name.trim().length < 2) throw new Error("اسم الجهة مطلوب");
    if (input.name.length > 200) throw new Error("اسم الجهة طويل جداً");
    data.name = input.name.trim();
  }
  if (input.managerName !== undefined) data.managerName = input.managerName.trim();
  if (input.supervisorName !== undefined) data.supervisorName = input.supervisorName.trim();
  if (input.managerPhone !== undefined) data.managerPhone = input.managerPhone.trim();
  if (input.supervisorPhone !== undefined) data.supervisorPhone = input.supervisorPhone.trim();
  if (input.licenseNumber !== undefined) {
    data.licenseNumber = input.licenseNumber.trim();
    // لا نعدّل كلمة المرور تلقائياً هنا — تُدار من إعادة التعيين في صفحة الجهات
  }
  if (input.district !== undefined) data.district = input.district.trim();

  try {
    await prisma.institution.update({ where: { id: institutionId }, data });
  } catch (error) {
    if (isUniqueConstraintError(error)) throw new Error(friendlyUniqueMessage(error));
    throw error;
  }

  await recordAudit(user.id, AuditAction.UPDATE, {
    entity: "Institution",
    institutionId,
    updatedFields: Object.keys(data),
  });

  revalidatePath("/admin/institutions");
  return { success: true };
}

// ------------------------------------------------------------
// 4) إدارة المواسم
// ------------------------------------------------------------
export async function getAdminSeasons() {
  const user = await requireUser();
  requireRole(user, [Role.ADMIN]);

  const seasons = await prisma.examSeason.findMany({
    orderBy: { startDate: "desc" },
    include: {
      _count: { select: { sessions: true, models: true } },
    },
  });

  return seasons;
}

export async function createAdminSeason(input: {
  name: string;
  startDate: string;
  endDate: string;
  isActive?: boolean;
}) {
  const user = await requireUser();
  requireRole(user, [Role.ADMIN]);

  await checkRateLimit(`admin-create-season:${user.id}`, 10);

  if (!input.name || input.name.trim().length < 2) throw new Error("اسم الموسم مطلوب");
  if (input.name.length > 200) throw new Error("اسم الموسم طويل جداً");
  const startDate = new Date(input.startDate);
  const endDate = new Date(input.endDate);
  if (Number.isNaN(startDate.getTime()) || Number.isNaN(endDate.getTime())) {
    throw new Error("التواريخ غير صحيحة");
  }
  if (endDate <= startDate) throw new Error("تاريخ النهاية يجب أن يكون بعد البداية");

  if (input.isActive) {
    await prisma.examSeason.updateMany({ where: { isActive: true }, data: { isActive: false } });
  }

  const season = await prisma.examSeason.create({
    data: {
      name: input.name.trim(),
      startDate,
      endDate,
      isActive: input.isActive ?? false,
    },
  });

  await recordAudit(user.id, AuditAction.CREATE, {
    entity: "ExamSeason",
    seasonId: season.id,
    name: season.name,
  });

  revalidatePath("/admin/seasons");
  return { success: true, seasonId: season.id };
}

export async function updateAdminSeason(
  seasonId: string,
  input: { name?: string; startDate?: string; endDate?: string; isActive?: boolean }
) {
  const user = await requireUser();
  requireRole(user, [Role.ADMIN]);

  if (!seasonId || typeof seasonId !== "string" || seasonId.length < 1 || seasonId.length > 64) {
    throw new Error("معرّف الموسم غير صالح");
  }
  const existing = await prisma.examSeason.findUnique({ where: { id: seasonId } });
  if (!existing) throw new Error("الموسم غير موجود");

  const data: Prisma.ExamSeasonUpdateInput = {};
  if (input.name !== undefined) {
    if (input.name.trim().length < 2) throw new Error("اسم الموسم مطلوب");
    data.name = input.name.trim();
  }
  if (input.startDate !== undefined) {
    const d = new Date(input.startDate);
    if (Number.isNaN(d.getTime())) throw new Error("تاريخ البدء غير صحيح");
    data.startDate = d;
  }
  if (input.endDate !== undefined) {
    const d = new Date(input.endDate);
    if (Number.isNaN(d.getTime())) throw new Error("تاريخ النهاية غير صحيح");
    data.endDate = d;
  }
  if (input.isActive !== undefined) {
    // تفعيل موسم يُلغي تفعيل باقي المواسم
    if (input.isActive) {
      await prisma.examSeason.updateMany({
        where: { id: { not: seasonId }, isActive: true },
        data: { isActive: false },
      });
    }
    data.isActive = input.isActive;
  }

  await prisma.examSeason.update({ where: { id: seasonId }, data });

  await recordAudit(user.id, AuditAction.UPDATE, {
    entity: "ExamSeason",
    seasonId,
    updatedFields: Object.keys(data),
  });

  revalidatePath("/admin/seasons");
  return { success: true };
}

// ------------------------------------------------------------
// 5) إدارة النماذج
// ------------------------------------------------------------
export async function getAdminModels(params: {
  page?: number;
  pageSize?: number;
  search?: string;
  institutionId?: string;
}) {
  const user = await requireUser();
  requireRole(user, [Role.ADMIN]);

  const page = Number(params.page ?? 1);
  const pageSize = Number(params.pageSize ?? 20);
  if (!Number.isInteger(page) || page < 1 || page > 10000) throw new Error("رقم الصفحة غير صالح");
  if (!Number.isInteger(pageSize) || pageSize < 1 || pageSize > 100) throw new Error("حجم الصفحة غير صالح");

  const where: Prisma.ExamModelWhereInput = {};
  if (params.institutionId && params.institutionId !== "ALL") {
    where.institutionId = params.institutionId;
  }
  if (params.search && params.search.length > 0) {
    if (params.search.length > 100) throw new Error("نص البحث طويل جداً");
    const num = Number(params.search);
    if (!Number.isNaN(num)) where.modelNumber = num;
  }

  const skip = (page - 1) * pageSize;
  const [models, total] = await Promise.all([
    prisma.examModel.findMany({
      where,
      select: {
        id: true,
        modelNumber: true,
        institution: { select: { name: true } },
        season: { select: { name: true } },
        _count: { select: { assessments: true } },
      },
      orderBy: { modelNumber: "asc" },
      skip,
      take: pageSize,
    }),
    prisma.examModel.count({ where }),
  ]);

  return { models, total, page, pageSize, totalPages: Math.ceil(total / pageSize) };
}

// ------------------------------------------------------------
// 6) إدارة الطلاب
// ------------------------------------------------------------
export async function getAdminStudents(params: {
  page?: number;
  pageSize?: number;
  search?: string;
  status?: string;
  institutionId?: string;
}) {
  const user = await requireUser();
  requireRole(user, [Role.ADMIN]);

  const page = Number(params.page ?? 1);
  const pageSize = Number(params.pageSize ?? 20);
  if (!Number.isInteger(page) || page < 1 || page > 10000) throw new Error("رقم الصفحة غير صالح");
  if (!Number.isInteger(pageSize) || pageSize < 1 || pageSize > 100) throw new Error("حجم الصفحة غير صالح");

  const where: Prisma.StudentWhereInput = {};
  if (params.status && params.status !== "ALL") {
    const validStatuses = Object.values(StudentStatus);
    if (!validStatuses.includes(params.status as StudentStatus)) {
      throw new Error("حالة غير صالحة");
    }
    where.status = params.status as StudentStatus;
  }
  if (params.institutionId && params.institutionId !== "ALL") {
    where.institutionId = params.institutionId;
  }
  if (params.search && params.search.length > 0) {
    if (params.search.length > 100) throw new Error("نص البحث طويل جداً");
    where.name = { contains: params.search, mode: "insensitive" };
  }

  const skip = (page - 1) * pageSize;
  const [students, total] = await Promise.all([
    prisma.student.findMany({
      where,
      select: {
        id: true,
        name: true,
        age: true,
        branch: true,
        status: true,
        teacherName: true,
        parentPhone: true,
        institution: { select: { name: true } },
        createdAt: true,
      },
      orderBy: { createdAt: "desc" },
      skip,
      take: pageSize,
    }),
    prisma.student.count({ where }),
  ]);

  return { students, total, page, pageSize, totalPages: Math.ceil(total / pageSize) };
}

// ------------------------------------------------------------
// 7) إدارة الجلسات
// ------------------------------------------------------------
export async function getAdminSessions(params: {
  page?: number;
  pageSize?: number;
  status?: string;
}) {
  const user = await requireUser();
  requireRole(user, [Role.ADMIN]);

  const page = Number(params.page ?? 1);
  const pageSize = Number(params.pageSize ?? 20);
  if (!Number.isInteger(page) || page < 1 || page > 10000) throw new Error("رقم الصفحة غير صالح");
  if (!Number.isInteger(pageSize) || pageSize < 1 || pageSize > 100) throw new Error("حجم الصفحة غير صالح");

  const where: Prisma.ExamSessionWhereInput = {};
  if (params.status && params.status !== "ALL") {
    const validStatuses = Object.values(ExamSessionStatus);
    if (!validStatuses.includes(params.status as ExamSessionStatus)) {
      throw new Error("حالة غير صالحة");
    }
    where.status = params.status as ExamSessionStatus;
  }

  const skip = (page - 1) * pageSize;
  const [sessions, total] = await Promise.all([
    prisma.examSession.findMany({
      where,
      select: {
        id: true,
        examDate: true,
        period: true,
        status: true,
        student: { select: { id: true, name: true, branch: true } },
        teacher1: { select: { id: true, name: true } },
        teacher2: { select: { id: true, name: true } },
        season: { select: { name: true } },
        _count: { select: { assessments: true } },
      },
      orderBy: { examDate: "desc" },
      skip,
      take: pageSize,
    }),
    prisma.examSession.count({ where }),
  ]);

  return { sessions, total, page, pageSize, totalPages: Math.ceil(total / pageSize) };
}

// ------------------------------------------------------------
// 8) إدارة الشهادات
// ------------------------------------------------------------
export async function getAdminCertificates(params: {
  page?: number;
  pageSize?: number;
  status?: string;
}) {
  const user = await requireUser();
  requireRole(user, [Role.ADMIN]);

  const page = Number(params.page ?? 1);
  const pageSize = Number(params.pageSize ?? 20);
  if (!Number.isInteger(page) || page < 1 || page > 10000) throw new Error("رقم الصفحة غير صالح");
  if (!Number.isInteger(pageSize) || pageSize < 1 || pageSize > 100) throw new Error("حجم الصفحة غير صالح");

  const where: Prisma.CertificateWhereInput = {};
  if (params.status && params.status !== "ALL") {
    const validStatuses = Object.values(CertificateStatus);
    if (!validStatuses.includes(params.status as CertificateStatus)) {
      throw new Error("حالة غير صالحة");
    }
    where.status = params.status as CertificateStatus;
  }

  const skip = (page - 1) * pageSize;
  const [certificates, total] = await Promise.all([
    prisma.certificate.findMany({
      where,
      select: {
        id: true,
        serialNumber: true,
        finalScore: true,
        status: true,
        issuedDate: true,
        signedAt: true,
        student: { select: { id: true, name: true, institution: { select: { name: true } } } },
        issuedBy: { select: { name: true } },
        signedById: true,
      },
      orderBy: { createdAt: "desc" },
      skip,
      take: pageSize,
    }),
    prisma.certificate.count({ where }),
  ]);

  return { certificates, total, page, pageSize, totalPages: Math.ceil(total / pageSize) };
}

// ------------------------------------------------------------
// 9) قائمة المؤسسات (للقوائم المنسدلة)
// ------------------------------------------------------------
export async function getInstitutionsOptions() {
  const user = await requireUser();
  requireRole(user, [Role.ADMIN]);

  return prisma.institution.findMany({
    select: { id: true, name: true },
    orderBy: { name: "asc" },
  });
}

// ------------------------------------------------------------
// 10) قائمة الممتحنين (للاستخدام الإداري)
// ------------------------------------------------------------
export async function getExaminersOptions() {
  const user = await requireUser();
  requireRole(user, [Role.ADMIN]);

  return prisma.user.findMany({
    where: { role: Role.EXAMINER },
    select: { id: true, name: true, institutionId: true },
    orderBy: { name: "asc" },
  });
}

export async function adminDeleteInstitution(institutionId: string) {
  const user = await requireUser();
  requireRole(user, [Role.ADMIN]);

  await checkRateLimit(`admin-delete-inst:${user.id}`, 5);

  if (!institutionId || typeof institutionId !== "string" || institutionId.length < 1 || institutionId.length > 64) {
    throw new Error("معرّف المؤسسة غير صالح");
  }
  const existing = await prisma.institution.findUnique({ where: { id: institutionId } });
  if (!existing) throw new Error("المؤسسة غير موجودة");

  const { _count } = await prisma.institution.findUniqueOrThrow({
    where: { id: institutionId },
    select: { _count: { select: { users: true, students: true, examModels: true } } },
  });
  if (_count.users > 0) {
    throw new Error("لا يمكن حذف مؤسسة لديها مستخدمون مرتبطون");
  }

  await prisma.institution.delete({ where: { id: institutionId } });

  await recordAudit(user.id, AuditAction.DELETE, {
    entity: "Institution",
    institutionId,
    name: existing.name,
  });

  revalidatePath("/admin/institutions");
  return { success: true };
}

export async function adminDeleteUser(userId: string): Promise<UpdateUserResult> {
  let user;
  try {
    user = await requireUser();
    requireRole(user, [Role.ADMIN]);
  } catch {
    return { success: false, error: "غير مصرح — يجب أن تكون أدمن" };
  }

  try {
    await checkRateLimit(`admin-delete-user:${user.id}`, 5);
  } catch (e) {
    return {
      success: false,
      error: e instanceof Error ? e.message : "تم تجاوز حد الطلبات المسموح، حاول لاحقاً",
    };
  }

  if (!userId || typeof userId !== "string" || userId.length < 1 || userId.length > 64) {
    return { success: false, error: "معرّف المستخدم غير صالح" };
  }
  if (userId === user.id) {
    return { success: false, error: "لا يمكنك حذف حسابك الحالي" };
  }

  const target = await prisma.user.findUnique({ where: { id: userId } });
  if (!target) return { success: false, error: "المستخدم غير موجود" };

  const activeSessions = await prisma.examSession.count({
    where: { OR: [{ teacher1Id: userId }, { teacher2Id: userId }] },
  });
  if (activeSessions > 0) {
    return { success: false, error: "لا يمكن حذف مستخدم لديه جلسات اختبار مرتبطة" };
  }

  await prisma.user.delete({ where: { id: userId } });

  try {
    await recordAudit(user.id, AuditAction.DELETE, {
      entity: "User",
      userId,
      name: target.name,
    });
  } catch {
    // فشل سجل التدقيق لا يمنع نجاح الحذف
  }

  revalidatePath("/admin/users");
  return { success: true };
}
