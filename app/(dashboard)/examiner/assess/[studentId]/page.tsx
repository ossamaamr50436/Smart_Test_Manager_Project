import type { Metadata } from "next";
import { notFound, redirect } from "next/navigation";
import { getCurrentUser } from "@/lib/actions/auth-actions";
import { prisma } from "@/lib/prisma";
import { Role } from "@prisma/client";
import { AssessmentBoard } from "@/components/examiner/assessment-board";
import { getAssessmentSettings } from "@/lib/actions/assessment-settings-actions";

export const metadata: Metadata = {
  title: "التقييم التفاعلي",
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
  searchParams,
}: {
  params: { studentId: string };
  searchParams: { model?: string };
}) {
  const user = await getCurrentUser();

  if (!user || user.role !== Role.EXAMINER) {
    redirect("/examiner");
  }

  // جلب إعدادات التقييم من قاعدة البيانات
  const settings = await getAssessmentSettings();

  // البحث عن الطالب في اللجنة الخاصة بالمختبر
  const student = await prisma.student.findUnique({
    where: { id: params.studentId },
    include: {
      committee: {
        include: {
          teacher1: { select: { id: true, name: true, birthDate: true } },
          teacher2: { select: { id: true, name: true, birthDate: true } },
          allocations: {
            select: {
              startModelNumber: true,
              endModelNumber: true,
              seasonId: true,
            },
          },
        },
      },
    },
  });

  if (!student || !student.committee) {
    notFound();
  }

  const committee = student.committee;

  // التحقق من أن المختبر معلم في اللجنة
  const isTeacher =
    committee.teacher1Id === user.id || committee.teacher2Id === user.id;
  if (!isTeacher) {
    notFound();
  }

  // تحديد هل المقيّم الحالي هو الأكبر سناً
  let seniorIsUser = true;
  const t1 = committee.teacher1.birthDate;
  const t2 = committee.teacher2.birthDate;
  if (t1 && t2) {
    const teacher1Older = t1 <= t2;
    seniorIsUser =
      user.id === committee.teacher1Id ? teacher1Older : !teacher1Older;
  } else {
    seniorIsUser = user.id === committee.teacher1Id;
  }

  // قراءة رقم النموذج من URL (المهمة 4)
  const allocation = committee.allocations[0];
  const modelNumberParam = searchParams.model
    ? Number(searchParams.model)
    : 0;

  if (!modelNumberParam || modelNumberParam < 1) {
    return (
      <div className="mx-auto mt-16 max-w-xl rounded-lg border bg-card p-8 text-center">
        <h1 className="text-2xl font-bold">رقم النموذج غير صالح</h1>
        <p className="mt-3 text-muted-foreground">
          يجب تحديد رقم النموذج من لوحة المختبر قبل بدء التقييم.
        </p>
      </div>
    );
  }

  if (
    allocation &&
    (modelNumberParam < allocation.startModelNumber ||
      modelNumberParam > allocation.endModelNumber)
  ) {
    return (
      <div className="mx-auto mt-16 max-w-xl rounded-lg border bg-card p-8 text-center">
        <h1 className="text-2xl font-bold">رقم النموذج خارج النطاق</h1>
        <p className="mt-3 text-muted-foreground">
          رقم النموذج {modelNumberParam} خارج نطاق اللجنة ({allocation.startModelNumber} —{" "}
          {allocation.endModelNumber}). يرجى العودة واختيار رقم صحيح.
        </p>
      </div>
    );
  }

  // تحميل النموذج المحدد
  let model = null;
  if (allocation) {
    model = await prisma.examModel.findFirst({
      where: {
        branch: student.branch,
        seasonId: allocation.seasonId,
        modelNumber: modelNumberParam,
      },
      select: { detailsJSON: true, branch: true, modelNumber: true },
    });
  }

  // استرجاع مقاطع النموذج
  let segments: Segment[] = [];
  let modelNumberFinal = modelNumberParam;
  const details = model?.detailsJSON as {
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
    if (model?.modelNumber) modelNumberFinal = model.modelNumber;
  }

  if (segments.length === 0) {
    return (
      <div className="mx-auto mt-16 max-w-xl rounded-lg border bg-card p-8 text-center">
        <h1 className="text-2xl font-bold">لا يوجد نموذج اختباري</h1>
        <p className="mt-3 text-muted-foreground">
          لم يُعثر على نموذج برقم {modelNumberParam} لهذه اللجنة. يرجى التواصل
          مع أخصائي الاختبارات.
        </p>
      </div>
    );
  }

  return (
    <AssessmentBoard
      student={{ id: student.id, name: student.name, branch: student.branch }}
      sessionId={committee.id}
      seniorIsUser={seniorIsUser}
      evaluatorId={user.id}
      segments={segments}
      modelNumber={modelNumberFinal}
      settings={settings}
    />
  );
}
