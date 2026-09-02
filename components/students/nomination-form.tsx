"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { useForm, Controller } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";

import { createStudentApplication } from "@/lib/actions/student-actions";
import {
  BRANCHES,
  studentApplicationSchema,
  type StudentApplicationInput,
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

export function NominationForm() {
  const router = useRouter();
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);

  const {
    register,
    control,
    handleSubmit,
    formState: { errors },
  } = useForm<StudentApplicationInput>({
    resolver: zodResolver(studentApplicationSchema),
    defaultValues: { branch: undefined, age: undefined },
  });

  async function onSubmit(data: StudentApplicationInput) {
    setError("");
    setLoading(true);
    try {
      await createStudentApplication(data);
      router.push("/dashboard/institution");
      router.refresh();
    } catch (e) {
      setError(e instanceof Error ? e.message : "حدث خطأ غير متوقع");
      setLoading(false);
    }
  }

  return (
    <Card className="w-full max-w-2xl">
      <CardHeader>
        <CardTitle>ترشيح طالب جديد</CardTitle>
        <CardDescription>
          أرسل بيانات الطالب لمراجعتها من قبل أخصائي الاختبارات
        </CardDescription>
      </CardHeader>
      <CardContent>
        <form onSubmit={handleSubmit(onSubmit)} className="space-y-4">
          <div className="grid gap-4 sm:grid-cols-2">
            <div className="space-y-2">
              <Label htmlFor="name">اسم الطالب *</Label>
              <Input id="name" placeholder="اسم الطالب الرباعي" {...register("name")} />
              {errors.name && (
                <p className="text-xs text-destructive">{errors.name.message}</p>
              )}
            </div>

            <div className="space-y-2">
              <Label htmlFor="age">العمر *</Label>
              <Input
                id="age"
                type="number"
                min={4}
                max={18}
                placeholder="مثال: 12"
                {...register("age")}
              />
              {errors.age && (
                <p className="text-xs text-destructive">{errors.age.message}</p>
              )}
            </div>

            <div className="space-y-2">
              <Label>الفرع (عدد الأجزاء المحفوظة) *</Label>
              <Controller
                name="branch"
                control={control}
                render={({ field }) => (
                  <Select onValueChange={field.onChange} value={field.value}>
                    <SelectTrigger>
                      <SelectValue placeholder="اختر عدد الأجزاء" />
                    </SelectTrigger>
                    <SelectContent>
                      {BRANCHES.map((branch) => (
                        <SelectItem key={branch} value={branch}>
                          {branch} أجزاء
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                )}
              />
              {errors.branch && (
                <p className="text-xs text-destructive">{errors.branch.message}</p>
              )}
            </div>

            <div className="space-y-2">
              <Label htmlFor="teacherName">اسم المعلم *</Label>
              <Input id="teacherName" placeholder="اسم معلم الطالب" {...register("teacherName")} />
              {errors.teacherName && (
                <p className="text-xs text-destructive">{errors.teacherName.message}</p>
              )}
            </div>

            <div className="space-y-2">
              <Label htmlFor="parentPhone">رقم ولي الأمر *</Label>
              <Input id="parentPhone" dir="ltr" placeholder="05xxxxxxxx" {...register("parentPhone")} />
              {errors.parentPhone && (
                <p className="text-xs text-destructive">{errors.parentPhone.message}</p>
              )}
            </div>

            <div className="space-y-2">
              <Label htmlFor="phone">رقم الهاتف</Label>
              <Input id="phone" dir="ltr" placeholder="05xxxxxxxx" {...register("phone")} />
              {errors.phone && (
                <p className="text-xs text-destructive">{errors.phone.message}</p>
              )}
            </div>

            <div className="space-y-2 sm:col-span-2">
              <Label htmlFor="address">العنوان</Label>
              <Input id="address" placeholder="عنوان الطالب" {...register("address")} />
              {errors.address && (
                <p className="text-xs text-destructive">{errors.address.message}</p>
              )}
            </div>
          </div>

          {error && (
            <p className="rounded-md bg-destructive/10 px-3 py-2 text-sm text-destructive">
              {error}
            </p>
          )}

          <div className="flex justify-end gap-2">
            <Button
              type="button"
              variant="outline"
              onClick={() => router.push("/dashboard/institution")}
            >
              إلغاء
            </Button>
            <Button type="submit" disabled={loading}>
              {loading ? "جارٍ الإرسال..." : "إرسال الترشيح"}
            </Button>
          </div>
        </form>
      </CardContent>
    </Card>
  );
}