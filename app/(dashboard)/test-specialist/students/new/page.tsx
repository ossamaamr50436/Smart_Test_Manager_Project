import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { getCurrentUser } from "@/lib/actions/auth-actions";
import { prisma } from "@/lib/prisma";
import { Role } from "@prisma/client";
import { getTenantFilter } from "@/lib/tenancy";
import { SpecialistNominationForm } from "@/components/specialist/specialist-nomination-form";

export const metadata: Metadata = {
  title: "ترشيح طالب",
};

export const dynamic = "force-dynamic";

export default async function SpecialistNominateStudentPage() {
  const user = await getCurrentUser();

  if (!user || (user.role !== Role.TEST_SPECIALIST && user.role !== Role.ADMIN)) {
    redirect("/test-specialist");
  }

  const tenantFilter = getTenantFilter(user);
  const institutions = await prisma.institution.findMany({
    where: tenantFilter,
    select: { id: true, name: true },
    orderBy: { name: "asc" },
  });

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold">ترشيح طالب جديد</h1>
        <p className="mt-1 text-muted-foreground">
          اختار الجهة التعليمية وأدخل بيانات الطالب — الحالة تبدأ مقبولة مباشرة
        </p>
      </div>
      <SpecialistNominationForm institutions={institutions} />
    </div>
  );
}