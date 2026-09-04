import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { auth } from "@/auth";
import { Role } from "@prisma/client";
import { AuditLogTable } from "@/components/audit-log/audit-log-table";

export const metadata: Metadata = {
  title: "سجل التدقيق",
};

export default async function AuditLogPage() {
  const session = await auth();

  // عزل الصلاحيات: ADMIN و TEST_SPECIALIST فقط (المادة 8)
  if (
    !session?.user ||
    (session.user.role !== Role.ADMIN && session.user.role !== Role.TEST_SPECIALIST)
  ) {
    redirect("/dashboard");
  }

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold">سجل التدقيق</h1>
        <p className="mt-1 text-muted-foreground">
          جميع العمليات الحساسة المسجلة في النظام — مع إمكانية التصفية والبحث
        </p>
      </div>

      <AuditLogTable />
    </div>
  );
}
