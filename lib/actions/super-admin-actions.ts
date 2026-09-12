"use server";

import { z } from "zod";
import { revalidatePath } from "next/cache";
import bcrypt from "bcryptjs";
import { Role, AuditAction, NotificationType } from "@prisma/client";
import type { Prisma } from "@prisma/client";

import { prisma } from "@/lib/prisma";
import { requireUser } from "@/lib/security";
import type { SessionUser } from "@/lib/security";
import { requireSuperAdmin } from "@/lib/tenancy";
import { checkRateLimit } from "@/lib/rate-limit";
import { dispatchNotificationChannels } from "@/lib/notifications";
import { isUniqueConstraintError, friendlyUniqueMessage } from "@/lib/actions/unique-guard";

// ============================================================
// لوحة المالك (SUPER_ADMIN) — Server Actions (مستوى المنصة)
// كل عملية: requireSuperAdmin + Rate Limit للكتابة + AuditLog
// على مستوى المنصة (tenantId: null) + revalidatePath بعد الكتابة.
// ============================================================

export type ActionResult<T = Record<string, unknown>> =
  | ({ success: true } & T)
  | { success: false; error: string };

// ---------- مخططات Zod ----------
const hexColorSchema = z
  .string()
  .regex(/^#[0-9A-Fa-f]{6}$/, "لون غير صالح (مثال: #015e63)");

const slugSchema = z
  .string()
  .trim()
  .min(1, "المعرّف مطلوب")
  .max(100, "المعرّف طويل جداً")
  .regex(
    /^[a-z0-9]+(?:-[a-z0-9]+)*$/,
    "المعرّف: أحرف إنجليزية صغيرة وأرقام وشرطات فقط"
  );

const idSchema = z
  .string()
  .min(1, "المعرف مطلوب")
  .max(64, "المعرف طويل جداً");

const optionalTrimmedMax = (max: number) =>
  z.preprocess(
    (v) => (typeof v === "string" && v.trim() === "" ? undefined : v),
    z.string().trim().max(max).optional()
  );

const optionalUrl = z.preprocess(
  (v) => (typeof v === "string" && v.trim() === "" ? undefined : v),
  z.string().url("رابط غير صالح").max(500).optional()
);

const notifySchema = z.object({
  message: z
    .string()
    .trim()
    .min(1, "الرسالة مطلوبة")
    .max(500, "الرسالة طويلة جداً"),
  type: z.nativeEnum(NotificationType).default(NotificationType.INFO),
});

const createTenantSchema = z.object({
  name: z.string().trim().min(2, "اسم المؤسسة مطلوب").max(200, "الاسم طويل جداً"),
  slug: slugSchema,
  driveFolderId: optionalTrimmedMax(200),
  driveFolderUrl: optionalUrl,
  primaryColor: hexColorSchema.default("#015e63"),
  secondaryColor: hexColorSchema.default("#d3bb8b"),
});
export type CreateTenantInput = z.infer<typeof createTenantSchema>;

const createTenantAdminSchema = z.object({
  tenantId: idSchema,
  name: z.string().trim().min(2, "اسم المشرف مطلوب").max(100, "الاسم طويل جداً"),
  email: z
    .string()
    .trim()
    .toLowerCase()
    .email("بريد إلكتروني غير صالح")
    .max(254, "البريد الإلكتروني طويل جداً"),
  password: z
    .string()
    .min(5, "كلمة المرور يجب أن تكون 5 أحرف/رموز على الأقل")
    .max(128, "كلمة المرور طويلة جداً"),
});
export type CreateTenantAdminInput = z.infer<typeof createTenantAdminSchema>;

const updateTenantSchema = z.object({
  name: z.string().trim().min(2, "اسم المؤسسة مطلوب").max(200, "الاسم طويل جداً").optional(),
  driveFolderId: optionalTrimmedMax(200),
  driveFolderUrl: optionalUrl,
  primaryColor: hexColorSchema.optional(),
  secondaryColor: hexColorSchema.optional(),
});
export type UpdateTenantInput = z.infer<typeof updateTenantSchema>;

const reasonSchema = z.string().trim().max(200, "السبب طويل جداً").optional();

const tenantAdminTargetSchema = z.object({
  tenantId: idSchema,
  adminUserId: idSchema,
});

// ---------- أدوات مساعدة ----------
function errMessage(e: unknown): string {
  return e instanceof Error ? e.message : "حدث خطأ غير متوقع";
}

function firstError(error: z.ZodError): string {
  const flattened = error.flatten();
  const messages = Object.values(flattened.fieldErrors).filter(Boolean).flat();
  const first = messages[0];
  return first ?? "بيانات غير صالحة";
}

async function requireSuperAdminUser(): Promise<SessionUser> {
  const user = await requireUser();
  requireSuperAdmin(user);
  return user;
}

/** تسجيل تدقيق على مستوى المنصة (tenantId: null) — فشله لا يُفشل العملية */
async function auditPlatform(
  userId: string,
  action: AuditAction,
  details: Prisma.InputJsonValue
): Promise<void> {
  try {
    await prisma.auditLog.create({
      data: { userId, action, details, tenantId: null },
    });
  } catch {
    // فشل السجل لا يُفشل العملية الرئيسية
  }
}

/**
 * جلب معرفات المستخدمين المطابقين (مع chunking لتجنب استعلام ضخم واحد).
 */
async function fetchUserIdsForBulkNotify(
  where: Prisma.UserWhereInput,
  chunkSize = 1000
): Promise<{ id: string; tenantId: string | null }[]> {
  const result: { id: string; tenantId: string | null }[] = [];
  let skip = 0;
  for (;;) {
    const chunk = await prisma.user.findMany({
      where,
      select: { id: true, tenantId: true },
      orderBy: { id: "asc" },
      skip,
      take: chunkSize,
    });
    result.push(...chunk);
    if (chunk.length < chunkSize) break;
    skip += chunkSize;
  }
  return result;
}

// ============================================================
// المجموعة 1: قراءة
// ============================================================

/** إحصائيات المنصة + آخر المؤسسات + آخر التنبيهات الأمنية (مستوى المنصة). */
export async function getSuperAdminDashboardStats() {
  await requireSuperAdminUser();

  const [
    tenantCount,
    userCount,
    institutionCount,
    studentCount,
    sessionCount,
    recentTenants,
    recentAlerts,
  ] = await Promise.all([
    prisma.tenant.count(),
    prisma.user.count(),
    prisma.institution.count(),
    prisma.student.count(),
    prisma.examSession.count(),
    prisma.tenant.findMany({
      orderBy: { createdAt: "desc" },
      take: 5,
      select: {
        id: true,
        name: true,
        slug: true,
        isActive: true,
        createdAt: true,
        _count: { select: { users: true, institutions: true, students: true } },
      },
    }),
    prisma.auditLog.findMany({
      where: { tenantId: null },
      orderBy: { timestamp: "desc" },
      take: 10,
      include: { user: { select: { name: true, email: true } } },
    }),
  ]);

  return {
    stats: {
      tenants: tenantCount,
      users: userCount,
      institutions: institutionCount,
      students: studentCount,
      sessions: sessionCount,
    },
    recentTenants,
    recentAlerts,
  };
}

/** قائمة كل المؤسسات (المستأجرين). */
export async function getTenantsList() {
  await requireSuperAdminUser();

  return prisma.tenant.findMany({
    orderBy: { createdAt: "desc" },
    select: {
      id: true,
      name: true,
      slug: true,
      isActive: true,
      primaryColor: true,
      secondaryColor: true,
      createdAt: true,
      updatedAt: true,
      _count: { select: { users: true, institutions: true, students: true } },
    },
  });
}

/** تفاصيل مؤسسة + مستخدميها + مؤسساتها التعليمية + عدّادات. */
export async function getTenantDetails(tenantId: string) {
  await requireSuperAdminUser();
  const id = idSchema.parse(tenantId);

  const tenant = await prisma.tenant.findUnique({
    where: { id },
    select: {
      id: true,
      name: true,
      slug: true,
      driveFolderId: true,
      driveFolderUrl: true,
      primaryColor: true,
      secondaryColor: true,
      isActive: true,
      createdAt: true,
      updatedAt: true,
      users: {
        select: { id: true, name: true, email: true, role: true, createdAt: true },
        orderBy: { createdAt: "desc" },
        take: 200,
      },
      institutions: {
        select: { id: true, name: true, district: true, licenseNumber: true },
        orderBy: { createdAt: "desc" },
        take: 200,
      },
      _count: {
        select: {
          users: true,
          institutions: true,
          students: true,
          examSeasons: true,
          examModels: true,
          committees: true,
          examSessions: true,
          certificates: true,
        },
      },
    },
  });

  if (!tenant) throw new Error("المؤسسة غير موجودة");
  return tenant;
}

const tenantAuditFiltersSchema = z.object({
  action: z.nativeEnum(AuditAction).optional(),
  page: z.coerce.number().int().min(1).max(10000).default(1),
  pageSize: z.coerce.number().int().min(1).max(100).default(20),
});

/** سجل تدقيق خاص بمؤسسة معيّنة (مصفَّح). */
export async function getTenantAuditLog(
  tenantId: string,
  filters?: { action?: string; page?: number; pageSize?: number }
) {
  await requireSuperAdminUser();
  const id = idSchema.parse(tenantId);
  const parsed = tenantAuditFiltersSchema.parse(filters ?? {});

  const where: Prisma.AuditLogWhereInput = { tenantId: id };
  if (parsed.action) where.action = parsed.action;

  const skip = (parsed.page - 1) * parsed.pageSize;
  const [logs, total] = await Promise.all([
    prisma.auditLog.findMany({
      where,
      orderBy: { timestamp: "desc" },
      skip,
      take: parsed.pageSize,
      include: { user: { select: { name: true, email: true } } },
    }),
    prisma.auditLog.count({ where }),
  ]);

  return {
    logs,
    total,
    page: parsed.page,
    pageSize: parsed.pageSize,
    totalPages: Math.ceil(total / parsed.pageSize),
  };
}

/** جلسات اختبار مؤسسة (أحدث 100 جلسة). */
export async function getTenantSessions(tenantId: string) {
  await requireSuperAdminUser();
  const id = idSchema.parse(tenantId);

  return prisma.examSession.findMany({
    where: { tenantId: id },
    orderBy: { examDate: "desc" },
    take: 100,
    select: {
      id: true,
      examDate: true,
      period: true,
      status: true,
      student: { select: { name: true, branch: true } },
      teacher1: { select: { name: true } },
      teacher2: { select: { name: true } },
      season: { select: { name: true } },
    },
  });
}

/**
 * ألوان Tenant المستخدم الحالي (للتلوين الديناميكي).
 * SUPER_ADMIN أو مستخدم بلا tenant → null (لا تُعدَّل المتغيرات).
 */
export async function getMyTenantColors() {
  const user = await requireUser();
  if (!user.tenantId) return null;

  return prisma.tenant.findUnique({
    where: { id: user.tenantId },
    select: { primaryColor: true, secondaryColor: true },
  });
}

// ============================================================
// المجموعة 2: إنشاء/تحديث
// ============================================================

/** إنشاء مؤسسة جديدة. */
export async function createTenant(
  input: CreateTenantInput
): Promise<ActionResult<{ tenantId: string }>> {
  let user;
  try {
    user = await requireSuperAdminUser();
  } catch (e) {
    return { success: false, error: errMessage(e) };
  }

  try {
    await checkRateLimit(`super-admin:create-tenant:${user.id}`, 10);
  } catch (e) {
    return { success: false, error: errMessage(e) };
  }

  const parsed = createTenantSchema.safeParse(input);
  if (!parsed.success) return { success: false, error: firstError(parsed.error) };
  const data = parsed.data;

  try {
    const tenant = await prisma.tenant.create({
      data: {
        name: data.name,
        slug: data.slug,
        driveFolderId: data.driveFolderId ?? null,
        driveFolderUrl: data.driveFolderUrl ?? null,
        primaryColor: data.primaryColor,
        secondaryColor: data.secondaryColor,
      },
    });

    await auditPlatform(user.id, AuditAction.CREATE, {
      entity: "Tenant",
      tenantId: tenant.id,
      name: tenant.name,
      slug: tenant.slug,
    });

    revalidatePath("/super-admin/tenants");
    return { success: true, tenantId: tenant.id };
  } catch (error) {
    if (isUniqueConstraintError(error)) {
      return { success: false, error: friendlyUniqueMessage(error) };
    }
    console.error("createTenant failed:", error);
    return { success: false, error: "حدث خطأ غير متوقع أثناء إنشاء المؤسسة" };
  }
}

/** إنشاء مشرف (ADMIN) لمؤسسة معيّنة. */
export async function createTenantAdmin(
  input: CreateTenantAdminInput
): Promise<ActionResult<{ userId: string }>> {
  let user;
  try {
    user = await requireSuperAdminUser();
  } catch (e) {
    return { success: false, error: errMessage(e) };
  }

  try {
    await checkRateLimit(`super-admin:create-admin:${user.id}`, 20);
  } catch (e) {
    return { success: false, error: errMessage(e) };
  }

  const parsed = createTenantAdminSchema.safeParse(input);
  if (!parsed.success) return { success: false, error: firstError(parsed.error) };
  const data = parsed.data;

  const tenant = await prisma.tenant.findUnique({
    where: { id: data.tenantId },
    select: { id: true },
  });
  if (!tenant) return { success: false, error: "المؤسسة غير موجودة" };

  const existingEmail = await prisma.user.findUnique({
    where: { email: data.email },
    select: { id: true },
  });
  if (existingEmail) return { success: false, error: "هذا البريد الإلكتروني مستخدم مسبقاً" };

  const hashedPassword = await bcrypt.hash(data.password, 12);

  try {
    const admin = await prisma.user.create({
      data: {
        name: data.name,
        email: data.email,
        password: hashedPassword,
        role: Role.ADMIN,
        tenantId: data.tenantId,
        birthDate: new Date("1990-01-01"),
        mustChangePassword: true,
      },
    });

    await auditPlatform(user.id, AuditAction.CREATE, {
      entity: "TenantAdmin",
      tenantId: data.tenantId,
      userId: admin.id,
      name: admin.name,
      email: admin.email,
    });

    revalidatePath(`/super-admin/tenants/${data.tenantId}`);
    revalidatePath("/super-admin/tenants");
    return { success: true, userId: admin.id };
  } catch (error) {
    if (isUniqueConstraintError(error)) {
      return { success: false, error: friendlyUniqueMessage(error) };
    }
    console.error("createTenantAdmin failed:", error);
    return { success: false, error: "حدث خطأ غير متوقع أثناء إنشاء المشرف" };
  }
}

/** تحديث بيانات مؤسسة. */
export async function updateTenant(
  tenantId: string,
  input: UpdateTenantInput
): Promise<ActionResult> {
  let user;
  try {
    user = await requireSuperAdminUser();
  } catch (e) {
    return { success: false, error: errMessage(e) };
  }

  try {
    await checkRateLimit(`super-admin:update-tenant:${user.id}`, 30);
  } catch (e) {
    return { success: false, error: errMessage(e) };
  }

  const idParsed = idSchema.safeParse(tenantId);
  if (!idParsed.success) return { success: false, error: firstError(idParsed.error) };

  const parsedInput = updateTenantSchema.safeParse(input);
  if (!parsedInput.success) return { success: false, error: firstError(parsedInput.error) };
  const data = parsedInput.data;

  const existing = await prisma.tenant.findUnique({
    where: { id: idParsed.data },
    select: { id: true },
  });
  if (!existing) return { success: false, error: "المؤسسة غير موجودة" };

  const updateData: Prisma.TenantUpdateInput = {};
  if (data.name !== undefined) updateData.name = data.name;
  if (data.driveFolderId !== undefined) updateData.driveFolderId = data.driveFolderId ?? null;
  if (data.driveFolderUrl !== undefined) updateData.driveFolderUrl = data.driveFolderUrl ?? null;
  if (data.primaryColor !== undefined) updateData.primaryColor = data.primaryColor;
  if (data.secondaryColor !== undefined) updateData.secondaryColor = data.secondaryColor;
  if (Object.keys(updateData).length === 0) return { success: true };

  try {
    const tenant = await prisma.tenant.update({
      where: { id: idParsed.data },
      data: updateData,
    });

    await auditPlatform(user.id, AuditAction.UPDATE, {
      entity: "Tenant",
      tenantId: tenant.id,
      name: tenant.name,
      updatedFields: Object.keys(updateData),
    });

    revalidatePath(`/super-admin/tenants/${tenant.id}`);
    revalidatePath("/super-admin/tenants");
    return { success: true };
  } catch (error) {
    if (isUniqueConstraintError(error)) {
      return { success: false, error: friendlyUniqueMessage(error) };
    }
    console.error("updateTenant failed:", error);
    return { success: false, error: "حدث خطأ غير متوقع أثناء حفظ التعديلات" };
  }
}

// ============================================================
// المجموعة 3: تحكم مطلق
// ============================================================

/** تعطيل مؤسسة مؤقتاً. */
export async function deactivateTenant(
  tenantId: string,
  reason?: string
): Promise<ActionResult> {
  let user;
  try {
    user = await requireSuperAdminUser();
  } catch (e) {
    return { success: false, error: errMessage(e) };
  }

  try {
    await checkRateLimit(`super-admin:tenant-status:${user.id}`, 30);
  } catch (e) {
    return { success: false, error: errMessage(e) };
  }

  const idParsed = idSchema.safeParse(tenantId);
  if (!idParsed.success) return { success: false, error: firstError(idParsed.error) };

  const reasonParsed = reasonSchema.safeParse(reason);
  if (!reasonParsed.success) return { success: false, error: firstError(reasonParsed.error) };

  const tenant = await prisma.tenant.findUnique({
    where: { id: idParsed.data },
    select: { id: true, name: true },
  });
  if (!tenant) return { success: false, error: "المؤسسة غير موجودة" };

  try {
    await prisma.tenant.update({
      where: { id: tenant.id },
      data: { isActive: false },
    });

    await auditPlatform(user.id, AuditAction.UPDATE, {
      entity: "Tenant",
      tenantId: tenant.id,
      name: tenant.name,
      operation: "deactivate",
      reason: reasonParsed.data ?? null,
    });

    revalidatePath(`/super-admin/tenants/${tenant.id}`);
    revalidatePath("/super-admin/tenants");
    return { success: true };
  } catch (error) {
    console.error("deactivateTenant failed:", error);
    return { success: false, error: "حدث خطأ غير متوقع أثناء التعطيل" };
  }
}

/** تفعيل مؤسسة مجدداً. */
export async function activateTenant(tenantId: string): Promise<ActionResult> {
  let user;
  try {
    user = await requireSuperAdminUser();
  } catch (e) {
    return { success: false, error: errMessage(e) };
  }

  try {
    await checkRateLimit(`super-admin:tenant-status:${user.id}`, 30);
  } catch (e) {
    return { success: false, error: errMessage(e) };
  }

  const idParsed = idSchema.safeParse(tenantId);
  if (!idParsed.success) return { success: false, error: firstError(idParsed.error) };

  const tenant = await prisma.tenant.findUnique({
    where: { id: idParsed.data },
    select: { id: true, name: true },
  });
  if (!tenant) return { success: false, error: "المؤسسة غير موجودة" };

  try {
    await prisma.tenant.update({
      where: { id: tenant.id },
      data: { isActive: true },
    });

    await auditPlatform(user.id, AuditAction.UPDATE, {
      entity: "Tenant",
      tenantId: tenant.id,
      name: tenant.name,
      operation: "activate",
    });

    revalidatePath(`/super-admin/tenants/${tenant.id}`);
    revalidatePath("/super-admin/tenants");
    return { success: true };
  } catch (error) {
    console.error("activateTenant failed:", error);
    return { success: false, error: "حدث خطأ غير متوقع أثناء التفعيل" };
  }
}

/** حذف آمن — يُرفض إذا كانت المؤسسة مرتبطة بمستخدمين/جهات/طلاب. */
export async function deleteTenant(tenantId: string): Promise<ActionResult> {
  let user;
  try {
    user = await requireSuperAdminUser();
  } catch (e) {
    return { success: false, error: errMessage(e) };
  }

  try {
    await checkRateLimit(`super-admin:delete-tenant:${user.id}`, 5);
  } catch (e) {
    return { success: false, error: errMessage(e) };
  }

  const idParsed = idSchema.safeParse(tenantId);
  if (!idParsed.success) return { success: false, error: firstError(idParsed.error) };

  const tenant = await prisma.tenant.findUnique({
    where: { id: idParsed.data },
    select: {
      id: true,
      name: true,
      _count: { select: { users: true, institutions: true, students: true } },
    },
  });
  if (!tenant) return { success: false, error: "المؤسسة غير موجودة" };

  const total =
    tenant._count.users + tenant._count.institutions + tenant._count.students;
  if (total > 0) {
    return {
      success: false,
      error: "لا يمكن حذف مؤسسة مرتبطة ببيانات (مستخدمون/جهات/طلاب) — استخدم الحذف القسري بعد التأكد",
    };
  }

  try {
    await auditPlatform(user.id, AuditAction.DELETE, {
      entity: "Tenant",
      tenantId: tenant.id,
      name: tenant.name,
      safeDelete: true,
    });

    await prisma.tenant.delete({ where: { id: tenant.id } });

    revalidatePath("/super-admin/tenants");
    return { success: true };
  } catch (error) {
    if (isUniqueConstraintError(error)) {
      return { success: false, error: friendlyUniqueMessage(error) };
    }
    console.error("deleteTenant failed:", error);
    return { success: false, error: "حدث خطأ غير متوقع أثناء الحذف" };
  }
}

/**
 * حذف قسري آمن — يتطلب confirmToken يطابق slug المؤسسة،
 * ويحذف كل بياناتها عبر onDelete: Cascade.
 * ممنوع حذف المؤسسة الرئيسية (madina-quran) حمايةً للبيانات.
 */
export async function forceDeleteTenant(
  tenantId: string,
  confirmToken: string
): Promise<ActionResult> {
  let user;
  try {
    user = await requireSuperAdminUser();
  } catch (e) {
    return { success: false, error: errMessage(e) };
  }

  try {
    await checkRateLimit(`super-admin:force-delete-tenant:${user.id}`, 3);
  } catch (e) {
    return { success: false, error: errMessage(e) };
  }

  const idParsed = idSchema.safeParse(tenantId);
  if (!idParsed.success) return { success: false, error: firstError(idParsed.error) };

  const tokenParsed = z.string().trim().min(1, "أدخل الاسم لتأكيد الحذف").safeParse(confirmToken);
  if (!tokenParsed.success) return { success: false, error: firstError(tokenParsed.error) };

  const tenant = await prisma.tenant.findUnique({
    where: { id: idParsed.data },
    select: { id: true, name: true, slug: true },
  });
  if (!tenant) return { success: false, error: "المؤسسة غير موجودة" };

  if (tenant.slug === "madina-quran") {
    return { success: false, error: "ممنوع حذف المؤسسة الرئيسية (madina-quran)" };
  }
  if (tokenParsed.data !== tenant.slug) {
    return {
      success: false,
      error: "رمز التأكيد غير صحيح — اكتب المعرف (slug) الخاص بالمؤسسة كما هو",
    };
  }

  try {
    await auditPlatform(user.id, AuditAction.DELETE, {
      entity: "Tenant",
      tenantId: tenant.id,
      name: tenant.name,
      forceDelete: true,
      confirmToken: tokenParsed.data,
      warning: "حذف قسري متسلسل لجميع بيانات المستأجر (Cascade)",
    });

    await prisma.tenant.delete({ where: { id: tenant.id } });

    revalidatePath("/super-admin/tenants");
    return { success: true };
  } catch (error) {
    console.error("forceDeleteTenant failed:", error);
    return { success: false, error: "حدث خطأ غير متوقع أثناء الحذف القسري" };
  }
}

/** إعادة تعيين كلمة مرور مشرف مؤسسة. */
export async function resetTenantAdminPassword(
  input: ResetTenantAdminPasswordInput
): Promise<ActionResult> {
  let user;
  try {
    user = await requireSuperAdminUser();
  } catch (e) {
    return { success: false, error: errMessage(e) };
  }

  try {
    await checkRateLimit(`super-admin:reset-pass:${user.id}`, 15);
  } catch (e) {
    return { success: false, error: errMessage(e) };
  }

  const parsed = resetTenantAdminPasswordSchema.safeParse(input);
  if (!parsed.success) return { success: false, error: firstError(parsed.error) };
  const data = parsed.data;

  const admin = await prisma.user.findFirst({
    where: { id: data.adminUserId, tenantId: data.tenantId, role: Role.ADMIN },
    select: { id: true, name: true },
  });
  if (!admin) return { success: false, error: "مشرف المؤسسة غير موجود" };

  const hashedPassword = await bcrypt.hash(data.newPassword, 12);

  try {
    await prisma.user.update({
      where: { id: admin.id },
      data: { password: hashedPassword },
    });

    await auditPlatform(user.id, AuditAction.UPDATE, {
      entity: "TenantAdmin",
      tenantId: data.tenantId,
      userId: admin.id,
      name: admin.name,
      operation: "PASSWORD_RESET",
    });

    revalidatePath(`/super-admin/tenants/${data.tenantId}`);
    return { success: true };
  } catch (error) {
    console.error("resetTenantAdminPassword failed:", error);
    return { success: false, error: "حدث خطأ غير متوقع أثناء إعادة التعيين" };
  }
}

const resetTenantAdminPasswordSchema = z.object({
  tenantId: idSchema,
  adminUserId: idSchema,
  newPassword: z
    .string()
    .min(5, "كلمة المرور يجب أن تكون 5 أحرف/رموز على الأقل")
    .max(128, "كلمة المرور طويلة جداً"),
});
export type ResetTenantAdminPasswordInput = z.infer<typeof resetTenantAdminPasswordSchema>;

/** حذف مشرف من مؤسسة — يمنع حذف آخر مشرف متبقٍ. */
export async function deleteTenantAdmin(
  input: TenantAdminTarget
): Promise<ActionResult> {
  let user;
  try {
    user = await requireSuperAdminUser();
  } catch (e) {
    return { success: false, error: errMessage(e) };
  }

  try {
    await checkRateLimit(`super-admin:delete-admin:${user.id}`, 15);
  } catch (e) {
    return { success: false, error: errMessage(e) };
  }

  const parsed = tenantAdminTargetSchema.safeParse(input);
  if (!parsed.success) return { success: false, error: firstError(parsed.error) };
  const { tenantId, adminUserId } = parsed.data;

  const admin = await prisma.user.findFirst({
    where: { id: adminUserId, tenantId, role: Role.ADMIN },
    select: { id: true, name: true },
  });
  if (!admin) return { success: false, error: "مشرف المؤسسة غير موجود" };

  const adminsCount = await prisma.user.count({
    where: { tenantId, role: Role.ADMIN },
  });
  if (adminsCount <= 1) {
    return { success: false, error: "لا يمكن حذف آخر مشرف في المؤسسة" };
  }

  try {
    await auditPlatform(user.id, AuditAction.DELETE, {
      entity: "TenantAdmin",
      tenantId,
      userId: admin.id,
      name: admin.name,
    });

    await prisma.user.delete({ where: { id: admin.id } });

    revalidatePath(`/super-admin/tenants/${tenantId}`);
    revalidatePath("/super-admin/tenants");
    return { success: true };
  } catch (error) {
    if (isUniqueConstraintError(error)) {
      return { success: false, error: friendlyUniqueMessage(error) };
    }
    console.error("deleteTenantAdmin failed:", error);
    return { success: false, error: "حدث خطأ غير متوقع أثناء حذف المشرف" };
  }
}

type TenantAdminTarget = {
  tenantId: string;
  adminUserId: string;
};

// ============================================================
// المجموعة 4: إشعارات مطلقة
// ============================================================

/** إشعار لمشرفي (ADMIN) مؤسسة معيّنة. */
export async function notifyTenantAdmins(
  tenantId: string,
  message: string,
  type?: NotificationType
): Promise<ActionResult<{ count: number }>> {
  let user;
  try {
    user = await requireSuperAdminUser();
  } catch (e) {
    return { success: false, error: errMessage(e) };
  }

  try {
    await checkRateLimit(`super-admin:notify:${user.id}`, 30);
  } catch (e) {
    return { success: false, error: errMessage(e) };
  }

  const idParsed = idSchema.safeParse(tenantId);
  if (!idParsed.success) return { success: false, error: firstError(idParsed.error) };

  const notifyParsed = notifySchema.safeParse({
    message,
    type: type ?? NotificationType.INFO,
  });
  if (!notifyParsed.success) return { success: false, error: firstError(notifyParsed.error) };
  const data = notifyParsed.data;

  const admins = await prisma.user.findMany({
    where: { tenantId: idParsed.data, role: Role.ADMIN },
    select: { id: true, tenantId: true },
  });
  if (admins.length === 0) return { success: true, count: 0 };

  try {
    const result = await prisma.notification.createMany({
      data: admins.map((a) => ({
        userId: a.id,
        message: data.message,
        type: data.type,
        tenantId: a.tenantId,
      })),
      skipDuplicates: true,
    });

    await dispatchNotificationChannels({
      userIds: admins.map((a) => a.id),
      message: data.message,
      type: data.type,
    });

    await auditPlatform(user.id, AuditAction.CREATE, {
      entity: "Notification",
      tenantId: idParsed.data,
      scope: "tenantAdmins",
      count: admins.length,
    });

    revalidatePath(`/super-admin/tenants/${idParsed.data}`);
    return { success: true, count: result.count };
  } catch (error) {
    console.error("notifyTenantAdmins failed:", error);
    return { success: false, error: "حدث خطأ غير متوقع أثناء إرسال الإشعار" };
  }
}

/** بث إشعار لكل مستخدمي مؤسسة معيّنة. */
export async function notifyAllTenantUsers(
  tenantId: string,
  message: string,
  type?: NotificationType
): Promise<ActionResult<{ count: number }>> {
  let user;
  try {
    user = await requireSuperAdminUser();
  } catch (e) {
    return { success: false, error: errMessage(e) };
  }

  try {
    await checkRateLimit(`super-admin:notify:${user.id}`, 30);
  } catch (e) {
    return { success: false, error: errMessage(e) };
  }

  const idParsed = idSchema.safeParse(tenantId);
  if (!idParsed.success) return { success: false, error: firstError(idParsed.error) };

  const notifyParsed = notifySchema.safeParse({
    message,
    type: type ?? NotificationType.INFO,
  });
  if (!notifyParsed.success) return { success: false, error: firstError(notifyParsed.error) };
  const data = notifyParsed.data;

  const recipients = await fetchUserIdsForBulkNotify({ tenantId: idParsed.data });
  if (recipients.length === 0) return { success: true, count: 0 };

  try {
    const result = await prisma.notification.createMany({
      data: recipients.map((r) => ({
        userId: r.id,
        message: data.message,
        type: data.type,
        tenantId: r.tenantId,
      })),
      skipDuplicates: true,
    });

    await dispatchNotificationChannels({
      userIds: recipients.map((r) => r.id),
      message: data.message,
      type: data.type,
    });

    await auditPlatform(user.id, AuditAction.CREATE, {
      entity: "Notification",
      tenantId: idParsed.data,
      scope: "tenantAllUsers",
      count: recipients.length,
    });

    revalidatePath(`/super-admin/tenants/${idParsed.data}`);
    return { success: true, count: result.count };
  } catch (error) {
    console.error("notifyAllTenantUsers failed:", error);
    return { success: false, error: "حدث خطأ غير متوقع أثناء البث" };
  }
}

/** إشعار لكل مشرفي المنصة (SUPER_ADMIN). */
export async function notifyAllAdmins(
  message: string,
  type?: NotificationType
): Promise<ActionResult<{ count: number }>> {
  let user;
  try {
    user = await requireSuperAdminUser();
  } catch (e) {
    return { success: false, error: errMessage(e) };
  }

  try {
    await checkRateLimit(`super-admin:notify:${user.id}`, 30);
  } catch (e) {
    return { success: false, error: errMessage(e) };
  }

  const notifyParsed = notifySchema.safeParse({
    message,
    type: type ?? NotificationType.INFO,
  });
  if (!notifyParsed.success) return { success: false, error: firstError(notifyParsed.error) };
  const data = notifyParsed.data;

  const admins = await prisma.user.findMany({
    where: { role: Role.SUPER_ADMIN },
    select: { id: true, tenantId: true },
  });
  if (admins.length === 0) return { success: true, count: 0 };

  try {
    const result = await prisma.notification.createMany({
      data: admins.map((a) => ({
        userId: a.id,
        message: data.message,
        type: data.type,
        tenantId: a.tenantId,
      })),
      skipDuplicates: true,
    });

    await dispatchNotificationChannels({
      userIds: admins.map((a) => a.id),
      message: data.message,
      type: data.type,
    });

    await auditPlatform(user.id, AuditAction.CREATE, {
      entity: "Notification",
      tenantId: null,
      scope: "allPlatformAdmins",
      count: admins.length,
    });

    revalidatePath("/super-admin");
    return { success: true, count: result.count };
  } catch (error) {
    console.error("notifyAllAdmins failed:", error);
    return { success: false, error: "حدث خطأ غير متوقع أثناء إرسال الإشعار" };
  }
}

/** بث إشعار لكل مستخدمي المنصة (بما فيهم SUPER_ADMIN). */
export async function broadcastToAllUsers(
  message: string,
  type?: NotificationType
): Promise<ActionResult<{ count: number }>> {
  let user;
  try {
    user = await requireSuperAdminUser();
  } catch (e) {
    return { success: false, error: errMessage(e) };
  }

  try {
    await checkRateLimit(`super-admin:broadcast:${user.id}`, 10);
  } catch (e) {
    return { success: false, error: errMessage(e) };
  }

  const notifyParsed = notifySchema.safeParse({
    message,
    type: type ?? NotificationType.INFO,
  });
  if (!notifyParsed.success) return { success: false, error: firstError(notifyParsed.error) };
  const data = notifyParsed.data;

  const recipients = await fetchUserIdsForBulkNotify({});
  if (recipients.length === 0) return { success: true, count: 0 };

  try {
    const result = await prisma.notification.createMany({
      data: recipients.map((r) => ({
        userId: r.id,
        message: data.message,
        type: data.type,
        tenantId: r.tenantId,
      })),
      skipDuplicates: true,
    });

    await dispatchNotificationChannels({
      userIds: recipients.map((r) => r.id),
      message: data.message,
      type: data.type,
    });

    await auditPlatform(user.id, AuditAction.CREATE, {
      entity: "Notification",
      tenantId: null,
      scope: "broadcastAllUsers",
      count: recipients.length,
    });

    revalidatePath("/super-admin");
    return { success: true, count: result.count };
  } catch (error) {
    console.error("broadcastToAllUsers failed:", error);
    return { success: false, error: "حدث خطأ غير متوقع أثناء البث" };
  }
}