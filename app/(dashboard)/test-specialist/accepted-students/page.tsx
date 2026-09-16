import type { Metadata } from "next";
import { requireUser, requireRole } from "@/lib/security";
import { Role } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { getTenantFilter } from "@/lib/tenancy";
import { AcceptedStudentsManager } from "@/components/specialist/accepted-students-manager";

export const metadata: Metadata = { title: "الطلاب المقبولون" };

export const dynamic = "force-dynamic";

export default async function SpecialistAcceptedStudentsPage() {
  const user = await requireUser();
  requireRole(user, [Role.ADMIN, Role.TEST_SPECIALIST]);

  const [institutions, committees] = await Promise.all([
    prisma.institution.findMany({
      where: getTenantFilter(user),
      select: { id: true, name: true },
      orderBy: { name: "asc" },
      take: 100,
    }),
    prisma.committee.findMany({
      where: getTenantFilter(user),
      select: { id: true, name: true },
      orderBy: { name: "asc" },
      take: 200,
    }),
  ]);

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold">الطلاب المقبولون</h1>
        <p className="mt-1 text-muted-foreground">
          استعراض الطلاب المقبولين وما بعدهم مع إمكانية تعديل اللجنة والفترة وتاريخ الاختبار والفرع مباشرة.
        </p>
      </div>
      <AcceptedStudentsManager institutions={institutions} committees={committees} />
    </div>
  );
}