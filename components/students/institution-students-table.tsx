import { getBranchLabel } from "@/lib/utils";
import {
  Card,
  CardContent,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";

const STATUS_LABELS: Record<string, string> = {
  PENDING: "بانتظار المراجعة",
  APPROVED: "مقبول",
  REJECTED: "مرفوض",
  ASSIGNED: "تم توزيعه على لجنة",
  COMPLETED: "اكتمل تقييمه",
  NOTIFIED: "بانتظار اعتماد رئيس الشؤون",
  READY_FOR_CERTIFICATE: "جاهز لإصدار الشهادة",
  CERTIFICATE_ISSUED: "صدرت شهادته",
};

type InstitutionStudent = {
  id: string;
  name: string;
  age: number;
  branch: string;
  nationality?: string;
  status: string;
  teacherName: string;
  parentPhone: string | null;
  createdAt: Date;
};

export function InstitutionStudentsTable({
  students,
}: {
  students: InstitutionStudent[];
}) {
  if (students.length === 0) {
    return (
      <Card>
        <CardContent className="py-10 text-center text-sm text-muted-foreground">
          لم تقم بترشيح أي طالب بعد — استخدم زر «ترشيح طالب جديد»
        </CardContent>
      </Card>
    );
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-base">
          طلاب جهتك التعليمية ({students.length})
        </CardTitle>
      </CardHeader>
      <CardContent>
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b text-right text-muted-foreground">
                <th className="pb-2 font-medium">اسم الطالب</th>
                <th className="pb-2 font-medium">العمر</th>
                <th className="pb-2 font-medium">الجنسية</th>
                <th className="pb-2 font-medium">الفرع</th>
                <th className="pb-2 font-medium">اسم المعلم</th>
                <th className="pb-2 font-medium">رقم ولي الأمر</th>
                <th className="pb-2 font-medium">الحالة</th>
                <th className="pb-2 font-medium">تاريخ الترشيح</th>
              </tr>
            </thead>
            <tbody>
              {students.map((student) => (
                <tr key={student.id} className="border-b last:border-0">
                  <td className="py-3 font-medium">{student.name}</td>
                  <td className="py-3">{student.age}</td>
                  <td className="py-3">{student.nationality || "—"}</td>
                  <td className="py-3">{getBranchLabel(student.branch)}</td>
                  <td className="py-3">{student.teacherName}</td>
                  <td className="py-3" dir="ltr">
                    {student.parentPhone || "—"}
                  </td>
                  <td className="py-3">
                    <span className="inline-flex rounded-full bg-secondary-100 px-2 py-0.5 text-xs font-medium text-primary-700">
                      {STATUS_LABELS[student.status] ?? student.status}
                    </span>
                  </td>
                  <td className="py-3">
                    {student.createdAt.toLocaleDateString("ar-SA")}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </CardContent>
    </Card>
  );
}
