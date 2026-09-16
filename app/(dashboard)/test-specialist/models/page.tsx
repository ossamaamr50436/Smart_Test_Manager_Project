import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { getCurrentUser } from "@/lib/actions/auth-actions";
import { Role } from "@prisma/client";
import { getQuestionBankModels } from "@/lib/actions/question-bank-actions";
import { ExamModelsManager } from "@/components/specialist/exam-models-manager";

export const metadata: Metadata = {
  title: "إدارة النماذج",
};

export const dynamic = "force-dynamic";

export default async function SpecialistModelsPage() {
  const user = await getCurrentUser();

  // عزل الصلاحيات: صفحة خاصة بأخصائي الاختبارات والمسؤول (المهمة C)
  if (!user || (user.role !== Role.TEST_SPECIALIST && user.role !== Role.ADMIN)) {
    redirect("/test-specialist");
  }

  if (!user.tenantId) redirect("/test-specialist");

  // جميع النماذج من بنك الأسئلة (دائمة — بلا موسم)
  const models = await getQuestionBankModels();

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold">إدارة النماذج الاختبارية</h1>
        <p className="mt-1 text-muted-foreground">
          وفق لائحة اختيار فرع كامل القرآن — حتى 100 نموذج لكل فرع، مع عدد مقاطع من 1 إلى 30.
          النماذج تُحفظ في بنك الأسئلة، لا ترتبط بموسم أو لجنة.
        </p>
      </div>

      <ExamModelsManager models={models} />
    </div>
  );
}