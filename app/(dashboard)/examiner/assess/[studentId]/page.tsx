import type { Metadata } from "next";
import { notFound, redirect } from "next/navigation";
import { getCurrentUser } from "@/lib/actions/auth-actions";
import { prisma } from "@/lib/prisma";
import { Role } from "@prisma/client";
import { AssessmentBoard } from "@/components/examiner/assessment-board";

export const metadata: Metadata = {
  title: "التقييم الحي",
};

export default async function AssessStudentPage({
  params,
}: {
  params: { studentId: string };
}) {
  const user = await getCurrentUser();

  // عزل الصلاحيات: المقيّم (المعلم) فقط
  if (!user || user.role !== Role.EXAMINER) {
    redirect("/dashboard/examiner");
  }

  // اللجنة/الجلسة الخاصة بهذا الطالب والتي يشارك فيها المقيّم الحالي
  const session = await prisma.examSession.findFirst({
    where: {
      studentId: params.studentId,
      OR: [{ teacher1Id: user.id }, { teacher2Id: user.id }],
    },
    include: {
      student: true,
      teacher1: { select: { id: true, name: true, birthDate: true } },
      teacher2: { select: { id: true, name: true, birthDate: true } },
    },
  });

  if (!session) {
    notFound();
  }

  // تحديد هل المقيّم الحالي هو الأكبر سناً (المادة 5)
  let seniorIsUser = true;
  const t1 = session.teacher1.birthDate;
  const t2 = session.teacher2.birthDate;
  if (t1 && t2) {
    const teacher1Older = t1 <= t2;
    seniorIsUser =
      user.id === session.teacher1Id ? teacher1Older : !teacher1Older;
  } else {
    seniorIsUser = user.id === session.teacher1Id;
  }

  // المقاطع الخمسة الوهمية (تمهيد: النماذج ستأتي من Google Drive لاحقاً)
  const mockSegments = ["المقطع الأول", "المقطع الثاني", "المقطع الثالث", "المقطع الرابع", "المقطع الخامس"];

  return (
    <AssessmentBoard
      student={session.student}
      sessionId={session.id}
      seniorIsUser={seniorIsUser}
      evaluatorId={user.id}
      segments={mockSegments}
    />
  );
}
