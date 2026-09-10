import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { getCurrentUser } from "@/lib/actions/auth-actions";
import { getExaminersList } from "@/lib/actions/examiner-actions";
import { Role } from "@prisma/client";
import { TeachersManager } from "@/components/specialist/teachers-manager";

export const metadata: Metadata = {
  title: "إدارة المعلمين",
};

export const dynamic = "force-dynamic";

export default async function SpecialistTeachersPage() {
  const user = await getCurrentUser();
  if (!user || user.role !== Role.TEST_SPECIALIST) {
    redirect("/test-specialist");
  }

  const examiners = await getExaminersList();

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold">إدارة المعلمين</h1>
        <p className="mt-1 text-muted-foreground">
          إنشاء حسابات المعلمين (المختبرين) وإعادة تعيين كلمات المرور — تُستخدم بيانات العمر في
          الاعتماد المتسلسل
        </p>
      </div>

      <TeachersManager initial={examiners} />
    </div>
  );
}