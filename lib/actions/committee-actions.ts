"use server";

import { requireUser, requireRole, requireTenantId } from "@/lib/security";
import { prisma } from "@/lib/prisma";
import { getTenantFilter, assertSameTenant } from "@/lib/tenancy";
import { AuditAction, Role } from "@prisma/client";
import { revalidatePath } from "next/cache";

// ============================================================
// المهمة 2: إدارة اللجان (Committee)
// صلاحية صارمة: TEST_SPECIALIST و ADMIN فقط
// كل إجراء يعيد union { success } | { success:false; error } ليعرض العميل الخطأ الحقيقي
// ============================================================

export type CreateCommitteeResult =
  | { success: true; committeeId: string }
  | { success: false; error: string };

export type CommitteeActionResult = { success: true } | { success: false; error: string };

export async function createCommittee(input: {
  name: string;
  branch: string;
  seasonId: string;
  teacher1Id: string;
  teacher2Id: string;
  modelIds: string[];
}): Promise<CreateCommitteeResult> {
  let user;
  try {
    user = await requireUser();
    requireRole(user, [Role.TEST_SPECIALIST, Role.ADMIN]);
  } catch {
    return { success: false, error: "غير مصرح — يجب أن تكون أخصائي اختبارات أو أدمن" };
  }

  const name = (input.name ?? "").trim();
  if (name.length < 2) return { success: false, error: "اسم اللجنة مطلوب (حرفان على الأقل)" };
  if (name.length > 200) return { success: false, error: "اسم اللجنة طويل جداً" };

  const validBranches = ["5", "10", "15", "20", "25", "30"];
  if (!validBranches.includes(input.branch)) {
    return { success: false, error: "الفرع غير صالح" };
  }

  if (!input.teacher1Id || !input.teacher2Id) {
    return { success: false, error: "يجب اختيار المختبرين" };
  }
  if (input.teacher1Id === input.teacher2Id) {
    return { success: false, error: "لا يمكن اختيار المختبر نفسه في المختبرين الأول والثاني" };
  }

  // التحقق من وجود الموسم
  const season = await prisma.examSeason.findUnique({
    where: { id: input.seasonId },
    select: { id: true, tenantId: true },
  });
  if (!season) return { success: false, error: "الموسم غير موجود" };
  assertSameTenant(user, season);

  // التحقق من وجود المختبرين
  const teachers = await prisma.user.findMany({
    where: { ...getTenantFilter(user), id: { in: [input.teacher1Id, input.teacher2Id] } },
    select: { id: true, role: true },
  });
  if (teachers.length !== 2) return { success: false, error: "أحد المختبرين غير موجود" };
  for (const t of teachers) {
    if (t.role !== Role.EXAMINER) {
      return { success: false, error: "يجب أن يكون كل من المختبرين بدور EXAMINER" };
    }
  }

  // منع التكرار
  const existing = await prisma.committee.findFirst({
    where: { ...getTenantFilter(user), name, seasonId: input.seasonId },
    select: { id: true },
  });
  if (existing) return { success: false, error: "يوجد لجنة بنفس الاسم في هذا الموسم" };

  const modelIds = input.modelIds ?? [];

  // التحقق من وجود النماذج المختارة في بنك الأسئلة (بنفس الفرع)
  const selectedModels = await prisma.questionBankModel.findMany({
    where: {
      ...getTenantFilter(user),
      branch: input.branch,
      id: { in: modelIds },
    },
    select: { id: true },
  });
  if (selectedModels.length !== modelIds.length) {
    return { success: false, error: "بعض النماذج المحددة غير موجودة أو لا تتطابق مع فرع اللجنة" };
  }

  let committee;
  try {
    committee = await prisma.$transaction(async (tx) => {
      const created = await tx.committee.create({
        data: {
          name,
          branch: input.branch,
          seasonId: input.seasonId,
          teacher1Id: input.teacher1Id,
          teacher2Id: input.teacher2Id,
          tenantId: requireTenantId(user),
        },
      });

      // ربط النماذج المختارة يدوياً من بنك الأسئلة (بلا ترتيب)
      if (modelIds.length > 0) {
        await tx.committeeModelSelection.createMany({
          data: modelIds.map((modelId) => ({ committeeId: created.id, modelId })),
        });
      }

      await tx.auditLog.create({
        data: {
          userId: user.id,
          tenantId: requireTenantId(user),
          action: AuditAction.CREATE,
          details: JSON.stringify({
            entity: "Committee",
            committeeId: created.id,
            name,
            branch: input.branch,
            teacher1Id: input.teacher1Id,
            teacher2Id: input.teacher2Id,
          }),
        },
      });

      return created;
    });
  } catch {
    return { success: false, error: "حدث خطأ غير متوقع أثناء إنشاء اللجنة" };
  }

  revalidatePath("/test-specialist/committees");
  return { success: true, committeeId: committee.id };
}

