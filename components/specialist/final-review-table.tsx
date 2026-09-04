"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { specialistFinalApprove } from "@/lib/actions/admin-actions";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";

type FinalStudent = {
  id: string;
  name: string;
  branch: string;
  institutionName: string;
  finalScore: number | null;
  completedAt: Date;
};

export function FinalReviewTable({ students }: { students: FinalStudent[] }) {
  const router = useRouter();
  const [error, setError] = useState("");
  const [processingId, setProcessingId] = useState<string | null>(null);

  async function handleApprove(studentId: string) {
    setError("");
    setProcessingId(studentId);
    try {
      await specialistFinalApprove(studentId);
      router.refresh();
    } catch (e) {
      setError(e instanceof Error ? e.message : "حدث خطأ غير متوقع");
    } finally {
      setProcessingId(null);
    }
  }

  if (students.length === 0) {
    return (
      <Card>
        <CardContent className="py-10 text-center text-sm text-muted-foreground">
          لا يوجد طلاب مكتملون بانتظار الاعتماد النهائي حالياً
        </CardContent>
      </Card>
    );
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-base">
          الطلاب المكتملون ({students.length})
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
                <th className="pb-2 font-medium">تاريخ الانتهاء</th>
                <th className="pb-2 font-medium">إجراءات</th>
              </tr>
            </thead>
            <tbody>
              {students.map((student) => (
                <tr key={student.id} className="border-b last:border-0">
                  <td className="py-3 font-medium">{student.name}</td>
                  <td className="py-3">{student.institutionName}</td>
                  <td className="py-3">{student.branch} أجزاء</td>
                  <td className="py-3">
                    {student.finalScore !== null
                      ? `${student.finalScore.toFixed(2)} / 20`
                      : "—"}
                  </td>
                  <td className="py-3">
                    {student.completedAt.toLocaleDateString("ar-SA")}
                  </td>
                  <td className="py-3">
                    <Button
                      size="sm"
                      disabled={processingId === student.id}
                      onClick={() => handleApprove(student.id)}
                    >
                      {processingId === student.id
                        ? "جارٍ الاعتماد..."
                        : "اعتماد نهائي (Accept)"}
                    </Button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>

        {error && (
          <p className="mt-4 rounded-md bg-destructive/10 px-3 py-2 text-sm text-destructive">
            {error}
          </p>
        )}
      </CardContent>
    </Card>
  );
}
