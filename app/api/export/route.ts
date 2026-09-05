import { NextResponse } from "next/server";
import { requireUser, requireRole } from "@/lib/security";
import { prisma } from "@/lib/prisma";
import { Role, StudentStatus } from "@prisma/client";
import type { Prisma } from "@prisma/client";

/**
 * تصدير بيانات الطلاب كملف CSV
 * عزل الصلاحيات: الأدوار الإدارية فقط (المادة 8).
 */
export async function GET() {
  try {
    const user = await requireUser();
    requireRole(user, [
      Role.ADMIN,
      Role.HEAD_OF_AFFAIRS,
      Role.TEST_SPECIALIST,
      Role.CERTIFICATE_SOURCE,
    ]);

    // حسب الدور نحدد نطاق الطلاب
    const where: Prisma.StudentWhereInput =
      user.role === Role.CERTIFICATE_SOURCE
        ? { status: StudentStatus.COMPLETED }
        : user.institutionId
          ? { institutionId: user.institutionId }
          : {};

    const students = await prisma.student.findMany({
      where,
      select: {
        name: true,
        age: true,
        branch: true,
        teacherName: true,
        parentPhone: true,
        address: true,
        phone: true,
        status: true,
      },
      orderBy: { createdAt: "desc" },
    });

    const escape = (v: unknown) => {
      const s = String(v ?? "");
      return /[",\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
    };

    const header = [
      "name",
      "age",
      "branch",
      "teacherName",
      "parentPhone",
      "address",
      "phone",
      "status",
    ];

    const csv = [
      header.join(","),
      ...students.map((s) =>
        [s.name, s.age, s.branch, s.teacherName, s.parentPhone, s.address, s.phone, s.status]
          .map(escape)
          .join(",")
      ),
    ].join("\n");

    return new NextResponse("\uFEFF" + csv, {
      status: 200,
      headers: {
        "Content-Type": "text/csv; charset=utf-8",
        "Content-Disposition": 'attachment; filename="students-export.csv"',
      },
    });
  } catch (e) {
    // عدم كشف تفاصيل داخلية (OWASP — Security Misconfiguration / Info Leak)
    return NextResponse.json({ error: "غير مصرح" }, { status: 403 });
  }
}
