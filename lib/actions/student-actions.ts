"use server";

import { requireUser, requireRole, assertInstitutionOwnsStudent, getActorTenantId, requireTenantId } from "@/lib/security";
import { getTenantFilter, assertSameTenant } from "@/lib/tenancy";
import { prisma } from "@/lib/prisma";
import { Role, StudentStatus, NotificationType, AuditAction } from "@prisma/client";
import { revalidatePath } from "next/cache";
import { uniq, size } from "lodash";
import {
  studentApplicationSchema,
  committeeSchema,
  type StudentApplicationInput,
  type CommitteeInput,
  type ReviewDecision,
} from "@/lib/validations/student";
import { getCurrentSeason } from "./season-actions";
import { checkRateLimit } from "@/lib/rate-limit";
import { getPlatformSettings } from "./settings-actions";
import { uploadFile } from "@/lib/file-storage";
import { validateFileUpload } from "@/lib/upload-security";

/**
 * طھط³ط¬ظٹظ„ ط­ط¯ط« ظپظٹ Audit Log
 * (طھطھط¨ط¹ ط§ظ„ط´ظپط§ظپظٹط© â€” ظƒظ„ ظ‚ط±ط§ط± ظ…ظˆط«ظ‘ظ‚)
 */
async function recordAudit(userId: string, action: AuditAction, details: unknown) {
  const tenantId = await getActorTenantId(userId);
  await prisma.auditLog.create({
    data: {
      userId,
      action,
      details: JSON.stringify(details),
      tenantId,
    },
  });
}

export type CreateStudentApplicationResult =
  | { success: true; studentId: string }
  | { success: false; error: string };

/**
 * 1) طھط±ط´ظٹط­ ط·ط§ظ„ط¨ ط¬ط¯ظٹط¯ â€” ط®ط§طµ ط¨ط§ظ„ط¬ظ‡ط© ط§ظ„طھط¹ظ„ظٹظ…ظٹط©
 * - ظٹظ‚ط¨ظ„ ط§ظ„ط·ط§ظ„ط¨ طھظ„ظ‚ط§ط¦ظٹط§ظ‹ ط¨ط±ط¨ط· institutionId ط¨ط§ظ„ط¬ظ‡ط© ط§ظ„ظ…ط±طھط¨ط·ط© ط¨ط­ط³ط§ط¨ ط§ظ„ظ…ط³طھط®ط¯ظ…
 * - ط§ظ„ط­ط§ظ„ط© PENDING + ط¥ط´ط¹ط§ط± ظ„ط£ط®طµط§ط¦ظٹ ط§ظ„ط§ط®طھط¨ط§ط±ط§طھ
 * - ظٹط±ظپط¹ ظ†ظ…ظˆط°ط¬ ط§ظ„ط§ط®طھط¨ط§ط± ط§ظ„ظ…ظ…ط³ظˆط­ (PDF) ط¥ظ„ظ‰ ظ…ط¬ظ„ط¯ ط§ظ„ط¬ظ‡ط© ط¹ظ„ظ‰ Google Drive
 *   ط¹ظ†ط¯ طھظپط¹ظٹظ„ ط§ظ„ط¥ط¹ط¯ط§ط¯ ط§ظ„ط¹ط§ظ… requireStudentApplicationFile
 */
