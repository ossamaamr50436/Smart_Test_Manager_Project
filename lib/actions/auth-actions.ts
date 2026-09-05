"use server";

import { auth, signIn, signOut } from "@/auth";
import { prisma } from "@/lib/prisma";
import { AuthError } from "next-auth";
import { Role, StudentStatus } from "@prisma/client";
import type { Prisma } from "@prisma/client";
import { redirect } from "next/navigation";

// ------------------------------------------------------------
// المصادقة
// ------------------------------------------------------------

/**
 * الدخول عبر Credentials من Server Action
 * تُستدعى من نموذج الدخول — عند فشل التحقق ترجع رسالة خطأ
 */
export async function loginAction(prevState: { error?: string }, formData: FormData) {
  try {
    await signIn("credentials", {
      email: formData.get("email") as string,
      password: formData.get("password") as string,
      redirectTo: "/dashboard",
    });
    return {};
  } catch (error) {
    if (error instanceof AuthError) {
      // رسالة موحّدة — لا نكشف تفاصيل الحساب
      return { error: "بيانات الدخول غير صحيحة" };
    }
    // إعادة رمي أخطاء الإعادة التوجيه حتى يعمل redirect داخلياً
    throw error;
  }
}

/** تسجيل الخروج */
export async function logoutAction() {
  await signOut({ redirectTo: "/login" });
}

// ------------------------------------------------------------
// تسكين المستخدم الحالي من الجلسة + قاعدة البيانات (عزل صلاحيات)
// ------------------------------------------------------------

/**
 * استخراج المستخدم الحالي من الجلسة والتحقق من وجوده في قاعدة البيانات
 * يرجع المستخدم بدون كلمة المرور
 */
export async function getCurrentUser() {
  const session = await auth();

  if (!session?.user?.id) {
    return null;
  }

  const user = await prisma.user.findUnique({
    where: { id: session.user.id },
    select: {
      id: true,
      name: true,
      email: true,
      role: true,
      birthDate: true,
      institutionId: true,
      createdAt: true,
    },
  });

  return user;
}

// ------------------------------------------------------------
// مثال تطبيقي: جلب الطلاب وفقاً لدور المستخدم (RBAC)
// ------------------------------------------------------------

type StudentForList = {
  id: string;
  name: string;
  age: number;
  branch: string;
  status: string;
};

/**
 * إرجاع الطلاب وفقاً لدور المستخدم مع ترقيم الصفحات:
 * - Institution: طلاب جهته فقط
 * - Examiner: طلاب لجنته فقط (teacher1Id أو teacher2Id)
 * - CertificateSource: الطلاب المكتملون فقط
 * - Admin / HeadOfAffairs / TestSpecialist: جميع الطلاب
 */
export async function getStudentsForCurrentUser(
  page = 1,
  pageSize = 20
): Promise<{ students: StudentForList[]; total: number; totalPages: number; page: number }> {
  const user = await getCurrentUser();

  if (!user) {
    redirect("/login");
  }

  const skip = (page - 1) * pageSize;

  switch (user.role) {
    case Role.INSTITUTION: {
      if (!user.institutionId) {
        return { students: [], total: 0, totalPages: 0, page };
      }
      // عزل: الجهة ترى فقط طلاب جهتها
      const [students, total] = await Promise.all([
        prisma.student.findMany({
          where: { institutionId: user.institutionId },
          select: { id: true, name: true, age: true, branch: true, status: true },
          orderBy: { createdAt: "desc" },
          skip,
          take: pageSize,
        }),
        prisma.student.count({ where: { institutionId: user.institutionId } }),
      ]);
      return { students, total, totalPages: Math.ceil(total / pageSize), page };
    }

    case Role.EXAMINER: {
      // عزل: المختبر يرى فقط طلاب لجانه (teacher1/teacher2) ذوي الحالة ASSIGNED
      const baseWhere: Prisma.ExamSessionWhereInput = {
        OR: [{ teacher1Id: user.id }, { teacher2Id: user.id }],
        student: { status: StudentStatus.ASSIGNED },
      };
      const [sessions, total] = await Promise.all([
        prisma.examSession.findMany({
          where: baseWhere,
          select: {
            student: {
              select: { id: true, name: true, age: true, branch: true, status: true },
            },
          },
          skip,
          take: pageSize,
        }),
        prisma.examSession.count({ where: baseWhere }),
      ]);
      return {
        students: sessions.map((s) => s.student),
        total,
        totalPages: Math.ceil(total / pageSize),
        page,
      };
    }

    case Role.CERTIFICATE_SOURCE: {
      // عزل: مصدر الشهادات يرى المكتملين فقط
      const where: Prisma.StudentWhereInput = { status: StudentStatus.COMPLETED };
      const [students, total] = await Promise.all([
        prisma.student.findMany({
          where,
          select: { id: true, name: true, age: true, branch: true, status: true },
          orderBy: { createdAt: "desc" },
          skip,
          take: pageSize,
        }),
        prisma.student.count({ where }),
      ]);
      return { students, total, totalPages: Math.ceil(total / pageSize), page };
    }

    case Role.ADMIN:
    case Role.HEAD_OF_AFFAIRS:
    case Role.TEST_SPECIALIST:
    default: {
      const [students, total] = await Promise.all([
        prisma.student.findMany({
          select: { id: true, name: true, age: true, branch: true, status: true },
          orderBy: { createdAt: "desc" },
          skip,
          take: pageSize,
        }),
        prisma.student.count(),
      ]);
      return { students, total, totalPages: Math.ceil(total / pageSize), page };
    }
  }
}