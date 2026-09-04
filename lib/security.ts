import { prisma } from "@/lib/prisma";
import { Role } from "@prisma/client";
import { getCurrentUser } from "@/lib/actions/auth-actions";

// ============================================================
// طبقة الأمان (المادة 8 — عزل الصلاحيات + OWASP Broken Access Control)
// توحّد كل عمليات التحقق من الصلاحيات على مستوى الدور والكيان
// ============================================================

export type SessionUser = NonNullable<Awaited<ReturnType<typeof getCurrentUser>>>;

/**
 * يرفض الطلب إن لم يكن المستخدم مسجلاً للدخول.
 * يُستخدم في كل Server Action قبل أي إجراء.
 */
export async function requireUser(): Promise<SessionUser> {
  const user = await getCurrentUser();
  if (!user) {
    throw new Error("غير مصرح: يجب تسجيل الدخول أولاً");
  }
  return user;
}

/**
 * يرفض الطلب إن لم يكن دور المستخدم ضمن الأدوار المسموحة.
 * @example await requireRole(user, [Role.INSTITUTION])
 */
export function requireRole(user: SessionUser, roles: Role[]) {
  if (!roles.includes(user.role)) {
    throw new Error("غير مصرح: لا تملك صلاحية تنفيذ هذا الإجراء");
  }
}

/**
 * التحقق من صلاحية الجهة التعليمية على طالب معيّن
 * (المادة 8/1): الجهة ترى طلاب جهتها فقط.
 */
export async function assertInstitutionOwnsStudent(user: SessionUser, studentId: string) {
  if (user.role !== Role.INSTITUTION) return;

  const student = await prisma.student.findUnique({
    where: { id: studentId },
    select: { institutionId: true },
  });
  if (!student) {
    throw new Error("الطالب غير موجود");
  }
  if (student.institutionId !== user.institutionId) {
    throw new Error("غير مصرح: هذا الطالب ليس من جهتك التعليمية");
  }
}

/**
 * التحقق من أن المختبر (المعلم) جزء من لجنة/جلسة معيّنة
 * (المادة 8/2): لا يستطيع تعديل تقييم طالب ليس في لجنته.
 * يرجع الجلسة إن وُجدت وإلا يرمي خطأ صلاحيات.
 */
export async function assertExaminerInSession(user: SessionUser, examSessionId: string) {
  const session = await prisma.examSession.findFirst({
    where: {
      id: examSessionId,
      OR: [{ teacher1Id: user.id }, { teacher2Id: user.id }],
    },
    select: {
      id: true,
      teacher1Id: true,
      teacher2Id: true,
      student: { select: { id: true, name: true, institutionId: true } },
    },
  });
  if (!session) {
    throw new Error("غير مصرح: هذا الطالب ليس ضمن لجنتك");
  }
  return session;
}

/**
 * التحقق من صلاحية الوصول إلى بيانات طالب حسب الدور:
 * - Institution: طلاب جهتها فقط
 * - Examiner: الطلاب الموزعون على لجانه فقط
 * - بقية الأدوار الإدارية: صلاحية كاملة
 * يرجع الطالب مع الجهة (لمزيد من الفحص) أو يرمي خطأ.
 */
export async function assertCanAccessStudent(user: SessionUser, studentId: string) {
  const student = await prisma.student.findUnique({
    where: { id: studentId },
    select: {
      id: true,
      name: true,
      status: true,
      institutionId: true,
      institution: { select: { name: true } },
    },
  });
  if (!student) {
    throw new Error("الطالب غير موجود");
  }

  if (user.role === Role.INSTITUTION) {
    if (student.institutionId !== user.institutionId) {
      throw new Error("غير مصرح: هذا الطالب ليس من جهتك التعليمية");
    }
  }

  if (user.role === Role.EXAMINER) {
    const belongsToUser = await prisma.examSession.findFirst({
      where: {
        studentId,
        OR: [{ teacher1Id: user.id }, { teacher2Id: user.id }],
      },
      select: { id: true },
    });
    if (!belongsToUser) {
      throw new Error("غير مصرح: هذا الطالب ليس ضمن لجانك");
    }
  }

  return student;
}