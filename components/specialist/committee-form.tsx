"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";

import { assignCommittee } from "@/lib/actions/student-actions";
import {
  PERIODS,
  committeeSchema,
  type CommitteeInput,
} from "@/lib/validations/student";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";

type StudentOption = {
  id: string;
  name: string;
  branch: string;
};

type ExaminerOption = {
  id: string;
  name: string;
};

export function CommitteeForm({
  students,
  examiners,
}: {
  students: StudentOption[];
  examiners: ExaminerOption[];
}) {
  const router = useRouter();
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);

  const {
    register,
    handleSubmit,
    setValue,
    formState: { errors },
  } = useForm<CommitteeInput>({
    resolver: zodResolver(committeeSchema),
    defaultValues: {},
  });

  const selectProps = (field: keyof CommitteeInput) => ({
    onValueChange: (value: string) => setValue(field, value),
  });

  async function onSubmit(data: CommitteeInput) {
    setError("");
    setLoading(true);
    try {
      await assignCommittee(data);
      router.refresh();
    } catch (e) {
      setError(e instanceof Error ? e.message : "حدث خطأ غير متوقع");
      setLoading(false);
    }
  }

  if (students.length === 0) {
    return (
      <Card>
        <CardContent className="py-8 text-center text-sm text-muted-foreground">
          لا يوجد طلاب مقبولون لتوزيعهم حالياً
        </CardContent>
      </Card>
    );
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-base">إنشاء جلسة اختبار</CardTitle>
        <CardDescription>
          اختر الطالب والمعلمين وحدد موعد الجلسة
        </CardDescription>
      </CardHeader>
      <CardContent>
        <form onSubmit={handleSubmit(onSubmit)} className="space-y-4">
          <div className="space-y-2">
            <Label>الطالب *</Label>
            <Select {...selectProps("studentId")} name="studentId">
              <SelectTrigger>
                <SelectValue placeholder="اختر الطالب" />
              </SelectTrigger>
              <SelectContent>
                {students.map((student) => (
                  <SelectItem key={student.id} value={student.id}>
                    {student.name} — {student.branch} أجزاء
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
            {errors.studentId && (
              <p className="text-xs text-destructive">{errors.studentId.message}</p>
            )}
          </div>

          <div className="grid gap-4 sm:grid-cols-2">
            <div className="space-y-2">
              <Label>المعلم الأول (الأكبر سناً) *</Label>
              <Select {...selectProps("teacher1Id")} name="teacher1Id">
                <SelectTrigger>
                  <SelectValue placeholder="اختر المعلم الأول" />
                </SelectTrigger>
                <SelectContent>
                  {examiners.map((teacher) => (
                    <SelectItem key={teacher.id} value={teacher.id}>
                      {teacher.name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
              {errors.teacher1Id && (
                <p className="text-xs text-destructive">
                  {errors.teacher1Id.message}
                </p>
              )}
            </div>

            <div className="space-y-2">
              <Label>المعلم الثاني (الأصغر سناً) *</Label>
              <Select {...selectProps("teacher2Id")} name="teacher2Id">
                <SelectTrigger>
                  <SelectValue placeholder="اختر المعلم الثاني" />
                </SelectTrigger>
                <SelectContent>
                  {examiners.map((teacher) => (
                    <SelectItem key={teacher.id} value={teacher.id}>
                      {teacher.name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
              {errors.teacher2Id && (
                <p className="text-xs text-destructive">
                  {errors.teacher2Id.message}
                </p>
              )}
            </div>
          </div>

          <div className="grid gap-4 sm:grid-cols-2">
            <div className="space-y-2">
              <Label htmlFor="examDate">تاريخ الاختبار *</Label>
              <Input id="examDate" type="date" {...register("examDate")} />
              {errors.examDate && (
                <p className="text-xs text-destructive">{errors.examDate.message}</p>
              )}
            </div>

            <div className="space-y-2">
              <Label>الفترة *</Label>
              <Select {...selectProps("period")} name="period">
                <SelectTrigger>
                  <SelectValue placeholder="اختر الفترة" />
                </SelectTrigger>
                <SelectContent>
                  {PERIODS.map((period) => (
                    <SelectItem key={period} value={period}>
                      {period}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
              {errors.period && (
                <p className="text-xs text-destructive">{errors.period.message}</p>
              )}
            </div>
          </div>

          {error && (
            <p className="rounded-md bg-destructive/10 px-3 py-2 text-sm text-destructive">
              {error}
            </p>
          )}

          <Button type="submit" className="w-full" disabled={loading}>
            {loading ? "جارٍ التوزيع..." : "إنشاء الجلسة وتوزيع الطالب"}
          </Button>
        </form>
      </CardContent>
    </Card>
  );
}