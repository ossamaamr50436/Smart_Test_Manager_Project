import type { Metadata } from "next";
import Link from "next/link";
import { redirect } from "next/navigation";
import { auth } from "@/auth";
import { Role } from "@prisma/client";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";

export const metadata: Metadata = { title: "التعليم والدور" };

export const dynamic = "force-dynamic";

type Guidance = {
  title: string;
  intro: string;
  sections: { heading: string; items: string[] }[];
};

const GUIDANCE: Record<string, Guidance> = {
  ADMIN: {
    title: "دور المسؤول",
    intro: "تتحكم بكامل المنصة وتدير المستخدمين والأقسام والإعدادات.",
    sections: [
      {
        heading: "إدارة المستخدمين",
        items: [
          "أنشئ المستخدمين من قائمة «المستخدمون» وحدد لكل مستخدم دوره وكلمة المرور.",
          "حساب جديد يُنشأ دون تفعيل «إجبار تغيير كلمة المرور» يدخل مباشرة بكلمة المرور المحددة.",
          "إن وضّبت علامة إجبار تغيير كلمة المرور، يُوجَّه المستخدم لتغييرها عند أول دخول.",
          "يمكنك تغيير كلمة مرور أي مستخدم أو حذفه في أي وقت.",
        ],
      },
      {
        heading: "إعدادات المنصة",
        items: [
          "عدّل الاسم والشعار والألوان ورقم الدعم الفني من «إعدادات المنصة».",
          "تحكّم بظهور قسم التعليم والدور من الإعدادات نفسها.",
        ],
      },
      {
        heading: "الإشراف",
        items: [
          "تابع سجل التدقيق لمتابعة جميع العمليات الحساسة.",
          "عاين التقارير والتحليلات لمراقبة سير الاختبارات.",
        ],
      },
    ],
  },
  HEAD_OF_AFFAIRS: {
    title: "دور رئيس الشؤون التعليمية",
    intro: "تصادق على التقييمات النهائية المعتمدة من أخصائي الاختبارات.",
    sections: [
      {
        heading: "الاعتماد الإداري النهائي",
        items: [
          "راجع التقييمات التي أعتمدها الأخصائي من لوحة الاعتماد الإداري.",
          "نظّم وافحص النتائج النهائية قبل الموافقة عليها.",
          "صفحة التقارير متاحة لديك لمتابعة الأداء العام.",
        ],
      },
    ],
  },
  CERTIFICATE_SOURCE: {
    title: "دور مصدر الشهادات",
    intro: "تصدر الشهادات للطلاب الذين أكملوا جميع مراحل التقييم.",
    sections: [
      {
        heading: "إصدار الشهادات",
        items: [
          "راجع قائمة الطلاب المكتملين فقط من صفحة إصدار الشهادات.",
          "أصدر الشهادة وتابع حالة التوقيع والرفع والإرسال.",
        ],
      },
    ],
  },
  TEST_SPECIALIST: {
    title: "دور أخصائي الاختبارات",
    intro: "مهمتك الإشراف على الطلاب واللجان والمختبرين.",
    sections: [
      {
        heading: "الترشيحات والطلاب",
        items: [
          "حلل طلبات الترشيح من الجهات ووافق عليها أو ارفضها.",
          "شكّل اللجان من المعلمين ووزّع الطلاب عليها.",
        ],
      },
      {
        heading: "التقييمات",
        items: [
          "عاين تقييم كل مختبر بشكل منفصل من «مراجعة التقييمات النهائية».",
          "راجع النتائج وأقرّها لإرسالها إلى رئيس الشؤون.",
        ],
      },
      {
        heading: "الإعدادات",
        items: [
          "اضبط خصومات التقييم من «إعدادات التقييم».",
          "أدر النماذج والجهات التعليمية.",
        ],
      },
    ],
  },
  EXAMINER: {
    title: "دور المختبر (المعلم)",
    intro: "تُقيّم الطلاب الموزعين على لجنتك وفق لائحة المنصة.",
    sections: [
      {
        heading: "التقييم التفاعلي",
        items: [
          "افتح تقييم الطالب من لوحة التحكم وأدخل الأخطاء والشك وأخطاء التجويد.",
          "أدخل درجتي التلاوة والتجويد التطبيقي مباشرة.",
          "احفظ التقييم كمسودة في أي وقت، واعتمده عند الانتهاء.",
          "اعتماد تقييمك نهائي ومستقل — لا ينتظر اعتماد مختبر آخر.",
        ],
      },
      {
        heading: "تقاريري",
        items: [
          "راجع تقييماتك السابقة ودرجات الطلاب من صفحة «تقاريري».",
        ],
      },
    ],
  },
  INSTITUTION: {
    title: "دور الجهة التعليمية",
    intro: "تُرشّح الطلاب وتتابع حالتهم عبر المنصة.",
    sections: [
      {
        heading: "ترشيح الطلاب",
        items: [
          "افتح «ترشيح طالب جديد» وأدخل بيانات الطالب وفرعه.",
          "ارفع نموذج اختبار الطالب PDF إن كان مطلوباً.",
          "تابع حالة الترشيح من «طلاب جهتي» (بانتظار المراجعة، مقبول، مرفوض...).",
        ],
      },
      {
        heading: "التقارير",
        items: [
          "استعرض تقارير الجهة لمتابعة تقدم طلابها.",
        ],
      },
    ],
  },
};

export default async function TutorialPage() {
  const session = await auth();
  if (!session?.user) {
    redirect("/login");
  }

  const role = session.user.role as Role | undefined;
  const guidance = role ? GUIDANCE[role] : undefined;

  return (
    <div className="mx-auto max-w-3xl space-y-6 py-4">
      <div className="space-y-1 text-start">
        <h1 className="text-2xl font-bold">قسم التعليم والدور</h1>
        <p className="text-sm text-muted-foreground">
          دليل مختصر يشرح مهامك وصلاحياتك داخل المنصة
        </p>
      </div>

      {guidance ? (
        <>
          <Card className="border-primary/20 bg-primary/5">
            <CardHeader>
              <CardTitle className="text-lg">{guidance.title}</CardTitle>
              <CardDescription>{guidance.intro}</CardDescription>
            </CardHeader>
          </Card>

          {guidance.sections.map((section) => (
            <Card key={section.heading}>
              <CardHeader>
                <CardTitle className="text-base">{section.heading}</CardTitle>
              </CardHeader>
              <CardContent>
                <ul className="list-disc space-y-2 pr-5 text-sm text-muted-foreground">
                  {section.items.map((item) => (
                    <li key={item}>{item}</li>
                  ))}
                </ul>
              </CardContent>
            </Card>
          ))}
        </>
      ) : (
        <Card>
          <CardContent className="py-8 text-center text-sm text-muted-foreground">
            لا يوجد محتوى تعليمي محدد لدورك الحالي
          </CardContent>
        </Card>
      )}

      <div className="flex items-center justify-end">
        <Link
          href="/settings"
          className="rounded-md border px-4 py-2 text-sm font-medium transition-colors hover:bg-secondary-50"
        >
          العودة إلى الإعدادات
        </Link>
      </div>
    </div>
  );
}