export async function deleteCommittee(committeeId: string): Promise<CommitteeActionResult> {
  let user;
  try {
    user = await requireUser();
    requireRole(user, [Role.TEST_SPECIALIST, Role.ADMIN]);
  } catch {
    return { success: false, error: "غير مصرح — يجب أن تكون أخصائي اختبارات أو أدمن" };
  }

  if (!committeeId || typeof committeeId !== "string" || committeeId.length > 64) {
    return { success: false, error: "معرّف اللجنة غير صالح" };
  }

  const committee = await prisma.committee.findUnique({
    where: { id: committeeId },
    select: {
      id: true,
      name: true,
      tenantId: true,
      _count: { select: { students: true } },
    },
  });
  if (!committee) return { success: false, error: "اللجنة غير موجودة" };
  assertSameTenant(user, committee);

  if (committee._count.students > 0) {
    return { success: false, error: "لا يمكن حذف لجنة مرتبط بها طلاب — أزل الطلاب أولاً" };
  }

  try {
    await prisma.$transaction(async (tx) => {
      // committeeModelSelection تُحذف تلقائياً (CASCADE) مع حذف اللجنة
      await tx.committee.delete({ where: { id: committeeId } });
      await tx.auditLog.create({
        data: {
          userId: user.id,
          tenantId: requireTenantId(user),
          action: AuditAction.DELETE,
          details: JSON.stringify({
            entity: "Committee",
            committeeId,
            name: committee.name,
          }),
        },
      });
    });
  } catch {
    return { success: false, error: "حدث خطأ غير متوقع أثناء حذف اللجنة" };
  }

  revalidatePath("/test-specialist/committees");
  return { success: true };
}

export async function assignStudentToCommittee(input: {
  studentId: string;
  committeeId: string;
}): Promise<CommitteeActionResult> {
  let user;
  try {
    user = await requireUser();
    requireRole(user, [Role.TEST_SPECIALIST, Role.ADMIN]);
  } catch {
    return { success: false, error: "غير مصرح — يجب أن تكون أخصائي اختبارات أو أدمن" };
  }

  const student = await prisma.student.findUnique({
    where: { id: input.studentId },
    select: { id: true, name: true, status: true, branch: true, tenantId: true },
  });
  if (!student) return { success: false, error: "الطالب غير موجود" };
  assertSameTenant(user, student);
  if (student.status !== "APPROVED") {
    return { success: false, error: "يجب أن يكون الطالب بحالة APPROVED قبل توزيعه على لجنة" };
  }

  const committee = await prisma.committee.findUnique({
    where: { id: input.committeeId },
    select: { id: true, branch: true, name: true, tenantId: true },
  });
  if (!committee) return { success: false, error: "اللجنة غير موجودة" };
  assertSameTenant(user, committee);

  try {
    await prisma.$transaction(async (tx) => {
      await tx.student.update({
        where: { id: input.studentId },
        data: {
          committeeId: input.committeeId,
          status: "ASSIGNED",
        },
      });

      await tx.auditLog.create({
        data: {
          userId: user.id,
          tenantId: requireTenantId(user),
          action: AuditAction.UPDATE,
          details: JSON.stringify({
            entity: "Student",
            studentId: input.studentId,
            committeeId: input.committeeId,
          }),
        },
      });
    });
  } catch {
    return { success: false, error: "حدث خطأ غير متوقع أثناء توزيع الطالب على اللجنة" };
  }

  revalidatePath("/test-specialist/committees");
  return { success: true };
}

