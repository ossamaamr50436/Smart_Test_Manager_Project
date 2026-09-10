"use client";

import { getBranchLabel } from "@/lib/utils";
import { useState } from "react";
import { useRouter } from "next/navigation";
import { useForm, Controller } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";

import { createStudentApplication } from "@/lib/actions/student-actions";
import {
  BRANCHES,
  NATIONALITIES,
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
import { PhoneInput } from "@/components/ui/phone-input";

const MAX_FILE_SIZE = 20 * 1024 * 1024; // 20MB

export function NominationForm({
  requireApplicationFile = false,
}: {
  requireApplicationFile?: boolean;
}) {
  const router = useRouter();
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);
  const [applicationFile, setApplicationFile] = useState<File | null>(null);

  const {
    register,
    control,
    handleSubmit,
    formState: { errors },
  } = useForm<StudentApplicationInput>({
    resolver: zodResolver(studentApplicationSchema),
    defaultValues: { branch: undefined, age: undefined, nationality: undefined },
  });

  async function onSubmit(data: StudentApplicationInput) {
    setError("");

    // التحقق من رفع نموذج الاختبار عند تفعيل الإعداد
    if (requireApplicationFile && !applicationFile) {
      setError("يجب رفع نموذج اختبار الطالب (PDF) لإكمال الترشيح");
      return;
    }
    if (applicationFile && applicationFile.type !== "application/pdf") {
      setError("نموذج الاختبار يجب أن يكون ملف PDF");
      return;
    }
    if (applicationFile && applicationFile.size > MAX_FILE_SIZE) {
      setError("حجم ملف نموذج الاختبار يتجاوز الحد الأقصى (20MB)");
      return;
    }

    setLoading(true);
    try {
      await createStudentApplication(
        data,
        applicationFile
          ? {
              buffer: await applicationFile.arrayBuffer(),
              fileName: applicationFile.name,
              mimeType: applicationFile.type,
            }
          : undefined
      );
      router.push("/institution");
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
              <Label>الجنسية *</Label>
              <Controller
                name="nationality"
                control={control}
                render={({ field }) => (
                  <Select onValueChange={field.onChange} value={field.value}>
                    <SelectTrigger>
                      <SelectValue placeholder="اختر الجنسية" />
                    </SelectTrigger>
                    <SelectContent>
                      {NATIONALITIES.map((nat) => (
                        <SelectItem key={nat} value={nat}>
                          {nat}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                )}
              />
              {errors.nationality && (
                <p className="text-xs text-destructive">{errors.nationality.message}</p>
              )}
            </div>

            <div className="space-y-2">
              <Label>الفرع *</Label>
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
                          {getBranchLabel(branch)}
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
              <Controller
                name="parentPhone"
                control={control}
                render={({ field }) => (
                  <PhoneInput
                    id="parentPhone"
                    label="رقم ولي الأمر"
                    value={field.value ?? ""}
                    onChange={field.onChange}
                    required
                    error={errors.parentPhone?.message}
                  />
                )}
              />
            </div>

            <div className="space-y-2">
              <Controller
                name="phone"
                control={control}
                render={({ field }) => (
                  <PhoneInput
                    id="phone"
                    label="رقم الهاتف (اختياري)"
                    value={field.value ?? ""}
                    onChange={field.onChange}
                    error={errors.phone?.message}
                  />
                )}
              />
            </div>

            <div className="space-y-2 sm:col-span-2">
              <Label htmlFor="address">العنوان</Label>
              <Input id="address" placeholder="عنوان الطالب" {...register("address")} />
              {errors.address && (
                <p className="text-xs text-destructive">{errors.address.message}</p>
              )}
            </div>
          </div>

          {/* نموذج اختبار الطالب الممسوح (PDF) */}
          <div
            className={`space-y-2 rounded-lg border p-4 ${
              requireApplicationFile ? "border-primary/40 bg-primary/5" : ""
            }`}
          >
            <Label htmlFor="applicationFile">
              نموذج اختبار الطالب (PDF)
              {requireApplicationFile ? " *" : ""}
            </Label>
            <Input
              id="applicationFile"
              type="file"
              accept="application/pdf"
              onChange={(e) => setApplicationFile(e.target.files?.[0] ?? null)}
            />
            <p className="text-xs text-muted-foreground">
              {requireApplicationFile
                ? "هذا الحقل إجباري حالياً — امسح النموذج المطبوعة من الجهة"
                : "اختياري — يُرفع إلى مجلد الجهة على Google Drive"}
            </p>
            {applicationFile && (
              <p className="text-xs font-medium text-primary">
                تم اختيار: {applicationFile.name}
              </p>
            )}
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
              onClick={() => router.push("/institution")}
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