export async function createStudentApplication(
  input: StudentApplicationInput,
  applicationFile?: {
    buffer: ArrayBuffer;
    fileName: string;
    mimeType: string;
  }
): Promise<CreateStudentApplicationResult> {
  let user;
  try {
    user = await requireUser();

    // ط¹ط²ظ„ ط§ظ„طµظ„ط§ط­ظٹط§طھ: ط§ظ„ط¬ظ‡ط© ط§ظ„طھط¹ظ„ظٹظ…ظٹط© ظپظ‚ط·
    requireRole(user, [Role.INSTITUTION]);
  } catch {
    return { success: false, error: "ط؛ظٹط± ظ…طµط±ط­ â€” ظٹط¬ط¨ طھط³ط¬ظٹظ„ ط§ظ„ط¯ط®ظˆظ„ ط¨ط­ط³ط§ط¨ ط¬ظ‡ط© طھط¹ظ„ظٹظ…ظٹط©" };
  }
  if (!user.institutionId) {
    return { success: false, error: "ط­ط³ط§ط¨ ط§ظ„ط¬ظ‡ط© ط؛ظٹط± ظ…ط±طھط¨ط· ط¨ظ…ط¤ط³ط³ط© طھط¹ظ„ظٹظ…ظٹط©" };
  }

  // ظ…ظ†ط¹ ط¥ط³ط§ط،ط© ط§ظ„ط§ط³طھط®ط¯ط§ظ…: ط­ط¯ ط£ظ‚طµظ‰ 20 ط·ط§ظ„ط¨ ظ„ظƒظ„ ط¬ظ‡ط© ط®ظ„ط§ظ„ 15 ط¯ظ‚ظٹظ‚ط©
  try {
    await checkRateLimit(`student-create:${user.id}`, 20);
  } catch (e) {
    return {
      success: false,
      error: e instanceof Error ? e.message : "طھظ… طھط¬ط§ظˆط² ط­ط¯ ط§ظ„ط·ظ„ط¨ط§طھ ط§ظ„ظ…ط³ظ…ظˆط­طŒ ط­ط§ظˆظ„ ظ„ط§ط­ظ‚ط§ظ‹",
    };
  }

  // ط§ظ„طھط­ظ‚ظ‚ ظ…ظ† طµط­ط© ط§ظ„ط¨ظٹط§ظ†ط§طھ
  const parsed = studentApplicationSchema.safeParse(input);
  if (!parsed.success) {
    return { success: false, error: parsed.error.issues[0]?.message ?? "ط¨ظٹط§ظ†ط§طھ ط؛ظٹط± طµط­ظٹط­ط©" };
  }
  const data = parsed.data;

  // ط¥ط¹ط¯ط§ط¯ط§طھ ط§ظ„ظ…ظ†طµط©: ظ‡ظ„ ط±ظپط¹ ظ†ظ…ظˆط°ط¬ ط§ط®طھط¨ط§ط± ط§ظ„ط·ط§ظ„ط¨ ط¥ط¬ط¨ط§ط±ظٹطں
  let settings;
  try {
    settings = await getPlatformSettings();
  } catch {
    return { success: false, error: "طھط¹ط°ط± طھط­ظ…ظٹظ„ ط¥ط¹ط¯ط§ط¯ط§طھ ط§ظ„ظ…ظ†طµط© â€” ط­ط§ظˆظ„ ظ…ط±ط© ط£ط®ط±ظ‰" };
  }
  const requireFile = settings.requireStudentApplicationFile;

  let applicationFileId: string | null = null;
  let applicationFileUrl: string | null = null;

  if (requireFile || applicationFile) {
    if (!applicationFile) {
      return { success: false, error: "ظٹط¬ط¨ ط±ظپط¹ ظ†ظ…ظˆط°ط¬ ط§ط®طھط¨ط§ط± ط§ظ„ط·ط§ظ„ط¨ (PDF) ظ„ط¥ظƒظ…ط§ظ„ ط§ظ„طھط±ط´ظٹط­" };
    }

    // ط§ظ„طھط­ظ‚ظ‚ ظ…ظ† ط£ظ† ط§ظ„ظ…ظ„ظپ PDF ظپط¹ظ„ظٹط§ظ‹ ظˆط¨ط­ط¯ ط£ظ‚طµظ‰ ظ„ظ„ط­ط¬ظ… (OWASP â€” ظ…ظ†ط¹ DoS)
    const buffer = Buffer.from(applicationFile.buffer);
    try {
      validateFileUpload(buffer, applicationFile.mimeType, applicationFile.fileName, {
        maxBytes: 20 * 1024 * 1024,
        allowedMimes: ["application/pdf"],
      });
    } catch {
      return { success: false, error: "ظ†ظ…ظˆط°ط¬ ط§ظ„ط§ط®طھط¨ط§ط± ظٹط¬ط¨ ط£ظ† ظٹظƒظˆظ† ظ…ظ„ظپ PDF (ط§ظ„ط­ط¯ ط§ظ„ط£ظ‚طµظ‰ 20MB)" };
    }

    // ظ…ط¬ظ„ط¯ ط®ط§طµ ط¨ط§ظ„ط¬ظ‡ط© ط¯ط§ط®ظ„ ظ…ط¬ظ„ط¯ ط§ظ„ط¬ط°ط± (ظٹظڈظ†ط´ط£ ط¹ظ†ط¯ ط§ظ„ط­ط§ط¬ط©)
    let institution;
    try {
      institution = await prisma.institution.findUnique({
        where: { id: user.institutionId },
        select: { name: true },
      });
    } catch {
      return { success: false, error: "طھط¹ط°ط± ظ‚ط±ط§ط،ط© ط¨ظٹط§ظ†ط§طھ ط§ظ„ط¬ظ‡ط© â€” ط­ط§ظˆظ„ ظ…ط±ط© ط£ط®ط±ظ‰" };
    }
    if (!institution) {
      return { success: false, error: "ط§ظ„ط¬ظ‡ط© ط§ظ„طھط¹ظ„ظٹظ…ظٹط© ط؛ظٹط± ظ…ظˆط¬ظˆط¯ط©" };
    }

    try {
      const uploaded = await uploadFile(
        buffer,
        `ظ†ظ…ظˆط°ط¬ ط§ط®طھط¨ط§ط± ط§ظ„ط·ط§ظ„ط¨ (${data.name}).pdf`,
        "application/pdf");
      applicationFileId = uploaded.fileId;
      applicationFileUrl = uploaded.webViewLink;
    } catch (error) {
      return {
        success: false,
        error:
          error instanceof Error
            ? error.message
            : "طھط¹ط°ط± ط±ظپط¹ ظ†ظ…ظˆط°ط¬ ط§ظ„ط§ط®طھط¨ط§ط± ط¹ظ„ظ‰ Google Drive â€” ط­ط§ظˆظ„ ظ…ط±ط© ط£ط®ط±ظ‰",
      };
    }
  }

  let student;
  try {
    student = await prisma.student.create({
      data: {
        name: data.name,
        age: data.age,
        branch: data.branch,
        nationality: data.nationality,
        teacherName: data.teacherName,
        parentPhone: data.parentPhone,
        address: data.address ?? null,
        phone: data.phone ?? null,
        status: StudentStatus.PENDING,
        institutionId: user.institutionId,
        applicationFileId,
        applicationFileUrl,
        tenantId: requireTenantId(user),
      },
    });
  } catch {
    return { success: false, error: "ط­ط¯ط« ط®ط·ط£ ط؛ظٹط± ظ…طھظˆظ‚ط¹ ط£ط«ظ†ط§ط، ط­ظپط¸ ط§ظ„ط·ظ„ط¨ â€” ط£ط¹ط¯ ط§ظ„ظ…ط­ط§ظˆظ„ط©" };
  }

  // ط¥ط´ط¹ط§ط± ط¨ط§ظ„ط£ط®طµط§ط¦ظٹ (ظ‚ط¯ ظٹظƒظˆظ† ط£ظƒط«ط± ظ…ظ† ط£ط®طµط§ط¦ظٹ) â€” ظپط´ظ„ ط§ظ„ط¥ط´ط¹ط§ط± ظ„ط§ ظٹظ…ظ†ط¹ ط­ظپط¸ ط§ظ„ط·ظ„ط¨
  try {
    const specialists = await prisma.user.findMany({
      where: { ...getTenantFilter(user), role: Role.TEST_SPECIALIST },
      select: { id: true },
    });

    if (size(specialists) > 0) {
      await prisma.notification.createMany({
        data: specialists.map((s) => ({
          userId: s.id,
          message: `ط·ظ„ط¨ طھط±ط´ظٹط­ ط¬ط¯ظٹط¯ ظ„ظ„ط·ط§ظ„ط¨ آ«${student.name}آ» ط¨ط§ظ†طھط¸ط§ط± ط§ظ„ظ…ط±ط§ط¬ط¹ط©`,
          type: NotificationType.RECRUITMENT,
          tenantId: requireTenantId(user),
        })),
      });
    }
  } catch {
    // ط؛ظٹط± ط­ط§ط³ظ… â€” ط§ظ„ط·ظ„ط¨ ظ…ط­ظپظˆط¸ ط¨ط§ظ„ظپط¹ظ„
  }

  try {
    await recordAudit(user.id, AuditAction.CREATE, {
      entity: "Student",
      studentId: student.id,
      name: student.name,
    });
  } catch {
    // ظپط´ظ„ ط³ط¬ظ„ ط§ظ„طھط¯ظ‚ظٹظ‚ ظ„ط§ ظٹظ…ظ†ط¹ ط§ظ„ظ†ط¬ط§ط­
  }

  revalidatePath("/test-specialist/requests");

  return { success: true, studentId: student.id };
}

