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

export async function createAdminUser(input: {
  name: string;
  email: string;
  password: string;
  role: string;
  birthDate?: string;
  institutionId?: string;
}) {
  const user = await requireUser();
  requireRole(user, [Role.ADMIN]);

  await checkRateLimit(`admin-create-user:${user.id}`, 20);

  if (!input.name || input.name.trim().length < 2) throw new Error("الاسم مطلوب");
  if (input.name.length > 100) throw new Error("الاسم طويل جداً");
  if (!input.email || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(input.email)) {
    throw new Error("البريد الإلكتروني غير صالح");
  }
  if (input.email.length > 254) throw new Error("البريد الإلكتروني طويل جداً");
  if (!input.password || input.password.length < 4 || input.password.length > 8) {
    throw new Error("كلمة المرور يجب أن تكون بين 4 و 8 أحرف");
  }
  const validRoles = Object.values(Role);
  if (!validRoles.includes(input.role as Role)) {
    throw new Error("دور غير صالح");
  }

  // التحقق من عدم وجود بريد مكرر
  const existing = await prisma.user.findUnique({ where: { email: input.email } });
  if (existing) throw new Error("هذا البريد الإلكتروني مستخدم مسبقاً");

  // إذا كان الدور INSTITUTION، يجب ربط بمؤسسة
  const institutionId = input.role === Role.INSTITUTION ? input.institutionId ?? null : null;

  // إذا كان الدور من الممتحنين ورُبط بمؤسسة، يجب التحقق من وجودها
  if (institutionId) {
    const inst = await prisma.institution.findUnique({ where: { id: institutionId } });
    if (!inst) throw new Error("المؤسسة غير موجودة");
  }

  const birthDate = input.birthDate ? new Date(input.birthDate) : null;
  if (!birthDate) throw new Error("تاريخ الميلاد مطلوب");
  if (Number.isNaN(birthDate.getTime())) throw new Error("تاريخ الميلاد غير صالح");

  const hashedPassword = await bcrypt.hash(input.password, 12);

  const created = await prisma.user.create({
    data: {
      name: input.name.trim(),
      email: input.email.trim().toLowerCase(),
      password: hashedPassword,
      role: input.role as Role,
      birthDate,
      institutionId,
    },
  });

  await recordAudit(user.id, AuditAction.CREATE, {
    entity: "User",
    userId: created.id,
    name: created.name,
    role: created.role,
  });

  revalidatePath("/admin/users");
  return { success: true, userId: created.id };
}

export async function updateAdminUser(userId: string, input: {
  name?: string;
  email?: string;
  role?: string;
  birthDate?: string | null;
  institutionId?: string | null;
}) {
  const user = await requireUser();
  requireRole(user, [Role.ADMIN]);

  if (!userId || typeof userId !== "string" || userId.length < 1 || userId.length > 64) {
    throw new Error("معرّف المستخدم غير صالح");
  }

  const existing = await prisma.user.findUnique({ where: { id: userId } });
  if (!existing) throw new Error("المستخدم غير موجود");

  const data: Prisma.UserUncheckedUpdateInput = {};

  if (input.name !== undefined) {
    if (input.name.trim().length < 2) throw new Error("الاسم مطلوب");
    if (input.name.length > 100) throw new Error("الاسم طويل جداً");
    data.name = input.name.trim();
  }

  if (input.email !== undefined) {
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(input.email)) throw new Error("البريد الإلكتروني غير صالح");
    const dup = await prisma.user.findUnique({ where: { email: input.email.trim().toLowerCase() } });
    if (dup && dup.id !== userId) throw new Error("هذا البريد مستخدم مسبقاً");
    data.email = input.email.trim().toLowerCase();
  }

  if (input.role !== undefined) {
    if (!Object.values(Role).includes(input.role as Role)) throw new Error("دور غير صالح");
    const newInstitutionId =
      input.role === Role.INSTITUTION ? input.institutionId ?? existing.institutionId : null;
    if (newInstitutionId) {
      const inst = await prisma.institution.findUnique({ where: { id: newInstitutionId } });
      if (!inst) throw new Error("المؤسسة غير موجودة");
    }
    data.role = input.role as Role;
    data.institutionId = newInstitutionId;
  }

  if (input.birthDate !== undefined) {
    if (input.birthDate) {
      const bd = new Date(input.birthDate);
      if (Number.isNaN(bd.getTime())) throw new Error("تاريخ الميلاد غير صالح");
      data.birthDate = bd;
    } else {
      throw new Error("تاريخ الميلاد مطلوب");
    }
  }

  await prisma.user.update({ where: { id: userId }, data });

  await recordAudit(user.id, AuditAction.UPDATE, {
    entity: "User",
    userId,
    updatedFields: Object.keys(data),
  });

  revalidatePath("/admin/users");
  return { success: true };
}

