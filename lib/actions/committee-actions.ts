"use server";

import { requireUser, requireRole } from "@/lib/security";
import { prisma } from "@/lib/prisma";
import { AuditAction, Role } from "@prisma/client";
import { revalidatePath } from "next/cache";

// ============================================================
// المهمة 2: إدارة اللجان (Committee)
// صلاحية صارمة: TEST_SPECIALIST و ADMIN فقط
// ============================================================

export async function createCommittee(input: {
  name: string;
  branch: string;
  seasonId: string;
  teacher1Id: string;
  teacher2Id: string;
  startModelNumber?: number;
  endModelNumber?: number;
}) {
  const user = await requireUser();
  requireRole(user, [Role.TEST_SPECIALIST, Role.ADMIN]);

  const name = (input.name ?? "").trim();
  if (name.length < 2) throw new Error("اسم اللجنة مطلوب (حرفان على الأقل)");
  if (name.length > 200) throw new Error("اسم اللجنة طويل جداً");

  const validBranches = ["5", "10", "15", "20", "25", "30"];
  if (!validBranches.includes(input.branch)) {
    throw new Error("الفرع غير صالح");
  }

  if (!input.teacher1Id || !input.teacher2Id) {
    throw new Error("يجب اختيار المعلمين");
  }
  if (input.teacher1Id === input.teacher2Id) {
    throw new Error("لا يمكن اختيار المعلم نفسه في المعلمين الأول والثاني");
  }

  // التحقق من وجود الموسم
  const season = await prisma.examSeason.findUnique({
    where: { id: input.seasonId },
    select: { id: true },
  });
  if (!season) throw new Error("الموسم غير موجود");

  // التحقق من وجود المعلمين
  const teachers = await prisma.user.findMany({
    where: { id: { in: [input.teacher1Id, input.teacher2Id] } },
    select: { id: true, role: true },
  });
  if (teachers.length !== 2) throw new Error("أحد المعلمين غير موجود");
  for (const t of teachers) {
    if (t.role !== Role.EXAMINER) {
      throw new Error("يجب أن يكون كل من المعلمين بدور EXAMINER");
    }
  }

  // منع التكرار
  const existing = await prisma.committee.findFirst({
    where: { name, seasonId: input.seasonId },
    select: { id: true },
  });
  if (existing) throw new Error("يوجد لجنة بنفس الاسم في هذا الموسم");

  const start = input.startModelNumber ?? 1;
  const end = input.endModelNumber ?? 10;

  const committee = await prisma.$transaction(async (tx) => {
    const created = await tx.committee.create({
      data: {
        name,
        branch: input.branch,
        seasonId: input.seasonId,
        teacher1Id: input.teacher1Id,
        teacher2Id: input.teacher2Id,
      },
    });

    // توزيع النماذج على اللجنة إذا حُدد نطاق
    await tx.committeeModelAllocation.create({
      data: {
        committeeId: created.id,
        branch: input.branch,
        startModelNumber: start,
        endModelNumber: end,
        seasonId: input.seasonId,
      },
    });

    await tx.auditLog.create({
      data: {
        userId: user.id,
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

  revalidatePath("/test-specialist/committees");
  return { success: true, committeeId: committee.id };
}

export async function deleteCommittee(committeeId: string) {
  const user = await requireUser();
  requireRole(user, [Role.TEST_SPECIALIST, Role.ADMIN]);

  if (!committeeId || typeof committeeId !== "string" || committeeId.length > 64) {
    throw new Error("معرّف اللجنة غير صالح");
  }

  const committee = await prisma.committee.findUnique({
    where: { id: committeeId },
    select: {
      id: true,
      name: true,
      _count: { select: { students: true } },
    },
  });
  if (!committee) throw new Error("اللجنة غير موجودة");

  if (committee._count.students > 0) {
    throw new Error("لا يمكن حذف لجنة مرتبط بها طلاب — أزل الطلاب أولاً");
  }

  await prisma.$transaction(async (tx) => {
    await tx.committeeModelAllocation.deleteMany({
      where: { committeeId },
    });
    await tx.committee.delete({ where: { id: committeeId } });
    await tx.auditLog.create({
      data: {
        userId: user.id,
        action: AuditAction.DELETE,
        details: JSON.stringify({
          entity: "Committee",
          committeeId,
          name: committee.name,
        }),
      },
    });
  });

  revalidatePath("/test-specialist/committees");
  return { success: true };
}

export async function assignStudentToCommittee(input: {
  studentId: string;
  committeeId: string;
}) {
  const user = await requireUser();
  requireRole(user, [Role.TEST_SPECIALIST, Role.ADMIN]);

  const student = await prisma.student.findUnique({
    where: { id: input.studentId },
    select: { id: true, name: true, status: true, branch: true },
  });
  if (!student) throw new Error("الطالب غير موجود");
  if (student.status !== "APPROVED") {
    throw new Error("يجب أن يكون الطالب بحالة APPROVED قبل توزيعه على لجنة");
  }

  const committee = await prisma.committee.findUnique({
    where: { id: input.committeeId },
    select: { id: true, branch: true, name: true },
  });
  if (!committee) throw new Error("اللجنة غير موجودة");

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
        action: AuditAction.UPDATE,
        details: JSON.stringify({
          entity: "Student",
          studentId: input.studentId,
          committeeId: input.committeeId,
        }),
      },
    });
  });

  revalidatePath("/test-specialist/committees");
  return { success: true };
}

export async function getCommittees(seasonId?: string) {
  const user = await requireUser();
  requireRole(user, [Role.TEST_SPECIALIST, Role.ADMIN]);

  return prisma.committee.findMany({
    where: seasonId ? { seasonId } : undefined,
    include: {
      teacher1: { select: { id: true, name: true } },
      teacher2: { select: { id: true, name: true } },
      season: { select: { id: true, name: true } },
      allocations: {
        select: {
          id: true,
          branch: true,
          startModelNumber: true,
          endModelNumber: true,
        },
      },
      _count: { select: { students: true } },
    },
    orderBy: { createdAt: "desc" },
  });
}
