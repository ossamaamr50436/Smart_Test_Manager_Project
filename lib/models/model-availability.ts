import { prisma } from "@/lib/prisma";

/**
 * قاعدة واحدة لتحديد «النماذج المستخدمة» في لجنة واحدة.
 *
 * القاعدة (M9): النموذج لا يتكرر بين طالبين في نفس اللجنة/الموسم.
 * تُستخدم في قائمتَي المختبر (`/examiner/pending`) وفي بوابة التقييم
 * (`/examiner/assess/[studentId]`) حتى لا تُعرض الواجهة نموذجاً يرفضه
 * الخادم.
 *
 * `excludeStudentId` = الطالب الحالي (لا يُحتسب نموذجه منموذجاً مستخدماً
 * لنفسه).
 */
export async function getUsedModelAssignmentsInCommittee(args: {
  seasonId: string;
  committeeId: string | null;
  excludeStudentId?: string;
}): Promise<Array<{ studentId: string; modelId: string; modelNumber: number }>> {
  if (!args.committeeId) return [];

  const sessions = await prisma.examSession.findMany({
    where: {
      seasonId: args.seasonId,
      student: { committeeId: args.committeeId },
      status: { not: "CANCELLED" },
      model: { isNot: null },
      ...(args.excludeStudentId ? { studentId: { not: args.excludeStudentId } } : {}),
    },
    select: {
      studentId: true,
      model: { select: { id: true, modelNumber: true } },
    },
  });

  return sessions.flatMap((s) =>
    s.model ? [{ studentId: s.studentId, modelId: s.model.id, modelNumber: s.model.modelNumber }] : []
  );
}