/**
 * 2) ظ…ط±ط§ط¬ط¹ط© ط·ظ„ط¨ ط§ظ„طھط±ط´ظٹط­ (ظ‚ط¨ظˆظ„/ط±ظپط¶) â€” ط®ط§طµ ط¨ط£ط®طµط§ط¦ظٹ ط§ظ„ط§ط®طھط¨ط§ط±ط§طھ
 * - طھط­ط¯ط« ط­ط§ظ„ط© ط§ظ„ط·ط§ظ„ط¨ + ط¥ط´ط¹ط§ط± ظ„ظ„ط¬ظ‡ط© ط¨ط§ظ„ظ†طھظٹط¬ط©
 */
export async function reviewStudentApplication(studentId: string, decision: ReviewDecision) {
  const user = await requireUser();

  // ط¹ط²ظ„ ط§ظ„طµظ„ط§ط­ظٹط§طھ: ط§ظ„ط£ط®طµط§ط¦ظٹ ط£ظˆ ط§ظ„ظ…ط³ط¤ظˆظ„ (ط§ظ„ظ…ظ‡ظ…ط© C)
  requireRole(user, [Role.TEST_SPECIALIST, Role.ADMIN]);

  const student = await prisma.student.findUnique({
    where: { id: studentId },
    select: { id: true, name: true, institutionId: true, status: true, tenantId: true },
  });

  if (!student) {
    throw new Error("ط§ظ„ط·ط§ظ„ط¨ ط؛ظٹط± ظ…ظˆط¬ظˆط¯");
  }
  assertSameTenant(user, student);

  // ظ…ظ†ط¹ ظ…ط±ط§ط¬ط¹ط© ط·ط§ظ„ط¨ طھظ… ظ…ط±ط§ط¬ط¹طھظ‡ ظ…ط³ط¨ظ‚ط§ظ‹ (ظٹط¬ط¨ ط£ظ† ظٹظƒظˆظ† ط¨ط­ط§ظ„ط© PENDING ظپظ‚ط·)
  if (student.status !== StudentStatus.PENDING) {
    throw new Error("ظ„ط§ ظٹظ…ظƒظ† ظ…ط±ط§ط¬ط¹ط© ط·ظ„ط¨ طھظ… ظ…ط¹ط§ظ„ط¬طھظ‡ ظ…ط³ط¨ظ‚ط§ظ‹");
  }

  // ظ†طµ ط§ظ„ط³ط¨ط¨ ط§ظ„ط«ط§ط¨طھ (ط­ط§ظ„ظٹط§ظ‹)
  const reason =
    decision === "APPROVED"
      ? "طھظ… ظ‚ط¨ظˆظ„ ط§ظ„طھط±ط´ظٹط­ ظ…ظ† ظ‚ط¨ظ„ ط£ط®طµط§ط¦ظٹ ط§ظ„ط§ط®طھط¨ط§ط±ط§طھ"
      : "طھظ… ط±ظپط¶ ط§ظ„طھط±ط´ظٹط­ ظ„ط¹ط¯ظ… ط§ظƒطھظ…ط§ظ„ ط§ظ„ط¨ظٹط§ظ†ط§طھ ط§ظ„ظ…ط·ظ„ظˆط¨ط©";

  const status = decision === "APPROVED" ? StudentStatus.APPROVED : StudentStatus.REJECTED;

  await prisma.student.update({
    where: { id: studentId },
    data: {
      status,
      approvedAt: decision === "APPROVED" ? new Date() : undefined,
    },
  });

  // ط¥ط´ط¹ط§ط± ط§ظ„ط¬ظ‡ط© ط¨ط§ظ„ظ†طھظٹط¬ط©
  const institutionUsers = await prisma.user.findMany({
    where: { role: Role.INSTITUTION, institutionId: student.institutionId },
    select: { id: true },
  });

  if (institutionUsers.length > 0) {
    await prisma.notification.createMany({
      data: institutionUsers.map((u) => ({
        userId: u.id,
        message:
          decision === "APPROVED"
            ? `طھظ… ظ‚ط¨ظˆظ„ طھط±ط´ظٹط­ ط§ظ„ط·ط§ظ„ط¨ آ«${student.name}آ»`
            : `طھظ… ط±ظپط¶ طھط±ط´ظٹط­ ط§ظ„ط·ط§ظ„ط¨ آ«${student.name}آ». ط§ظ„ط³ط¨ط¨: ${reason}`,
        type: NotificationType.APPROVAL,
        tenantId: requireTenantId(user),
      })),
    });
  }

  await recordAudit(user.id, AuditAction.APPROVE, {
    studentId,
    decision,
    reason,
  });

  revalidatePath("/test-specialist/requests");
  revalidatePath("/test-specialist/committees");

  return { success: true, status };
}

