import { AssessmentStatus } from "@prisma/client";
import type { Prisma } from "@prisma/client";

/**
 * إسقاطات قراءة الطلاب (Server-Side Projection)
 * ---------------------------------------------
 * أقل الحقول اللازمة لكل دور — تُمنع بيانات ولي الأمر والعنوان وتفاصيل
 * التقييم من الوصول إلى طبقات العرض.
 *
 * ملاحظة: هذه الوحدة ليست "use server" لأنها تُصدِّر قيماً (لا دوال
 * async فقط)، وتستوردها ملفات الإجراءات.
 */

/**
 * إسقاط محدود لطلاب مراجعة رئيس الشؤون التعليمية.
 * لا تُرجع بيانات ولي الأمر (parentPhone/address/...) ولا تفاصيل التقييم.
 */
export const HEAD_REVIEW_STUDENT_SELECT = {
  id: true,
  name: true,
  branch: true,
  status: true,
  updatedAt: true,
  tenantId: true,
  institutionId: true,
  institution: { select: { name: true } },
  examSessions: {
    select: {
      assessments: { select: { finalScore: true } },
    },
  },
} satisfies Prisma.StudentSelect;

export type HeadReviewStudent = Prisma.StudentGetPayload<{
  select: typeof HEAD_REVIEW_STUDENT_SELECT;
}>;

/**
 * إسقاط لوحة رئيس الشؤون التعليمية (NOTIFIED).
 * نفس قواعد الخصوصية أعلاه + تقييمات ACCEPTED فقط (finalScore).
 * لا بيانات ولي الأمر ولا تفاصيل التقييم.
 */
export const HEAD_APPROVAL_TABLE_STUDENT_SELECT = {
  id: true,
  name: true,
  branch: true,
  updatedAt: true,
  institution: { select: { name: true } },
  examSessions: {
    select: {
      assessments: {
        where: { status: AssessmentStatus.ACCEPTED },
        select: { finalScore: true },
      },
    },
  },
} satisfies Prisma.StudentSelect;

/**
 * إسقاط مراجعة الأخصائي النهائية (COMPLETED).
 * الأخصائي يحتاج تفاصيل تقييم المختبرين، لكنه لا يحتاج بيانات ولي الأمر
 * (parentPhone/address/nationality) ولا رابط ملف التقديم ولا اسم المعلم.
 */
export const SPECIALIST_FINAL_REVIEW_STUDENT_SELECT = {
  id: true,
  name: true,
  branch: true,
  updatedAt: true,
  institution: { select: { name: true } },
  examSessions: {
    orderBy: { createdAt: "desc" },
    select: {
      examDate: true,
      period: true,
      model: { select: { modelNumber: true } },
      assessments: {
        where: {
          status: {
            in: [
              AssessmentStatus.APPROVED,
              AssessmentStatus.ACCEPTED,
              AssessmentStatus.NOTIFIED,
            ],
          },
        },
        select: {
          finalScore: true,
          recitationScore: true,
          tajweedScore: true,
          memorizationDeduction: true,
          totalDeduction: true,
          status: true,
          updatedAt: true,
          evaluator: { select: { id: true, name: true } },
        },
      },
    },
  },
} satisfies Prisma.StudentSelect;

/** حقول بيانات ولي الأمر/الطالب المحظورة على طبقات العرض (أي إسقاط). */
export const STUDENT_PII_FIELDS = [
  "parentPhone",
  "address",
  "nationality",
  "age",
  "teacherName",
  "applicationFileUrl",
  "applicationFileId",
  "phone",
] as const;

/** مفاتيح المستوى الأعلى المسموح بها في إسقاط مراجعة رئيس الشؤون. */
export const HEAD_REVIEW_ALLOWED_FIELDS = [
  "id",
  "name",
  "branch",
  "status",
  "updatedAt",
  "tenantId",
  "institutionId",
  "institution",
  "examSessions",
] as const;

/** حقول ممنوعة من التسريب عبر إسقاط مراجعة رئيس الشؤون التعليمية. */
export const HEAD_REVIEW_FORBIDDEN_FIELDS = [
  "parentPhone",
  "address",
  "nationality",
  "age",
  "teacherName",
  "applicationFileUrl",
  "applicationFileId",
  "phone",
  "recitationScore",
  "tajweedScore",
  "wordErrors",
  "letterErrors",
  "diacriticErrors",
  "seriousErrors",
  "subtleErrors",
  "promptingCount",
  "doubtCount",
  "tajweedErrors",
  "memorizationDeduction",
  "totalDeduction",
  "rejectionReason",
] as const;
