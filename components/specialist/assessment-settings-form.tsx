"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { getAssessmentSettings, updateAssessmentSettings } from "@/lib/actions/assessment-settings-actions";
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

type Settings = {
  errorDeduction: number;
  doubtDeduction: number;
  tajweedDeduction: number;
};

export function AssessmentSettingsForm({ settings }: { settings: Settings }) {
  const router = useRouter();
  const [errorDeduction, setErrorDeduction] = useState(String(settings.errorDeduction));
  const [doubtDeduction, setDoubtDeduction] = useState(String(settings.doubtDeduction));
  const [tajweedDeduction, setTajweedDeduction] = useState(String(settings.tajweedDeduction));
  const [loading, setLoading] = useState(false);
  const [message, setMessage] = useState("");
  const [error, setError] = useState("");

  async function handleSave() {
    setLoading(true);
    setError("");
    setMessage("");
    try {
      await updateAssessmentSettings({
        errorDeduction: Number(errorDeduction),
        doubtDeduction: Number(doubtDeduction),
        tajweedDeduction: Number(tajweedDeduction),
      });
      setMessage("تم حفظ الإعدادات بنجاح");
      router.refresh();
    } catch (e) {
      setError(e instanceof Error ? e.message : "حدث خطأ غير متوقع");
    } finally {
      setLoading(false);
    }
  }

  return (
    <Card className="w-full max-w-xl">
      <CardHeader>
        <CardTitle>إعدادات التقييم</CardTitle>
        <CardDescription>
          اضبط قيم الخصومات المستخدمة في التقييم التفاعلي للمختبرين
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-4">
        <div className="space-y-2">
          <Label htmlFor="errorDeduction">خصم لكل خطأ *</Label>
          <Input
            id="errorDeduction"
            type="number"
            min={0}
            max={10}
            step={0.5}
            value={errorDeduction}
            onChange={(e) => setErrorDeduction(e.target.value)}
          />
          <p className="text-xs text-muted-foreground">
            القيمة الافتراضية: 2.0 — تُخصم من الدرجة عند كل خطأ
          </p>
        </div>

        <div className="space-y-2">
          <Label htmlFor="doubtDeduction">خصم لكل شك (تردد) *</Label>
          <Input
            id="doubtDeduction"
            type="number"
            min={0}
            max={10}
            step={0.5}
            value={doubtDeduction}
            onChange={(e) => setDoubtDeduction(e.target.value)}
          />
          <p className="text-xs text-muted-foreground">
            القيمة الافتراضية: 1.0 — تُخصم من الدرجة عند كل شك
          </p>
        </div>

        <div className="space-y-2">
          <Label htmlFor="tajweedDeduction">خصم لكل تجويد *</Label>
          <Input
            id="tajweedDeduction"
            type="number"
            min={0}
            max={10}
            step={0.5}
            value={tajweedDeduction}
            onChange={(e) => setTajweedDeduction(e.target.value)}
          />
          <p className="text-xs text-muted-foreground">
            القيمة الافتراضية: 0.5 — تُخصم من الدرجة عند كل ملاحظة تجويد
          </p>
        </div>

        {message && (
          <p className="rounded-md bg-emerald-500/10 px-3 py-2 text-sm text-emerald-600">
            {message}
          </p>
        )}
        {error && (
          <p className="rounded-md bg-destructive/10 px-3 py-2 text-sm text-destructive">
            {error}
          </p>
        )}

        <Button onClick={handleSave} disabled={loading}>
          {loading ? "جارٍ الحفظ..." : "حفظ الإعدادات"}
        </Button>
      </CardContent>
    </Card>
  );
}
