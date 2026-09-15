import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { requireUser, requireRole } from "@/lib/security";
import { Role } from "@prisma/client";
import { getQuestionBankModels } from "@/lib/actions/question-bank-actions";
import { QuestionBankManager } from "@/components/admin/question-bank-manager";

export const metadata: Metadata = {
  title: "بنك الأسئلة",
};

export const dynamic = "force-dynamic";

export default async function QuestionBankPage() {
  const user = await requireUser();
  // الحماية من جانب الخادم: ممنوع عن المالك (SUPER_ADMIN) — يُعاد توجيهه للوحة المالك
  if (user.role === Role.SUPER_ADMIN) redirect("/super-admin");
  requireRole(user, [Role.ADMIN, Role.TEST_SPECIALIST]);

  const models = await getQuestionBankModels();

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold">بنك الأسئلة</h1>
        <p className="mt-1 text-muted-foreground">
          نماذج اختبارية دائمة (بلا موسم) — مشتركة على مستوى المؤسسة للاستخدام في جميع المواسم
        </p>
      </div>
      <QuestionBankManager models={models} />
    </div>
  );
}