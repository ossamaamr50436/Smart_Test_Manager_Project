import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { getCurrentUser } from "@/lib/actions/auth-actions";
import { Role } from "@prisma/client";
import { EntityCreateForm } from "@/components/specialist/entity-create-form";

export const metadata: Metadata = {
  title: "إنشاء جهة تعليمية",
};

export const dynamic = "force-dynamic";

export default async function SpecialistCreateEntityPage() {
  const user = await getCurrentUser();

  // عزل الصلاحيات: الأخصائي أو الأدمن فقط
  if (
    !user ||
    (user.role !== Role.TEST_SPECIALIST && user.role !== Role.ADMIN)
  ) {
    redirect("/");
  }

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold">إنشاء جهة تعليمية</h1>
        <p className="mt-1 text-muted-foreground">
          أنشئ جهة تعليمية جديدة مع بيانات دخول جاهزة تُسلَّم للجهة
        </p>
      </div>

      <EntityCreateForm />
    </div>
  );
}