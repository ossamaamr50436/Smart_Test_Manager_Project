"use client";

import { useState, useRef, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import {
  updatePlatformSettings,
  updateTemplateSettings,
  updateAppearanceSettings,
} from "@/lib/actions/settings-actions";

type Props = {
  initialPlatformName: string;
  initialLogoUrl: string | null;
  initialUseTemplateMode: boolean;
  initialPrimaryColor: string;
  initialSecondaryColor: string;
  initialWhatsappNumber: string | null;
  initialDarkModeEnabled: boolean;
};

export function AdminSettingsForm({
  initialPlatformName,
  initialLogoUrl,
  initialUseTemplateMode,
  initialPrimaryColor,
  initialSecondaryColor,
  initialWhatsappNumber,
  initialDarkModeEnabled,
}: Props) {
  const router = useRouter();
  const [isPending, startTransition] = useTransition();
  const [platformName, setPlatformName] = useState(initialPlatformName);
  const [logoFile, setLogoFile] = useState<File | null>(null);
  const [logoPreview, setLogoPreview] = useState<string | null>(initialLogoUrl);
  const [useTemplateMode, setUseTemplateMode] = useState(initialUseTemplateMode);
  const [templateFile, setTemplateFile] = useState<File | null>(null);
  const [primaryColor, setPrimaryColor] = useState(initialPrimaryColor);
  const [secondaryColor, setSecondaryColor] = useState(initialSecondaryColor);
  const [whatsappNumber, setWhatsappNumber] = useState(initialWhatsappNumber ?? "");
  const [darkModeEnabled, setDarkModeEnabled] = useState(initialDarkModeEnabled);
  const [error, setError] = useState("");
  const [success, setSuccess] = useState("");
  const logoInputRef = useRef<HTMLInputElement>(null);
  const templateInputRef = useRef<HTMLInputElement>(null);

  function handleLogoChange(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (file) {
      setLogoFile(file);
      const reader = new FileReader();
      reader.onload = (ev) => setLogoPreview(ev.target?.result as string);
      reader.readAsDataURL(file);
    }
  }

  function handleTemplateChange(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (file) {
      setTemplateFile(file);
    }
  }

  async function handleSavePlatform() {
    setError("");
    setSuccess("");
    startTransition(async () => {
      try {
        if (logoFile) {
          const arrayBuffer = await logoFile.arrayBuffer();
          await updatePlatformSettings(platformName, {
            buffer: arrayBuffer,
            fileName: logoFile.name,
            mimeType: logoFile.type,
          });
        } else {
          await updatePlatformSettings(platformName);
        }
        setSuccess("تم حفظ إعدادات المنصة بنجاح");
        router.refresh();
      } catch (e) {
        setError(e instanceof Error ? e.message : "حدث خطأ أثناء الحفظ");
      }
    });
  }

  async function handleSaveTemplate() {
    setError("");
    setSuccess("");
    startTransition(async () => {
      try {
        if (templateFile) {
          const arrayBuffer = await templateFile.arrayBuffer();
          await updateTemplateSettings(useTemplateMode, {
            buffer: arrayBuffer,
            fileName: templateFile.name,
            mimeType: templateFile.type,
          });
        } else {
          await updateTemplateSettings(useTemplateMode);
        }
        setSuccess("تم حفظ إعدادات القالب بنجاح");
        router.refresh();
      } catch (e) {
        setError(e instanceof Error ? e.message : "حدث خطأ أثناء الحفظ");
      }
    });
  }

  async function handleSaveAppearance() {
    setError("");
    setSuccess("");
    startTransition(async () => {
      try {
        await updateAppearanceSettings({
          primaryColor,
          secondaryColor,
          whatsappNumber,
          darkModeEnabled,
        });
        setSuccess("تم حفظ إعدادات المظهر والحوكمة بنجاح");
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
          <CardTitle>الاسم والشعار</CardTitle>
          <CardDescription>
            غيّر اسم المنصة وشعارها — ينعكس التغيير فوراً على جميع الصفحات
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="space-y-2">
            <Label htmlFor="platformName">اسم المنصة</Label>
            <Input
              id="platformName"
              value={platformName}
              onChange={(e) => setPlatformName(e.target.value)}
              placeholder="اسم المنصة"
              dir="rtl"
            />
          </div>

          <div className="space-y-2">
            <Label>الشعار الحالي</Label>
            <div className="flex items-center gap-4">
              {logoPreview ? (
                /* eslint-disable-next-line @next/next/no-img-element */
                <img
                  src={logoPreview}
                  alt="الشعار"
                  className="h-16 w-16 rounded-lg border object-contain"
                />
              ) : (
                /* eslint-disable-next-line @next/next/no-img-element */
                <img
                  src="/logo.png"
                  alt="الشعار الافتراضي"
                  className="h-16 w-16 rounded-lg border object-contain"
                />
              )}
              <div>
                <input
                  ref={logoInputRef}
                  type="file"
                  accept="image/png,image/jpeg,image/svg+xml"
                  className="hidden"
                  onChange={handleLogoChange}
                />
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  onClick={() => logoInputRef.current?.click()}
                >
                  اختيار شعار جديد
                </Button>
                <p className="mt-1 text-xs text-muted-foreground">
                  PNG، JPG، أو SVG
                </p>
              </div>
            </div>
          </div>

          <Button onClick={handleSavePlatform} disabled={isPending}>
            {isPending ? "جارٍ الحفظ..." : "حفظ إعدادات المنصة"}
          </Button>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>الحوكمة والمظهر</CardTitle>
          <CardDescription>
            تحكّم كامل بألوان المنصة ورقم الدعم الفني والوضع المظلم — يُطبَّق فوراً
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

          <div className="space-y-2">
            <Label>رقم الواتساب (الدعم الفني)</Label>
            <Input
              value={whatsappNumber}
              onChange={(e) => setWhatsappNumber(e.target.value)}
              placeholder="966501234567"
              dir="ltr"
            />
            <p className="text-xs text-muted-foreground">
              بصيغة دولية بدون + أو أصفار بادئة — يُستخدم في الشريط الجانبي
            </p>
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

          <Button onClick={handleSaveAppearance} disabled={isPending}>
            {isPending ? "جارٍ الحفظ..." : "حفظ إعدادات المظهر والحوكمة"}
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
                <input
                  ref={templateInputRef}
                  type="file"
                  accept="application/pdf"
                  className="hidden"
                  onChange={handleTemplateChange}
                />
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  onClick={() => templateInputRef.current?.click()}
                >
                  اختيار ملف قالب
                </Button>
                {templateFile && (
                  <span className="text-sm text-muted-foreground">
                    {templateFile.name}
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
