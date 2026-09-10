"use client";

import { getBranchLabel } from "@/lib/utils";
import { useState } from "react";
import { useRouter } from "next/navigation";
import { headOfAffairsFinalApprove } from "@/lib/actions/admin-actions";
import { rejectStudentByHead } from "@/lib/actions/head-actions";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";

type NotifiedStudent = {
  id: string;
  name: string;
  branch: string;
  institutionName: string;
  finalScore: number | null;
  notifiedAt: Date;
};

export function HeadApprovalTable({ students }: { students: NotifiedStudent[] }) {
  const router = useRouter();
  const [error, setError] = useState("");
  const [processingId, setProcessingId] = useState<string | null>(null);
  const [rejectReason, setRejectReason] = useState("");
  const [rejectingId, setRejectingId] = useState<string | null>(null);

  async function handleApprove(studentId: string) {
    setError("");
    setProcessingId(studentId);
    try {
      await headOfAffairsFinalApprove(studentId);
      router.refresh();
    } catch (e) {
      setError(e instanceof Error ? e.message : "حدث خطأ غير متوقع");
    } finally {
      setProcessingId(null);
    }
  }

  async function handleReject(studentId: string) {
    setError("");
    setRejectingId(studentId);
    try {
      await rejectStudentByHead(studentId, rejectReason.trim() || undefined);
      setRejectReason("");
      router.refresh();
    } catch (e) {
      setError(e instanceof Error ? e.message : "حدث خطأ غير متوقع");
    } finally {
      setRejectingId(null);
    }
  }

  if (students.length === 0) {
    return (
      <Card>
        <CardContent className="py-10 text-center text-sm text-muted-foreground">
          لا يوجد طلاب بانتظار اعتمادك النهائي حالياً
        </CardContent>
      </Card>
    );
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-base">
          الطلاب بانتظار الاعتماد النهائي ({students.length})
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
                <th className="pb-2 font-medium">تاريخ الاعتماد</th>
                <th className="pb-2 font-medium">إجراءات</th>
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
                      ? `${student.finalScore.toFixed(2)} / 20`
                      : "—"}
                  </td>
                  <td className="py-3">
                    {student.notifiedAt.toLocaleDateString("ar-SA")}
                  </td>
                  <td className="py-3">
                    <div className="flex flex-wrap items-center gap-2">
                      <Button
                        size="sm"
                        disabled={processingId === student.id || rejectingId === student.id}
                        onClick={() => handleApprove(student.id)}
                      >
                        {processingId === student.id
                          ? "جارٍ الاعتماد..."
                          : "اعتماد نهائي (Final Approve)"}
                      </Button>
                      <div className="flex items-center gap-1">
                        <input
                          type="text"
                          value={rejectingId === student.id ? rejectReason : ""}
                          onChange={(e) => setRejectReason(e.target.value)}
                          placeholder="سبب الرفض (اختياري)"
                          className="h-8 w-40 rounded-md border border-input bg-transparent px-2 text-xs"
                        />
                        <Button
                          size="sm"
                          variant="destructive"
                          disabled={processingId === student.id || rejectingId === student.id}
                          onClick={() => handleReject(student.id)}
                        >
                          {rejectingId === student.id ? "جارٍ الرفض..." : "رفض"}
                        </Button>
                      </div>
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