export async function resetAdminUserPassword(userId: string, newPassword: string) {
  const user = await requireUser();
  requireRole(user, [Role.ADMIN]);

  await checkRateLimit(`admin-reset-pw:${user.id}`, 15);

  if (!userId || typeof userId !== "string" || userId.length < 1 || userId.length > 64) {
    throw new Error("معرّف المستخدم غير صالح");
  }
  if (!newPassword || newPassword.length < 4 || newPassword.length > 8) {
    throw new Error("كلمة المرور الجديدة يجب أن تكون بين 4 و 8 أحرف");
  }

  const target = await prisma.user.findUnique({ where: { id: userId } });
  if (!target) throw new Error("المستخدم غير موجود");

  const hashed = await bcrypt.hash(newPassword, 12);
  await prisma.user.update({ where: { id: userId }, data: { password: hashed } });

  await recordAudit(user.id, AuditAction.UPDATE, {
    entity: "User",
    userId,
    step: "PASSWORD_RESET",
  });

  return { success: true };
}

// ------------------------------------------------------------
// 3) إدارة المؤسسات
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
    where.name = { contains: params.search, mode: "insensitive" };
  }

  const skip = (page - 1) * pageSize;
  const [institutions, total] = await Promise.all([
    prisma.institution.findMany({
      where,
      select: {
        id: true,
        name: true,
        contactInfo: true,
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
  contactInfo?: string;
}) {
  const user = await requireUser();
  requireRole(user, [Role.ADMIN]);

  await checkRateLimit(`admin-create-inst:${user.id}`, 20);

  if (!input.name || input.name.trim().length < 2) throw new Error("اسم المؤسسة مطلوب");
  if (input.name.length > 200) throw new Error("اسم المؤسسة طويل جداً");

  const existing = await prisma.institution.findFirst({
    where: { name: { equals: input.name.trim(), mode: "insensitive" } },
  });
  if (existing) throw new Error("توجد مؤسسة بنفس الاسم");

  const institution = await prisma.institution.create({
    data: {
      name: input.name.trim(),
      contactInfo: input.contactInfo?.trim() ?? null,
    },
  });

  await recordAudit(user.id, AuditAction.CREATE, {
    entity: "Institution",
    institutionId: institution.id,
    name: institution.name,
  });

  revalidatePath("/admin/institutions");
  return { success: true, institutionId: institution.id };
}

export async function updateAdminInstitution(
  institutionId: string,
  input: { name?: string; contactInfo?: string }
) {
  const user = await requireUser();
  requireRole(user, [Role.ADMIN]);

  if (!institutionId || typeof institutionId !== "string" || institutionId.length < 1 || institutionId.length > 64) {
    throw new Error("معرّف المؤسسة غير صالح");
  }
  const existing = await prisma.institution.findUnique({ where: { id: institutionId } });
  if (!existing) throw new Error("المؤسسة غير موجودة");

  const data: Prisma.InstitutionUpdateInput = {};
  if (input.name !== undefined) {
    if (input.name.trim().length < 2) throw new Error("اسم المؤسسة مطلوب");
    if (input.name.length > 200) throw new Error("اسم المؤسسة طويل جداً");
    data.name = input.name.trim();
  }
  if (input.contactInfo !== undefined) data.contactInfo = input.contactInfo?.trim() ?? null;

  await prisma.institution.update({ where: { id: institutionId }, data });

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

export async function adminDeleteUser(userId: string) {
  const user = await requireUser();
  requireRole(user, [Role.ADMIN]);

  await checkRateLimit(`admin-delete-user:${user.id}`, 5);

  if (!userId || typeof userId !== "string" || userId.length < 1 || userId.length > 64) {
    throw new Error("معرّف المستخدم غير صالح");
  }
  if (userId === user.id) {
    throw new Error("لا يمكنك حذف حسابك الحالي");
  }

  const target = await prisma.user.findUnique({ where: { id: userId } });
  if (!target) throw new Error("المستخدم غير موجود");

  const activeSessions = await prisma.examSession.count({
    where: { OR: [{ teacher1Id: userId }, { teacher2Id: userId }] },
  });
  if (activeSessions > 0) {
    throw new Error("لا يمكن حذف مستخدم لديه جلسات اختبار مرتبطة");
  }

  await prisma.user.delete({ where: { id: userId } });

  await recordAudit(user.id, AuditAction.DELETE, {
    entity: "User",
    userId,
    name: target.name,
  });

  revalidatePath("/admin/users");
  return { success: true };
}
