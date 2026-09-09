import type { Metadata } from "next";
import { notFound, redirect } from "next/navigation";
import { getCurrentUser } from "@/lib/actions/auth-actions";
import { prisma } from "@/lib/prisma";
import { Role } from "@prisma/client";
import { AssessmentBoard } from "@/components/examiner/assessment-board";

export const metadata: Metadata = {
  title: "التقييم الحي",
};

type Segment = {
  number: number;
  fromText: string;
  fromSurah: string;
  fromVerse: number;
  toText: string;
  toSurah: string;
  toVerse: number;
};

export default async function AssessStudentPage({
  params,
}: {
  params: { studentId: string };
}) {
  const user = await getCurrentUser();

  // عزل الصلاحيات: المقيّم (المعلم) فقط
  if (!user || user.role !== Role.EXAMINER) {
    redirect("/examiner");
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
      model: { select: { detailsJSON: true, branch: true, modelNumber: true } },
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

  // استرجاع مقاطع النموذج (10 مقاطع وفق اللائحة)
  let segments: Segment[] = [];
  const details = session.model?.detailsJSON as {
    segments?: Segment[];
  } | null;
  if (details?.segments && Array.isArray(details.segments)) {
    segments = details.segments
      .filter(
        (s: Segment) =>
          s &&
          typeof s.number === "number" &&
          typeof s.fromText === "string" &&
          typeof s.fromSurah === "string" &&
          typeof s.toText === "string" &&
          typeof s.toSurah === "string"
      )
      .sort((a: Segment, b: Segment) => a.number - b.number);
  }

  // في حال عدم وجود نموذج مرتبط، نعرض رسالة إرشادية بدل المقاطع الوهمية
  if (segments.length === 0) {
    return (
      <div className="mx-auto mt-16 max-w-xl rounded-lg border bg-card p-8 text-center">
        <h1 className="text-2xl font-bold">لا يوجد نموذج اختباري</h1>
        <p className="mt-3 text-muted-foreground">
          لم يُحدَّد نموذج اختبار لهذه الجلسة حتى الآن. يرجى التواصل مع أخصائي
          الاختبارات لربط نموذج (10 مقاطع) بجلسة الطالب {session.student.name}.
        </p>
      </div>
    );
  }

  return (
    <AssessmentBoard
      student={session.student}
      sessionId={session.id}
      seniorIsUser={seniorIsUser}
      evaluatorId={user.id}
      segments={segments}
    />
  );
}