import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { getCurrentUser } from "@/lib/actions/auth-actions";
import { prisma } from "@/lib/prisma";
import { Role } from "@prisma/client";
import { InstitutionStudentsFull } from "@/components/students/institution-students-full";

export const metadata: Metadata = { title: "بيانات الطلاب" };

export const dynamic = "force-dynamic";

export default async function InstitutionStudentsPage() {
  const user = await getCurrentUser();

  if (!user || user.role !== Role.INSTITUTION) {
    redirect("/");
  }

  // كل جهة ترى طلابها فقط (المادة 8/7) — مقيدة بـ institutionId تلقائياً
  const students = user.institutionId
    ? await prisma.student.findMany({
        where: { institutionId: user.institutionId },
        orderBy: { createdAt: "desc" },
        select: {
          id: true,
          name: true,
          age: true,
          branch: true,
          nationality: true,
          teacherName: true,
          parentPhone: true,
          address: true,
          status: true,
          createdAt: true,
          approvedAt: true,
          committee: { select: { name: true } },
          examSessions: {
            orderBy: { examDate: "desc" },
            select: {
              examDate: true,
              period: true,
              assessments: {
                orderBy: { updatedAt: "desc" },
                select: { finalScore: true, status: true },
              },
            },
          },
          certificates: {
            orderBy: { issuedDate: "desc" },
            select: { serialNumber: true, status: true },
          },
        },
      })
    : [];

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold">بيانات طلاب الجهة</h1>
        <p className="mt-1 text-muted-foreground">
          بيانات شاملة لطلاب جهتك التعليمية مع فلترة وبحث
        </p>
      </div>

      <InstitutionStudentsFull students={students} />
    </div>
  );
}