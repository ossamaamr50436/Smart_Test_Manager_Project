import type { Metadata } from "next";
import Link from "next/link";
import { redirect } from "next/navigation";
import { getCurrentUser } from "@/lib/actions/auth-actions";
import { prisma } from "@/lib/prisma";
import { Role } from "@prisma/client";
import {
  Card,
  CardContent,
  CardHeader,
  CardTitle,
  CardDescription,
} from "@/components/ui/card";
import { Button } from "@/components/ui/button";

export const metadata: Metadata = { title: "لوحة المختبر" };

export default async function ExaminerDashboardPage() {
  const user = await getCurrentUser();

  if (!user || user.role !== Role.EXAMINER) {
    redirect("/dashboard");
  }

  // عزل الصلاحيات: المختبر يرى فقط الطلاب الموزعين على لجنه
  const sessions = await prisma.examSession.findMany({
    where: {
      OR: [{ teacher1Id: user.id }, { teacher2Id: user.id }],
    },
    include: {
      student: true,
    },
    orderBy: { examDate: "desc" },
  });

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold">لوحة المختبر (المعلم)</h1>
        <p className="mt-1 text-muted-foreground">
          طلابك الموزعون على لجانك فقط — اضغط «تقييم» لبدء التقييم الحي
        </p>
      </div>

      <Card>
        <CardHeader>
          <CardTitle className="text-base">طلاب لجانك</CardTitle>
          <CardDescription>{sessions.length} طالب موزع على لجانك</CardDescription>
        </CardHeader>
        <CardContent>
          {sessions.length === 0 ? (
            <p className="py-8 text-center text-sm text-muted-foreground">
              لم يتم توزيع أي طالب على لجنك بعد
            </p>
          ) : (
            <div className="space-y-2">
              {sessions.map((session) => (
                <div
                  key={session.id}
                  className="flex items-center justify-between rounded-lg border px-4 py-3"
                >
                  <div>
                    <p className="font-medium">{session.student.name}</p>
                    <p className="text-xs text-muted-foreground">
                      {session.student.branch} أجزاء — الحالة:{" "}
                      {session.student.status}
                    </p>
                  </div>
                  <Button asChild size="sm">
                    <Link href={`/dashboard/examiner/assess/${session.student.id}`}>
                      تقييم
                    </Link>
                  </Button>
                </div>
              ))}
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
