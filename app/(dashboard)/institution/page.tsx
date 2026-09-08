import type { Metadata } from "next";
import Link from "next/link";
import { redirect } from "next/navigation";
import { getCurrentUser } from "@/lib/actions/auth-actions";
import { prisma } from "@/lib/prisma";
import { Role } from "@prisma/client";
import { Button } from "@/components/ui/button";
import { InstitutionStudentsTable } from "@/components/students/institution-students-table";

export const metadata: Metadata = { title: "لوحة الجهة التعليمية" };

export const dynamic = "force-dynamic";

export default async function InstitutionDashboardPage() {
  const user = await getCurrentUser();

  if (!user || user.role !== Role.INSTITUTION) {
    redirect("/");
  }

  const students = user.institutionId
    ? await prisma.student.findMany({
        where: { institutionId: user.institutionId },
        orderBy: { createdAt: "desc" },
        select: {
          id: true,
          name: true,
          age: true,
          branch: true,
          status: true,
          teacherName: true,
          parentPhone: true,
          createdAt: true,
        },
      })
    : [];

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-2xl font-bold">لوحة الجهة التعليمية</h1>
          <p className="mt-1 text-muted-foreground">
            الاطلاع على الطلاب المرشحين وتتبع حالتهم وترشيح طلاب جدد
          </p>
        </div>
        <Button asChild>
          <Link href="/institution/students/new">ترشيح طالب جديد</Link>
        </Button>
      </div>

      <InstitutionStudentsTable students={students} />
    </div>
  );
}
