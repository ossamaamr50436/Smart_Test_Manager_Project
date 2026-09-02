import type { Metadata } from "next";
import { auth } from "@/auth";
import { ROLE_LABELS } from "@/lib/roles";
import {
  Card,
  CardContent,
  CardHeader,
  CardTitle,
  CardDescription,
} from "@/components/ui/card";

export const metadata: Metadata = {
  title: "لوحة التحكم الرئيسية",
};

// إحصائيات وهمية (المرحلة 2) — ستُستبدل ببيانات حقيقية من قاعدة البيانات
const mockStats = [
  { label: "عدد الطلاب", value: "128", hint: "طلاب مرشحون هذا الموسم" },
  { label: "عدد الجلسات", value: "54", hint: "جلسة اختبار مجدولة" },
  { label: "الطلاب المكتملون", value: "31", hint: "أكملوا التقييم" },
  { label: "النماذج", value: "100", hint: "نموذج اختباري جاهز" },
];

export default async function DashboardPage() {
  const session = await auth();
  const role = session?.user?.role as keyof typeof ROLE_LABELS | undefined;
  const userName = session?.user?.name ?? "مستخدم";

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold">مرحباً، {userName} 👋</h1>
        <p className="mt-1 text-muted-foreground">
          دورك:{" "}
          <span className="font-medium text-secondary">
            {role ? ROLE_LABELS[role] : "غير محدد"}
          </span>
        </p>
      </div>

      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        {mockStats.map((stat) => (
          <Card key={stat.label}>
            <CardHeader>
              <CardTitle className="text-3xl">{stat.value}</CardTitle>
              <CardDescription>{stat.label}</CardDescription>
            </CardHeader>
            <CardContent>
              <p className="text-xs text-muted-foreground">{stat.hint}</p>
            </CardContent>
          </Card>
        ))}
      </div>

      <Card>
        <CardHeader>
          <CardTitle>نظرة عامة</CardTitle>
          <CardDescription>
            هذه لوحة التحكم العامة. ستُنشأ صفحات متخصصة لكل دور في لوحات التحكم
            التالية.
          </CardDescription>
        </CardHeader>
        <CardContent>
          <p className="text-sm text-muted-foreground">
            استخدم القائمة الجانبية للتنقل، أو انتظر التحديثات القادمة الخاصة
            بدورك.
          </p>
        </CardContent>
      </Card>
    </div>
  );
}