/**
 * 3) طھط´ظƒظٹظ„ ظ„ط¬ظ†ط© (ط¬ظ„ط³ط© ط§ط®طھط¨ط§ط±) ظˆطھظˆط²ظٹط¹ ط§ظ„ط·ط§ظ„ط¨ â€” ط®ط§طµ ط¨ط£ط®طµط§ط¦ظٹ ط§ظ„ط§ط®طھط¨ط§ط±ط§طھ
 * - ظٹظ†ط´ط¦ ExamSession + طھط؛ظٹظٹط± ط­ط§ظ„ط© ط§ظ„ط·ط§ظ„ط¨ ط¥ظ„ظ‰ ASSIGNED + ط¥ط´ط¹ط§ط±ط§طھ ظ„ظ„ظ…ط¹ظ„ظ…ظٹظ† ظˆط§ظ„ط¬ظ‡ط©
 */
export async function assignCommittee(input: CommitteeInput) {
  const user = await requireUser();

  // ط¹ط²ظ„ ط§ظ„طµظ„ط§ط­ظٹط§طھ: ط§ظ„ط£ط®طµط§ط¦ظٹ ط£ظˆ ط§ظ„ظ…ط³ط¤ظˆظ„ (ط§ظ„ظ…ظ‡ظ…ط© C)
  requireRole(user, [Role.TEST_SPECIALIST, Role.ADMIN]);

  const parsed = committeeSchema.safeParse(input);
  if (!parsed.success) {
    throw new Error(parsed.error.issues[0]?.message ?? "ط¨ظٹط§ظ†ط§طھ ط؛ظٹط± طµط­ظٹط­ط©");
  }
  const data = parsed.data;

  if (data.teacher1Id === data.teacher2Id) {
    throw new Error("ظ„ط§ ظٹظ…ظƒظ† ط§ط®طھظٹط§ط± ط§ظ„ظ…ط®طھط¨ط± ظ†ظپط³ظ‡ ظپظٹ ط§ظ„ظ…ط®طھط¨ط±ظٹظ† ط§ظ„ط£ظˆظ„ ظˆط§ظ„ط«ط§ظ†ظٹ");
  }

  // ط§ظ„طھط­ظ‚ظ‚ ظ…ظ† ط£ظ† ط§ظ„ظ…ط®طھط¨ط±ظٹظ† ظ…ظˆط¬ظˆط¯ط§ظ†
  const teachers = await prisma.user.findMany({
    where: { ...getTenantFilter(user), id: { in: [data.teacher1Id, data.teacher2Id] } },
    select: { id: true, role: true },
  });

  if (teachers.length !== 2) {
    throw new Error("ط£ط­ط¯ ط§ظ„ظ…ط®طھط¨ط±ظٹظ† ط؛ظٹط± ظ…ظˆط¬ظˆط¯");
  }

  for (const t of teachers) {
    if (t.role !== Role.EXAMINER) {
      throw new Error("ظٹط¬ط¨ ط£ظ† ظٹظƒظˆظ† ظƒظ„ ظ…ظ† ط§ظ„ظ…ط®طھط¨ط±ظٹظ† ط¨ط¯ظˆط± EXAMINER");
    }
  }

  const student = await prisma.student.findUnique({
    where: { id: data.studentId },
    select: { id: true, name: true, status: true, institutionId: true, tenantId: true },
  });

  if (!student) {
    throw new Error("ط§ظ„ط·ط§ظ„ط¨ ط؛ظٹط± ظ…ظˆط¬ظˆط¯");
  }
  assertSameTenant(user, student);
  if (student.status !== StudentStatus.APPROVED) {
    throw new Error("ظٹط¬ط¨ ط£ظ† ظٹظƒظˆظ† ط§ظ„ط·ط§ظ„ط¨ ط¨ط­ط§ظ„ط© APPROVED ظ‚ط¨ظ„ طھظˆط²ظٹط¹ظ‡ ط¹ظ„ظ‰ ظ„ط¬ظ†ط©");
  }

  const examDate = new Date(data.examDate);
  if (Number.isNaN(examDate.getTime())) {
    throw new Error("طھط§ط±ظٹط® ط§ظ„ط§ط®طھط¨ط§ط± ط؛ظٹط± طµط­ظٹط­");
  }

  // ط§ظ„طھط­ظ‚ظ‚ ط£ظ† طھط§ط±ظٹط® ط§ظ„ط§ط®طھط¨ط§ط± ظپظٹ ط§ظ„ظ…ط³طھظ‚ط¨ظ„
  const now = new Date();
  if (examDate <= now) {
    throw new Error("طھط§ط±ظٹط® ط§ظ„ط§ط®طھط¨ط§ط± ظٹط¬ط¨ ط£ظ† ظٹظƒظˆظ† ظپظٹ ط§ظ„ظ…ط³طھظ‚ط¨ظ„");
  }

  // ط§ظ„طھط­ظ‚ظ‚ ظ…ظ† ط¹ط¯ظ… طھط¶ط§ط±ط¨ ظ…ظˆط§ط¹ظٹط¯ ط§ظ„ظ…ط®طھط¨ط±ظٹظ† (ظ†ظپط³ ط§ظ„ظ…ط®طھط¨ط± ظپظٹ ظ„ط¬ظ†طھظٹظ† ط¨ظ†ظپط³ ط§ظ„ظˆظ‚طھ)
  const conflicting = await prisma.examSession.findFirst({
    where: {
      ...getTenantFilter(user),
      examDate,
      OR: [
        { teacher1Id: data.teacher1Id },
        { teacher2Id: data.teacher1Id },
        { teacher1Id: data.teacher2Id },
        { teacher2Id: data.teacher2Id },
      ],
    },
  });
  if (conflicting) {
    throw new Error("طھط¶ط§ط±ط¨ ظپظٹ ظ…ظˆط§ط¹ظٹط¯ ط£ط­ط¯ ط§ظ„ظ…ط®طھط¨ط±ظٹظ† ظپظٹ ظ†ظپط³ ط§ظ„طھط§ط±ظٹط®");
  }

  // ط§ظ„ظ…ظˆط³ظ… ط§ظ„ظ†ط´ط· ط§ظ„ط­ط§ظ„ظٹ (ط§ظ„ظ…ط§ط¯ط© 6)
  const season = await getCurrentSeason();
  if (!season) {
    throw new Error("ظ„ط§ ظٹظˆط¬ط¯ ظ…ظˆط³ظ… ط§ط®طھط¨ط§ط±ط§طھ ظ†ط´ط· ط­ط§ظ„ظٹط§ظ‹ â€” ظٹط¬ط¨ طھظپط¹ظٹظ„ ظ…ظˆط³ظ… ط£ظˆظ„ط§ظ‹");
  }
  const seasonId = season.id;

  // ظ…ظ†ط¹ ط§ظ„طھظˆط²ظٹط¹ ط§ظ„ظ…ط²ط¯ظˆط¬ ظ„ظ†ظپط³ ط§ظ„ط·ط§ظ„ط¨ (ط­ظ…ط§ظٹط© ط°ط±ظ‘ظٹط© ط¶ط¯ Race Condition)
  // ظ†ط³طھط®ط¯ظ… updateMany ط¨ط´ط±ط· ط§ظ„ط­ط§ظ„ط© APPROVED ط¯ط§ط®ظ„ ظ…ط¹ط§ظ…ظ„ط© â€” ط¥ظ† ظ„ظ… ظٹط­ط¯ظ‘ط« ط£ظٹ طµظپ
  // ظپظ‡ط°ط§ ظٹط¹ظ†ظٹ ط£ظ† ط§ظ„ط·ط§ظ„ط¨ ظ„ظ… ظٹط¹ط¯ APPROVED (ظ…ظڈظˆط²ظ‘ط¹ ط£ظˆ ط؛ظٹظ‘ط±طھ ط­ط§ظ„طھظ‡) â†’ ظ†ط±ظپط¶.
  const session = await prisma.$transaction(async (tx) => {
    const updated = await tx.student.updateMany({
      where: { id: data.studentId, status: StudentStatus.APPROVED },
      data: { status: StudentStatus.ASSIGNED, assignedAt: new Date() },
    });

    if (updated.count !== 1) {
      throw new Error("طھط¹ط°ط± طھظˆط²ظٹط¹ ط§ظ„ط·ط§ظ„ط¨: ظٹط¬ط¨ ط£ظ† ظٹظƒظˆظ† ط¨ط­ط§ظ„ط© APPROVED ظˆظ„ظ… ظٹظڈظˆط²ظژظ‘ط¹ ظ…ط³ط¨ظ‚ط§ظ‹");
    }

    return tx.examSession.create({
      data: {
        studentId: data.studentId,
        teacher1Id: data.teacher1Id,
        teacher2Id: data.teacher2Id,
        examDate,
        period: data.period,
        status: "SCHEDULED",
        seasonId,
        tenantId: requireTenantId(user),
      },
    });
  });

  // ط¥ط´ط¹ط§ط±ط§طھ ظ„ظ„ظ…ط¹ظ„ظ…ظٹظ† ظˆط§ظ„ط¬ظ‡ط©
  const institutionUsers = await prisma.user.findMany({
    where: { role: Role.INSTITUTION, institutionId: student.institutionId },
    select: { id: true },
  });

  const recipients = [
    data.teacher1Id,
    data.teacher2Id,
    ...institutionUsers.map((u) => u.id),
  ];

  const message =
    `طھظ… طھط­ط¯ظٹط¯ ط¬ظ„ط³ط© ط§ط®طھط¨ط§ط± ظ„ظ„ط·ط§ظ„ط¨ آ«${student.name}آ» ط¨طھط§ط±ظٹط® ${examDate.toLocaleDateString(
      "ar-SA"
    )} â€” ط§ظ„ظپطھط±ط© ${data.period}`;

  await prisma.notification.createMany({
    data: uniq(recipients).map((userId) => ({
      userId,
      message,
      type: NotificationType.SCHEDULE,
      examSessionId: session.id,
      tenantId: requireTenantId(user),
    })),
  });

  await recordAudit(user.id, AuditAction.CREATE, {
    entity: "ExamSession",
    sessionId: session.id,
    studentId: data.studentId,
    teacher1Id: data.teacher1Id,
    teacher2Id: data.teacher2Id,
    examDate: data.examDate,
    seasonId,
  });

  revalidatePath("/test-specialist/committees");
  revalidatePath("/test-specialist/requests");
  revalidatePath("/examiner");

  return { success: true, sessionId: session.id };
}

