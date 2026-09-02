"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { reviewStudentApplication } from "@/lib/actions/student-actions";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";

type PendingStudent = {
  id: string;
  name: string;
  branch: string;
  age: number;
  createdAt: Date;
  institution: { name: string };
};

export function RequestsTable({ students }: { students: PendingStudent[] }) {
  const router = useRouter();
  const [error, setError] = useState("");
  const [processingId, setProcessingId] = useState<string | null>(null);

  async function handleDecision(studentId: string, decision: "APPROVED" | "REJECTED") {
    setError("");
    setProcessingId(studentId);
    try {
      await reviewStudentApplication(studentId, decision);
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
        <CardContent className="py-8 text-center text-muted-foreground">
          لا توجد طلبات ترشيح بانتظار المراجعة حالياً
        </CardContent>
      </Card>
    );
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-base">قائمة الطلبات</CardTitle>
      </CardHeader>
      <CardContent>
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b text-right text-muted-foreground">
                <th className="pb-2 font-medium">اسم الطالب</th>
                <th className="pb-2 font-medium">الجهة المرشحة</th>
                <th className="pb-2 font-medium">تاريخ الترشيح</th>
                <th className="pb-2 font-medium">الفرع</th>
                <th className="pb-2 font-medium">إجراءات</th>
              </tr>
            </thead>
            <tbody>
              {students.map((student) => (
                <tr key={student.id} className="border-b last:border-0">
                  <td className="py-3 font-medium">{student.name}</td>
                  <td className="py-3">{student.institution.name}</td>
                  <td className="py-3">
                    {student.createdAt.toLocaleDateString("ar-SA")}
                  </td>
                  <td className="py-3">{student.branch} أجزاء</td>
                  <td className="py-3">
                    <div className="flex gap-2">
                      <Button
                        size="sm"
                        disabled={processingId === student.id}
                        onClick={() => handleDecision(student.id, "APPROVED")}
                      >
                        قبول
                      </Button>
                      <Button
                        size="sm"
                        variant="destructive"
                        disabled={processingId === student.id}
                        onClick={() => handleDecision(student.id, "REJECTED")}
                      >
                        رفض
                      </Button>
                    </div>
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