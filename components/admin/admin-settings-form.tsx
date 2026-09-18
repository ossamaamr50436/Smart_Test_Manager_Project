"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { UploadButton } from "@/lib/uploadthing";
import {
  updateTemplateSettings,
  updateAppearanceSettings,
  updateStudentApplicationFileSetting,
  updateTutorialSectionSetting,
} from "@/lib/actions/settings-actions";

type Props = {
  initialUseTemplateMode: boolean;
  initialPrimaryColor: string;
  initialSecondaryColor: string;
  initialDarkModeEnabled: boolean;
  initialRequireStudentApplicationFile: boolean;
  initialShowTutorialSection: boolean;
};

export function AdminSettingsForm({
  initialUseTemplateMode,
  initialPrimaryColor,
  initialSecondaryColor,
  initialDarkModeEnabled,
  initialRequireStudentApplicationFile,
  initialShowTutorialSection,
}: Props) {
  const router = useRouter();
  const [isPending, startTransition] = useTransition();
  const [useTemplateMode, setUseTemplateMode] = useState(initialUseTemplateMode);
  const [pendingTemplate, setPendingTemplate] = useState<{
    url: string;
    name: string;
  } | null>(null);
  const [primaryColor, setPrimaryColor] = useState(initialPrimaryColor);
  const [secondaryColor, setSecondaryColor] = useState(initialSecondaryColor);
  const [darkModeEnabled, setDarkModeEnabled] = useState(initialDarkModeEnabled);
  const [requireStudentApplicationFile, setRequireStudentApplicationFile] = useState(
    initialRequireStudentApplicationFile
  );
  const [showTutorialSection, setShowTutorialSection] = useState(
    initialShowTutorialSection
  );
  const [error, setError] = useState("");
  const [success, setSuccess] = useState("");

  const uploadButtonAppearance = {
    button:
      "inline-flex h-10 items-center justify-center rounded-md bg-primary px-4 text-sm font-medium text-primary-foreground transition-colors hover:bg-primary/90 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/50",
    allowedContent: "hidden",
  } as const;

  async function handleSaveTemplate() {
    if (isPending) return;
    setError("");
    setSuccess("");
    startTransition(async () => {
      try {
        if (pendingTemplate) {
          await updateTemplateSettings(useTemplateMode, pendingTemplate.url);
        } else {
          await updateTemplateSettings(useTemplateMode);
        }
        setSuccess("تم حفظ إعدادات القالب بنجاح");
        setPendingTemplate(null);
        router.refresh();
      } catch (e) {
        setError(e instanceof Error ? e.message : "حدث خطأ أثناء الحفظ");
      }
    });
  }

  async function handleSaveAppearance() {
    if (isPending) return;
    setError("");
    setSuccess("");
    startTransition(async () => {
      try {
        await updateAppearanceSettings({
          primaryColor,
          secondaryColor,
          darkModeEnabled,
        });
        setSuccess("تم حفظ إعدادات المظهر والحوكمة بنجاح");
        router.refresh();
      } catch (e) {
        setError(e instanceof Error ? e.message : "حدث خطأ أثناء الحفظ");
      }
    });
  }

  async function handleSaveApplicationFileSetting() {
    if (isPending) return;
    setError("");
    setSuccess("");
    startTransition(async () => {
      try {
        await updateStudentApplicationFileSetting(requireStudentApplicationFile);
        setSuccess("تم حفظ إعداد نموذج اختبار الطالب بنجاح");
        router.refresh();
      } catch (e) {
        setError(e instanceof Error ? e.message : "حدث خطأ أثناء الحفظ");
      }
    });
  }

  async function handleSaveTutorialSection() {
    if (isPending) return;
    setError("");
    setSuccess("");
    startTransition(async () => {
      try {
        await updateTutorialSectionSetting(showTutorialSection);
        setSuccess("تم حفظ إعداد قسم التعليم والدور بنجاح");
        router.refresh();
      } catch (e) {
        setError(e instanceof Error ? e.message : "حدث خطأ أثناء الحفظ");
      }
    });
  }

  const colorInputCls =
    "h-10 w-10 cursor-pointer rounded-md border border-border bg-transparent p-0";

  return (
    <div className="space-y-6">
      {error && (
        <p className="rounded-md border border-destructive/20 bg-destructive/10 px-4 py-3 text-sm text-destructive">
          {error}
        </p>
      )}
      {success && (
        <p className="rounded-md border border-primary/20 bg-primary/10 px-4 py-3 text-sm text-primary">
          {success}
        </p>
      )}

      <Card>
        <CardHeader>
          <CardTitle>الحوكمة والمظهر</CardTitle>
          <CardDescription>
            تحكّم كامل بألوان المنصة والوضع المظلم — يُطبَّق فوراً
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-5">
          <div className="grid gap-5 sm:grid-cols-2">
            <div className="space-y-2">
              <Label>اللون الأساسي</Label>
              <div className="flex items-center gap-3">
                <input
                  type="color"
                  value={primaryColor}
                  onChange={(e) => setPrimaryColor(e.target.value)}
                  className={colorInputCls}
                />
                <Input
                  value={primaryColor}
                  onChange={(e) => setPrimaryColor(e.target.value)}
                  dir="ltr"
                  className="w-32"
                />
              </div>
            </div>
            <div className="space-y-2">
              <Label>اللون الثانوي</Label>
              <div className="flex items-center gap-3">
                <input
                  type="color"
                  value={secondaryColor}
                  onChange={(e) => setSecondaryColor(e.target.value)}
                  className={colorInputCls}
                />
                <Input
                  value={secondaryColor}
                  onChange={(e) => setSecondaryColor(e.target.value)}
                  dir="ltr"
                  className="w-32"
                />
              </div>
            </div>
          </div>

          <div className="flex items-center justify-between rounded-lg border p-4">
            <div>
              <Label htmlFor="darkMode">الوضع المظلم</Label>
              <p className="mt-1 text-xs text-muted-foreground">
                تفعيل الوضع المظلم في كامل المنصة
              </p>
            </div>
            <Switch
              id="darkMode"
              checked={darkModeEnabled}
              onCheckedChange={setDarkModeEnabled}
            />
          </div>

<div className="flex items-center justify-between rounded-lg border p-4">
            <div>
              <Label htmlFor="requireAppFile">نموذج اختبار الطالب (PDF)</Label>
              <p className="mt-1 text-xs text-muted-foreground">
                إلزام الجهة المُرشِّحة برفع نموذج الاختبار الممسوح ضوئياً عند
                ترشيح الطالب
              </p>
            </div>
            <Switch
              id="requireAppFile"
              checked={requireStudentApplicationFile}
              onCheckedChange={setRequireStudentApplicationFile}
            />
          </div>

          <div className="flex items-center justify-between rounded-lg border p-4">
            <div>
              <Label htmlFor="showTutorialSection">قسم التعليم والدور</Label>
              <p className="mt-1 text-xs text-muted-foreground">
                إظهار رابط التعليم والدور لكل المستخدمين في صفحة الإعدادات
                والشريط الجانبي
              </p>
            </div>
            <Switch
              id="showTutorialSection"
              checked={showTutorialSection}
              onCheckedChange={setShowTutorialSection}
            />
          </div>

          <Button onClick={handleSaveApplicationFileSetting} disabled={isPending}>
            {isPending ? "جارٍ الحفظ..." : "حفظ إعداد نموذج اختبار الطالب"}
          </Button>

          <Button onClick={handleSaveTutorialSection} disabled={isPending}>
            {isPending ? "جارٍ الحفظ..." : "حفظ إعداد قسم التعليم والدور"}
          </Button>

          <Button onClick={handleSaveApplicationFileSetting} disabled={isPending}>
            {isPending ? "جارٍ الحفظ..." : "حفظ إعداد نموذج اختبار الطالب"}
          </Button>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>إعدادات الشهادات</CardTitle>
          <CardDescription>
            تفعيل القالب الذكي لشهادات PDF
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="flex items-center gap-3">
            <input
              type="checkbox"
              id="useTemplateMode"
              checked={useTemplateMode}
              onChange={(e) => setUseTemplateMode(e.target.checked)}
              className="h-4 w-4"
            />
            <Label htmlFor="useTemplateMode">
              تفعيل القالب الذكي (يجب أن يحتوي القالب على حقول NAME، SCORE، DATE)
            </Label>
          </div>

          {useTemplateMode && (
            <div className="space-y-2">
              <Label>قالب الشهادة (PDF)</Label>
              <div className="flex items-center gap-4">
                <UploadButton
                  endpoint="certificateTemplateUploader"
                  content={{ button: "اختيار ملف قالب" }}
                  appearance={uploadButtonAppearance}
                  onClientUploadComplete={(res) => {
                    const uploaded = res[0];
                    if (!uploaded) return;
                    setPendingTemplate({ url: uploaded.url, name: uploaded.name });
                  }}
                  onUploadError={(err) =>
                    setError(err.message ?? "تعذر رفع قالب الشهادة")
                  }
                />
                {pendingTemplate && (
                  <span className="text-sm text-muted-foreground">
                    {pendingTemplate.name}
                  </span>
                )}
              </div>
              <p className="text-xs text-muted-foreground">
                يجب أن يحتوي ملف PDF على حقول نصية (AcroForm) باسماء NAME، SCORE، DATE
              </p>
            </div>
          )}

          <Button onClick={handleSaveTemplate} disabled={isPending}>
            {isPending ? "جارٍ الحفظ..." : "حفظ إعدادات القالب"}
          </Button>
        </CardContent>
      </Card>
    </div>
  );
}