/**
 * طھط±ط´ظٹط­ ط·ط§ظ„ط¨ ظ…ظ† ظ‚ط¨ظ„ ط£ط®طµط§ط¦ظٹ ط§ظ„ط§ط®طھط¨ط§ط±ط§طھ â€” ظٹط®طھط§ط± ط§ظ„ط¬ظ‡ط© ط§ظ„ظ…ط±ط¬ط¹ظٹط©
 * ط§ظ„ط­ط§ظ„ط© طھط¨ط¯ط£ PENDING ط«ظ… طھظڈط¹طھظ…ط¯ ظ…ط¨ط§ط´ط±ط© (ط§ظ„ط£ط®طµط§ط¦ظٹ ظ‡ظˆ ط§ظ„ظ…ظڈط±ط§ط¬ط¹ ط§ظ„ط£طµظ„ظٹ)
 */
export async function createStudentApplicationBySpecialist(
  input: StudentApplicationInput & { institutionId: string },
  applicationFile?: {
    buffer: ArrayBuffer;
    fileName: string;
    mimeType: string;
  }
): Promise<CreateStudentApplicationResult> {
  let user;
  try {
    user = await requireUser();
    requireRole(user, [Role.TEST_SPECIALIST, Role.ADMIN]);
  } catch {
    return { success: false, error: "ط؛ظٹط± ظ…طµط±ط­ â€” ظٹط¬ط¨ ط£ظ† طھظƒظˆظ† ط£ط®طµط§ط¦ظٹ ط§ط®طھط¨ط§ط±ط§طھ ط£ظˆ ط£ط¯ظ…ظ†" };
  }

  try {
    await checkRateLimit(`specialist-nominate:${user.id}`, 20);
  } catch (e) {
    return {
      success: false,
      error: e instanceof Error ? e.message : "طھظ… طھط¬ط§ظˆط² ط­ط¯ ط§ظ„ط·ظ„ط¨ط§طھ ط§ظ„ظ…ط³ظ…ظˆط­طŒ ط­ط§ظˆظ„ ظ„ط§ط­ظ‚ط§ظ‹",
    };
  }

  const parsed = studentApplicationSchema.safeParse(input);
  if (!parsed.success) {
    return { success: false, error: parsed.error.issues[0]?.message ?? "ط¨ظٹط§ظ†ط§طھ ط؛ظٹط± طµط­ظٹط­ط©" };
  }
  const data = parsed.data;

  if (!input.institutionId) {
    return { success: false, error: "ط§ط®طھط± ط§ظ„ط¬ظ‡ط© ط§ظ„طھط¹ظ„ظٹظ…ظٹط©" };
  }

  const institution = await prisma.institution.findUnique({
    where: { id: input.institutionId },
    select: { id: true, name: true, tenantId: true },
  });
  if (!institution || institution.tenantId !== requireTenantId(user)) {
    return { success: false, error: "ط§ظ„ط¬ظ‡ط© ط§ظ„طھط¹ظ„ظٹظ…ظٹط© ط؛ظٹط± ظ…ظˆط¬ظˆط¯ط© ط£ظˆ ظ„ط§ طھظ†طھظ…ظٹ ظ„ظ…ط¤ط³ط³طھظƒ" };
  }

  const settings = await getPlatformSettings();
  const requireFile = settings.requireStudentApplicationFile;

  let applicationFileId: string | null = null;
  let applicationFileUrl: string | null = null;

  if (requireFile || applicationFile) {
    if (!applicationFile) {
      return { success: false, error: "ظٹط¬ط¨ ط±ظپط¹ ظ†ظ…ظˆط°ط¬ ط§ط®طھط¨ط§ط± ط§ظ„ط·ط§ظ„ط¨ (PDF) ظ„ط¥ظƒظ…ط§ظ„ ط§ظ„طھط±ط´ظٹط­" };
    }
    const buffer = Buffer.from(applicationFile.buffer);
    try {
      validateFileUpload(buffer, applicationFile.mimeType, applicationFile.fileName, {
        maxBytes: 20 * 1024 * 1024,
        allowedMimes: ["application/pdf"],
      });
    } catch {
      return { success: false, error: "ظ†ظ…ظˆط°ط¬ ط§ظ„ط§ط®طھط¨ط§ط± ظٹط¬ط¨ ط£ظ† ظٹظƒظˆظ† ظ…ظ„ظپ PDF (ط§ظ„ط­ط¯ ط§ظ„ط£ظ‚طµظ‰ 20MB)" };
    }
    try {
      const uploaded = await uploadFile(
        buffer,
        `ظ†ظ…ظˆط°ط¬ ط§ط®طھط¨ط§ط± ط§ظ„ط·ط§ظ„ط¨ (${data.name}).pdf`,
        "application/pdf");
      applicationFileId = uploaded.fileId;
      applicationFileUrl = uploaded.webViewLink;
    } catch (error) {
      return {
        success: false,
        error:
          error instanceof Error
            ? error.message
            : "طھط¹ط°ط± ط±ظپط¹ ظ†ظ…ظˆط°ط¬ ط§ظ„ط§ط®طھط¨ط§ط± ط¹ظ„ظ‰ Google Drive â€” ط­ط§ظˆظ„ ظ…ط±ط© ط£ط®ط±ظ‰",
      };
    }
  }

  let student;
  try {
    student = await prisma.$transaction(async (tx) => {
      const created = await tx.student.create({
        data: {
          name: data.name,
          age: data.age,
          branch: data.branch,
          nationality: data.nationality,
          teacherName: data.teacherName,
          parentPhone: data.parentPhone,
          address: data.address ?? null,
          phone: data.phone ?? null,
          status: StudentStatus.APPROVED,
          approvedAt: new Date(),
          institutionId: input.institutionId,
          submittedById: user.id,
          applicationFileId,
          applicationFileUrl,
          tenantId: requireTenantId(user),
        },
      });
      return created;
    });
  } catch {
    return { success: false, error: "ط­ط¯ط« ط®ط·ط£ ط؛ظٹط± ظ…طھظˆظ‚ط¹ ط£ط«ظ†ط§ط، ط­ظپط¸ ط§ظ„ط·ظ„ط¨ â€” ط£ط¹ط¯ ط§ظ„ظ…ط­ط§ظˆظ„ط©" };
  }

  try {
    const institutionUsers = await prisma.user.findMany({
      where: { role: Role.INSTITUTION, institutionId: input.institutionId },
      select: { id: true },
    });
    if (size(institutionUsers) > 0) {
      await prisma.notification.createMany({
        data: institutionUsers.map((u) => ({
          userId: u.id,
          message: `طھظ… طھط±ط´ظٹط­ ط§ظ„ط·ط§ظ„ط¨ آ«${student.name}آ» ظ…ظ† ظ‚ط¨ظ„ ط£ط®طµط§ط¦ظٹ ط§ظ„ط§ط®طھط¨ط§ط±ط§طھ â€” ط¬ط§ظ‡ط² ظ„ظ„طھظˆط²ظٹط¹ ط¹ظ„ظ‰ ظ„ط¬ظ†ط©`,
          type: NotificationType.RECRUITMENT,
          tenantId: requireTenantId(user),
        })),
      });
    }
  } catch {
    // ط؛ظٹط± ط­ط§ط³ظ…
  }

  try {
    await recordAudit(user.id, AuditAction.CREATE, {
      entity: "Student",
      studentId: student.id,
      name: student.name,
      source: "specialist_nomination",
      institutionId: input.institutionId,
    });
  } catch {
    // ظپط´ظ„ ط³ط¬ظ„ ط§ظ„طھط¯ظ‚ظٹظ‚ ظ„ط§ ظٹظ…ظ†ط¹ ط§ظ„ظ†ط¬ط§ط­
  }

  revalidatePath("/test-specialist/requests");
  revalidatePath("/test-specialist/committees");
  revalidatePath("/institution");
  revalidatePath("/admin/students");

  return { success: true, studentId: student.id };
}
