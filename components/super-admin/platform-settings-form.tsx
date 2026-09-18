"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { ExternalLink } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { UploadButton } from "@/lib/uploadthing";
import { usePlatformSettings } from "@/components/providers/settings-provider";
import {
  updatePlatformSettings,
  updateTemplateSettings,
  updateAppearanceSettings,
  updateSupportNumber,
  updateStudentApplicationFileSetting,
  updateTutorialSectionSetting,
  removePlatformLogo,
  type PlatformSettings,
} from "@/lib/actions/settings-actions";

export function PlatformSettingsForm({ initial }: { initial: PlatformSettings }) {
  const router = useRouter();
  const { refreshSettings } = usePlatformSettings();
  const [isPending, startTransition] = useTransition();
  const [platformName, setPlatformName] = useState(initial.platformName);
  const [pendingLogo, setPendingLogo] = useState<{
    url: string;
    fileId: string;
  } | null>(null);
  const [logoPreview, setLogoPreview] = useState<string | null>(initial.logoUrl);
  const [useTemplateMode, setUseTemplateMode] = useState(initial.useTemplateMode);
  const [pendingTemplate, setPendingTemplate] = useState<{
    url: string;
    name: string;
  } | null>(null);
  const [primaryColor, setPrimaryColor] = useState(initial.primaryColor);
  const [secondaryColor, setSecondaryColor] = useState(initial.secondaryColor);
  const [whatsappNumber, setWhatsappNumber] = useState(initial.whatsappNumber ?? "");
  const [darkModeEnabled, setDarkModeEnabled] = useState(initial.darkModeEnabled);
  const [requireStudentApplicationFile, setRequireStudentApplicationFile] = useState(
    initial.requireStudentApplicationFile
  );
  const [showTutorialSection, setShowTutorialSection] = useState(
    initial.showTutorialSection
  );
  const [error, setError] = useState("");
  const [success, setSuccess] = useState("");

  const uploadButtonAppearance = {
    button:
      "inline-flex h-10 items-center justify-center rounded-md bg-primary px-4 text-sm font-medium text-primary-foreground transition-colors hover:bg-primary/90 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/50",
    allowedContent: "hidden",
  } as const;

  async function handleSavePlatform() {
    if (isPending) return;
    setError("");
    setSuccess("");
    startTransition(async () => {
      try {
        if (pendingLogo) {
          await updatePlatformSettings(platformName, pendingLogo);
        } else {
          await updatePlatformSettings(platformName);
        }
        setSuccess("تم حفظ إعدادات المنصة بنجاح");
        setPendingLogo(null);
        router.refresh();
        await refreshSettings();
      } catch (e) {
        setError(e instanceof Error ? e.message : "حدث خطأ أثناء الحفظ");
      }
    });
  }

  async function handleRemoveLogo() {
    if (isPending) return;
    setError("");
    setSuccess("");
    startTransition(async () => {
      try {
        await removePlatformLogo();
        setLogoPreview(null);
        setPendingLogo(null);
        setSuccess("تمت إزالة الشعار — سيُستخدم الشعار الافتراضي");
        router.refresh();
        await refreshSettings();
      } catch (e) {
        setError(e instanceof Error ? e.message : "حدث خطأ أثناء إزالة الشعار");
      }
    });
  }

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

  async function handleSaveSupportNumber() {
    if (isPending) return;
    setError("");
    setSuccess("");
    startTransition(async () => {
      try {
        await updateSupportNumber(whatsappNumber);
        setSuccess("تم حفظ رقم الدعم الفني بنجاح");
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
                  src="/logo.svg"
                  alt="الشعار الافتراضي"
                  className="h-16 w-16 rounded-lg border object-contain"
                />
              )}
              <div>
                <div className="flex items-center gap-2">
                  <UploadButton
                    endpoint="logoUploader"
                    content={{ button: "اختيار شعار جديد" }}
                    appearance={uploadButtonAppearance}
                    onClientUploadComplete={(res) => {
                      const uploaded = res[0];
                      if (!uploaded) return;
                      setPendingLogo({ url: uploaded.url, fileId: uploaded.key });
                      setLogoPreview(uploaded.url);
                    }}
                    onUploadError={(err) =>
                      setError(err.message ?? "تعذر رفع الشعار")
                    }
                  />
                  {initial.logoUrl && (
                    <Button
                      type="button"
                      variant="ghost"
                      size="sm"
                      onClick={handleRemoveLogo}
                      disabled={isPending}
                    >
                      إزالة الشعار
                    </Button>
                  )}
                </div>
                <p className="mt-1 text-xs text-muted-foreground">
                  PNG، JPG، أو WEBP — بحد أقصى 5MB
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

          <Button onClick={handleSaveSupportNumber} disabled={isPending}>
            {isPending ? "جارٍ الحفظ..." : "حفظ رقم الدعم الفني"}
          </Button>

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
                يجب أن يحتوي ملف PDF على حقول نصية (AcroForm) بأسماء NAME، SCORE، DATE
              </p>
            </div>
          )}

          <Button onClick={handleSaveTemplate} disabled={isPending}>
            {isPending ? "جارٍ الحفظ..." : "حفظ إعدادات القالب"}
          </Button>
        </CardContent>
      </Card>

      <Card className="border-amber-200 bg-amber-50">
        <CardHeader>
          <CardTitle className="text-amber-900">📦 إعداد مؤسسة تعليمية جديدة</CardTitle>
          <CardDescription>إنشاء تطبيق على UploadThing لكل مؤسسة</CardDescription>
        </CardHeader>
        <CardContent>
          <p className="mb-4 text-sm text-amber-800">
            كل مؤسسة تحتاج إلى مفتاح API خاص بها على UploadThing. اضغط على الزر
            أدناه للانتقال إلى لوحة التحكم.
          </p>
          <a
            href="https://uploadthing.com/"
            target="_blank"
            rel="noopener noreferrer"
            className="inline-flex items-center gap-2 rounded-lg bg-amber-600 px-4 py-2 text-white transition-colors hover:bg-amber-700"
          >
            <span>🔗 اذهب إلى UploadThing Dashboard</span>
            <ExternalLink className="h-4 w-4" />
          </a>
        </CardContent>
      </Card>
    </div>
  );
}