export async function updateCommittee(
  committeeId: string,
  input: {
    name: string;
    branch: string;
    seasonId: string;
    teacher1Id: string;
    teacher2Id: string;
    modelIds: string[];
  }
): Promise<CommitteeActionResult> {
  let user;
  try {
    user = await requireUser();
    requireRole(user, [Role.TEST_SPECIALIST, Role.ADMIN]);
  } catch {
    return { success: false, error: "غير مصرح — يجب أن تكون أخصائي اختبارات أو أدمن" };
  }

  if (!committeeId || typeof committeeId !== "string" || committeeId.length > 64) {
    return { success: false, error: "معرّف اللجنة غير صالح" };
  }

  const committee = await prisma.committee.findUnique({
    where: { id: committeeId },
    select: { id: true, tenantId: true },
  });
  if (!committee) return { success: false, error: "اللجنة غير موجودة" };
  assertSameTenant(user, committee);

  const name = (input.name ?? "").trim();
  if (name.length < 2) return { success: false, error: "اسم اللجنة مطلوب (حرفان على الأقل)" };
  if (name.length > 200) return { success: false, error: "اسم اللجنة طويل جداً" };

  const validBranches = ["5", "10", "15", "20", "25", "30"];
  if (!validBranches.includes(input.branch)) {
    return { success: false, error: "الفرع غير صالح" };
  }

  if (!input.teacher1Id || !input.teacher2Id) {
    return { success: false, error: "يجب اختيار المختبرين" };
  }
  if (input.teacher1Id === input.teacher2Id) {
    return { success: false, error: "لا يمكن اختيار المختبر نفسه في المختبرين الأول والثاني" };
  }

  const season = await prisma.examSeason.findUnique({
    where: { id: input.seasonId },
    select: { id: true, tenantId: true },
  });
  if (!season) return { success: false, error: "الموسم غير موجود" };
  assertSameTenant(user, season);

  const teachers = await prisma.user.findMany({
    where: { ...getTenantFilter(user), id: { in: [input.teacher1Id, input.teacher2Id] } },
    select: { id: true, role: true },
  });
  if (teachers.length !== 2) return { success: false, error: "أحد المختبرين غير موجود" };
  for (const t of teachers) {
    if (t.role !== Role.EXAMINER) {
      return { success: false, error: "يجب أن يكون كل من المختبرين بدور EXAMINER" };
    }
  }

  const dup = await prisma.committee.findFirst({
    where: { ...getTenantFilter(user), name, seasonId: input.seasonId, id: { not: committeeId } },
    select: { id: true },
  });
  if (dup) return { success: false, error: "يوجد لجنة بنفس الاسم في هذا الموسم" };

  const modelIds = input.modelIds ?? [];

  // التحقق من وجود النماذج المختارة في بنك الأسئلة (بنفس الفرع)
  const selectedModels = await prisma.questionBankModel.findMany({
    where: {
      ...getTenantFilter(user),
      branch: input.branch,
      id: { in: modelIds },
    },
    select: { id: true },
  });
  if (selectedModels.length !== modelIds.length) {
    return { success: false, error: "بعض النماذج المحددة غير موجودة أو لا تتطابق مع فرع اللجنة" };
  }

  try {
    await prisma.$transaction(async (tx) => {
      await tx.committee.update({
        where: { id: committeeId },
        data: {
          name,
          branch: input.branch,
          seasonId: input.seasonId,
          teacher1Id: input.teacher1Id,
          teacher2Id: input.teacher2Id,
        },
      });

      // استبدال النماذج المختارة من بنك الأسئلة (بلا ترتيب)
      await tx.committeeModelSelection.deleteMany({ where: { committeeId } });
      if (modelIds.length > 0) {
        await tx.committeeModelSelection.createMany({
          data: modelIds.map((modelId) => ({ committeeId, modelId })),
        });
      }

      await tx.auditLog.create({
        data: {
          userId: user.id,
          tenantId: requireTenantId(user),
          action: AuditAction.UPDATE,
          details: JSON.stringify({
            entity: "Committee",
            committeeId,
            name,
            branch: input.branch,
            teacher1Id: input.teacher1Id,
            teacher2Id: input.teacher2Id,
          }),
        },
      });
    });
  } catch {
    return { success: false, error: "حدث خطأ غير متوقع أثناء تعديل اللجنة" };
  }

  revalidatePath("/test-specialist/committees");
  return { success: true };
}

export async function getCommittees(seasonId?: string) {
  const user = await requireUser();
  requireRole(user, [Role.TEST_SPECIALIST, Role.ADMIN]);

  return prisma.committee.findMany({
    where: { ...getTenantFilter(user), ...(seasonId ? { seasonId } : {}) },
    take: 100,
    include: {
      teacher1: { select: { id: true, name: true } },
      teacher2: { select: { id: true, name: true } },
      season: { select: { id: true, name: true } },
      selectedModels: {
        select: {
          id: true,
          model: { select: { id: true, modelNumber: true, branch: true } },
        },
        orderBy: { createdAt: "asc" },
      },
      _count: { select: { students: true } },
    },
    orderBy: { createdAt: "desc" },
  });
}
