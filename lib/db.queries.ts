// ============================================================
// طبقة الاستعلامات المحسّنة
// استخدام select() و include() بذكاء مع Pagination
// لتقليل نقل البيانات وتسريع القوائم الكبيرة
// ============================================================
import { prisma } from "@/lib/prisma";
import { Role, StudentStatus, ExamSessionStatus } from "@prisma/client";

// حقل ترقيم الصفحات العام
export type Pagination = {
  page: number; // يبدأ من 1
  pageSize: number; // عدد العناصر في الصفحة
};

/** حساب skip من رقم الصفحة */
export function makeSkip(page: number, pageSize: number): number {
  const safePage = Math.max(1, page);
  return (safePage - 1) * pageSize;
}

// ------------------------------------------------------------
// الطلاب — قائمة مرقّمة بأعمدة محددة (لا نسترجع الحقول الثقيلة)
// ------------------------------------------------------------
export async function getStudentsPage({
  page = 1,
  pageSize = 20,
  institutionId,
  status,
}: Pagination & { institutionId?: string; status?: StudentStatus }) {
  const skip = makeSkip(page, pageSize);
  const where = {
    ...(institutionId ? { institutionId } : {}),
    ...(status ? { status } : {}),
  };

  const [students, total] = await Promise.all([
    prisma.student.findMany({
      where,
      select: {
        id: true,
        name: true,
        age: true,
        branch: true,
        status: true,
        createdAt: true,
        institution: { select: { name: true } },
      },
      take: pageSize,
      skip,
      orderBy: { createdAt: "desc" },
    }),
    prisma.student.count({ where }),
  ]);

  return {
    students,
    total,
    page,
    pageSize,
    totalPages: Math.ceil(total / pageSize),
  };
}

// ------------------------------------------------------------
// الجهات التعليمية — قائمة مرقّمة
// ------------------------------------------------------------
export async function getInstitutionsPage({
  page = 1,
  pageSize = 20,
}: Pagination) {
  const skip = makeSkip(page, pageSize);

  const [institutions, total] = await Promise.all([
    prisma.institution.findMany({
      select: {
        id: true,
        name: true,
        contactInfo: true,
        createdAt: true,
        _count: { select: { students: true, users: true } },
      },
      take: pageSize,
      skip,
      orderBy: { createdAt: "asc" },
    }),
    prisma.institution.count(),
  ]);

  return {
    institutions,
    total,
    page,
    pageSize,
    totalPages: Math.ceil(total / pageSize),
  };
}

// ------------------------------------------------------------
// المستخدمون — قائمة مرقّمة (بدون كلمة المرور إطلاقاً)
// ------------------------------------------------------------
export async function getUsersPage({ page = 1, pageSize = 20 }: Pagination) {
  const skip = makeSkip(page, pageSize);

  const [users, total] = await Promise.all([
    prisma.user.findMany({
      select: {
        id: true,
        name: true,
        email: true,
        role: true,
        birthDate: true,
        createdAt: true,
        institution: { select: { name: true } },
      },
      take: pageSize,
      skip,
      orderBy: { createdAt: "desc" },
    }),
    prisma.user.count(),
  ]);

  return { users, total, page, pageSize, totalPages: Math.ceil(total / pageSize) };
}

// ------------------------------------------------------------
// النماذج الاختبارية — قائمة مرقّمة
// ------------------------------------------------------------
export async function getExamModelsPage({
  page = 1,
  pageSize = 20,
  branch,
  institutionId,
}: Pagination & { branch?: string; institutionId?: string }) {
  const skip = makeSkip(page, pageSize);
  const where = {
    ...(branch ? { branch } : {}),
    ...(institutionId ? { institutionId } : {}),
  };

  const [models, total] = await Promise.all([
    prisma.examModel.findMany({
      where,
      select: {
        id: true,
        modelNumber: true,
        branch: true,
        institution: { select: { name: true } },
        season: { select: { name: true } },
      },
      take: pageSize,
      skip,
      orderBy: [{ branch: "asc" }, { modelNumber: "asc" }],
    }),
    prisma.examModel.count({ where }),
  ]);

  return { models, total, page, pageSize, totalPages: Math.ceil(total / pageSize) };
}

// ------------------------------------------------------------
// جلسات الاختبار — قائمة مرقّمة مع العلاقات الأساسية
// ------------------------------------------------------------
export async function getExamSessionsPage({
  page = 1,
  pageSize = 20,
  status,
}: Pagination & { status?: ExamSessionStatus }) {
  const skip = makeSkip(page, pageSize);
  const where = status ? { status } : {};

  const [sessions, total] = await Promise.all([
    prisma.examSession.findMany({
      where,
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
      take: pageSize,
      skip,
      orderBy: { examDate: "desc" },
    }),
    prisma.examSession.count({ where }),
  ]);

  return { sessions, total, page, pageSize, totalPages: Math.ceil(total / pageSize) };
}

// ------------------------------------------------------------
// مؤشرات سريعة للوحات (عدّادات خفيفة بدل استرجاع كل الصفوف)
// ------------------------------------------------------------
export async function getDashboardCounters() {
  const [students, institutions, sessions, approved, assigned, completed] =
    await Promise.all([
      prisma.student.count(),
      prisma.institution.count(),
      prisma.examSession.count(),
      prisma.student.count({ where: { status: StudentStatus.APPROVED } }),
      prisma.student.count({ where: { status: StudentStatus.ASSIGNED } }),
      prisma.student.count({ where: { status: StudentStatus.COMPLETED } }),
    ]);

  return { students, institutions, sessions, approved, assigned, completed };
}

/**
 * المعلمات المرتبطة بقائمة المعلمين المتاحين لتشكيل اللجان
 * (يعيد فقط ما يلزم للاختيار)
 */
export async function getExaminerOptions() {
  return prisma.user.findMany({
    where: { role: Role.EXAMINER },
    select: { id: true, name: true, birthDate: true },
    orderBy: { birthDate: "asc" },
  });
}