"use client";

import { getBranchLabel } from "@/lib/utils";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";

type RejectedStudentRow = {
  id: string;
  name: string;
  branch: string;
  institutionName: string;
  finalScore: number | null;
  rejectedAt: Date | null;
  rejectionReason: string | null;
  rejectedByName: string | null;
};

export function RejectedStudentsTable({
  students,
  title,
}: {
  students: RejectedStudentRow[];
  title: string;
}) {
  if (students.length === 0) {
    return (
      <Card>
        <CardContent className="py-10 text-center text-sm text-muted-foreground">
          لا يوجد طلاب مرفوضون حالياً
        </CardContent>
      </Card>
    );
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-base">
          {title} ({students.length})
        </CardTitle>
      </CardHeader>
      <CardContent>
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b text-right text-muted-foreground">
                <th className="pb-2 font-medium">اسم الطالب</th>
                <th className="pb-2 font-medium">الجهة</th>
                <th className="pb-2 font-medium">الفرع</th>
                <th className="pb-2 font-medium">الدرجة النهائية</th>
                <th className="pb-2 font-medium">سبب الرفض</th>
                <th className="pb-2 font-medium">تاريخ الرفض</th>
                <th className="pb-2 font-medium">رافع الرفض</th>
              </tr>
            </thead>
            <tbody>
              {students.map((student) => (
                <tr key={student.id} className="border-b last:border-0">
                  <td className="py-3 font-medium">{student.name}</td>
                  <td className="py-3">{student.institutionName}</td>
                  <td className="py-3">{getBranchLabel(student.branch)}</td>
                  <td className="py-3">
                    {student.finalScore !== null
                      ? `${student.finalScore.toFixed(2)} / 100`
                      : "—"}
                  </td>
                  <td className="py-3">
                    {student.rejectionReason ?? "—"}
                  </td>
                  <td className="py-3">
                    {student.rejectedAt
                      ? student.rejectedAt.toLocaleDateString("ar-SA")
                      : "—"}
                  </td>
                  <td className="py-3">{student.rejectedByName ?? "—"}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </CardContent>
    </Card>
  );
}