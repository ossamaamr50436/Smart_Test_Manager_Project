"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { ImagePlus, Loader2, Palette } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { UploadButton } from "@/lib/uploadthing";
import {
  updateTenantDesignSettings,
  updateTenantLogo,
  removeTenantLogo,
  type DesignTokens,
} from "@/lib/actions/settings-actions";
import { DEFAULT_PLATFORM_LOGO, PLATFORM_LOGO_ALT } from "@/lib/platform-brand";

const logoUploadButtonAppearance = {
  button:
    "inline-flex h-10 items-center justify-center gap-2 rounded-md border border-border bg-secondary px-4 text-sm font-medium text-secondary-foreground shadow-sm transition-all duration-150 hover:bg-secondary-200 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-secondary-300 focus-visible:ring-offset-1 focus-visible:ring-offset-background disabled:pointer-events-none disabled:opacity-50",
  allowedContent: "hidden",
} as const;

type ColorKey = Exclude<keyof DesignTokens, "logoUrl" | "logoFileId">;

const DESIGN_FIELDS: { key: ColorKey; label: string; description: string }[] = [
  { key: "primaryColor", label: "اللون الأساسي", description: "التنقل والأزرار الأساسية" },
  { key: "secondaryColor", label: "اللون الثانوي", description: "اللمسات الثانوية والتمييز" },
  { key: "accentColor", label: "لون التمييز", description: "الأسطح الداكنة والعناوين" },
  { key: "backgroundColor", label: "لون الخلفية", description: "خلفية المنصة العامة" },
  { key: "textColor", label: "لون النص", description: "النصوص الأساسية" },
  { key: "borderColor", label: "لون الحدود", description: "حدود البطاقات والحقول" },
  { key: "sidebarBg", label: "خلفية الشريط الجانبي", description: "خلفية الأعمدة والقوائم" },
  { key: "sidebarText", label: "نص الشريط الجانبي", description: "لون النصوص في القوائم" },
  { key: "topbarBg", label: "خلفية الشريط العلوي", description: "خلفية الشريط العلوي" },
  { key: "topbarText", label: "نص الشريط العلوي", description: "لون النصوص في الشريط العلوي" },
  { key: "loginBg", label: "خلفية تسجيل الدخول", description: "خلفية صفحة تسجيل الدخول" },
  { key: "loginCardBg", label: "خلفية بطاقة الدخول", description: "خلفية بطاقة تسجيل الدخول" },
  { key: "buttonPrimaryBg", label: "خلفية الزر الأساسي", description: "خلفية الأزرار الأساسية" },
  { key: "buttonPrimaryText", label: "نص الزر الأساسي", description: "لون نص الأزرار الأساسية" },
  { key: "buttonSecondaryBg", label: "خلفية الزر الثانوي", description: "خلفية الأزرار الثانوية" },
  { key: "buttonSecondaryText", label: "نص الزر الثانوي", description: "لون نص الأزرار الثانوية" },
];

function ColorRow({
  label,
  description,
  value,
  onChange,
}: {
  label: string;
  description: string;
  value: string;
  onChange: (value: string) => void;
}) {
  return (
    <div className="space-y-2">
      <Label>{label}</Label>
      <div className="flex items-center gap-3">
        <input
          type="color"
          value={value}
          onChange={(e) => onChange(e.target.value)}
          className="h-10 w-10 cursor-pointer rounded-md border border-border bg-transparent p-0"
          aria-label={label}
        />
        <Input
          value={value}
          onChange={(e) => onChange(e.target.value)}
          dir="ltr"
          className="w-32"
        />
      </div>
      <p className="text-xs text-muted-foreground">{description}</p>
    </div>
  );
}

export function TenantDesignSettingsForm({
  initial,
  hasOverrides,
}: {
  initial: DesignTokens;
  hasOverrides: boolean;
}) {
  const router = useRouter();
  const [isPending, startTransition] = useTransition();
  const [tokens, setTokens] = useState(initial);
  const [pendingLogo, setPendingLogo] = useState<{
    url: string;
    fileId: string;
  } | null>(null);
  const [logoPreview, setLogoPreview] = useState<string | null>(initial.logoUrl);
  const [error, setError] = useState("");
  const [success, setSuccess] = useState("");

  function setToken(key: keyof DesignTokens, value: string) {
    setTokens((prev) => ({ ...prev, [key]: value }));
  }

  function handleSaveLogo() {
    if (isPending || !pendingLogo) return;
    setError("");
    setSuccess("");
    startTransition(async () => {
      try {
        await updateTenantLogo(pendingLogo);
        setPendingLogo(null);
        setSuccess("تم تحديث شعار الجهة — يظهر في الشريطين الجانبي والعلوي فقط");
        router.refresh();
      } catch (e) {
        setError(e instanceof Error ? e.message : "حدث خطأ أثناء حفظ الشعار");
      }
    });
  }

  function handleRemoveLogo() {
    if (isPending) return;
    setError("");
    setSuccess("");
    startTransition(async () => {
      try {
        await removeTenantLogo();
        setLogoPreview(null);
        setPendingLogo(null);
        setSuccess("تمت إزالة شعار الجهة — سيُستخدم شعار المنصة الافتراضي");
        router.refresh();
      } catch (e) {
        setError(e instanceof Error ? e.message : "حدث خطأ أثناء إزالة الشعار");
      }
    });
  }

  function handleSave() {
    if (isPending) return;
    setError("");
    setSuccess("");
    startTransition(async () => {
      try {
        await updateTenantDesignSettings(tokens);
        setSuccess("تم حفظ إعدادات التصميم — تُطبَّق على جهتك فقط");
        router.refresh();
      } catch (e) {
        setError(e instanceof Error ? e.message : "حدث خطأ أثناء الحفظ");
      }
    });
  }

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
          <CardTitle className="flex items-center gap-2">
            <ImagePlus className="h-5 w-5" />
            شعار الجهة
          </CardTitle>
          <CardDescription>
            شعار خاص بجهتك فقط — يظهر في الشريط الجانبي والعلوي للوحة.
            إزالته تعيد عرض شعار المنصة الافتراضي. لا يغيّر شعار المنصة العام ولا شعار تسجيل الدخول.
          </CardDescription>
        </CardHeader>
        <CardContent>
          <div className="flex items-center gap-4">
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img
              src={logoPreview ?? DEFAULT_PLATFORM_LOGO}
              alt={PLATFORM_LOGO_ALT}
              className="h-24 w-24 rounded-2xl border object-cover shadow-sm"
            />
            <div>
              <div className="flex flex-wrap items-center gap-2">
                <UploadButton
                  endpoint="logoUploader"
                  content={{
                    button: ({ isUploading, uploadProgress }) => (
                      <span className="inline-flex items-center justify-center gap-2">
                        {isUploading ? (
                          <Loader2 className="h-4 w-4 animate-spin" aria-hidden="true" />
                        ) : (
                          <ImagePlus className="h-4 w-4 shrink-0" aria-hidden="true" />
                        )}
                        {isUploading
                          ? `جارٍ الرفع… ${Math.round(uploadProgress)}%`
                          : "اختيار شعار جديد"}
                      </span>
                    ),
                  }}
                  appearance={logoUploadButtonAppearance}
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
                {pendingLogo && (
                  <Button onClick={handleSaveLogo} disabled={isPending} size="sm">
                    {isPending ? "جارٍ الحفظ..." : "حفظ الشعار"}
                  </Button>
                )}
                {logoPreview && !pendingLogo && (
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
              <p className="mt-2 text-xs text-muted-foreground">
                PNG، JPG، أو WEBP — بحد أقصى 5MB. يبقى الشعار داخل حاوية دائرية بدون تشويه.
              </p>
            </div>
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Palette className="h-5 w-5" />
            ألوان الجهة
          </CardTitle>
          <CardDescription>
            {hasOverrides
              ? "هذه القيم مخصصة لجهتك — تتجاوز افتراضيات المنصة للجميع"
              : "لم تُخصّص قيم بعد — يتم استخدام افتراضيات المنصة. عدّل وإحفظ لتفعيل التخصيص."}
          </CardDescription>
        </CardHeader>
        <CardContent>
          <div className="grid gap-5 sm:grid-cols-2">
            {DESIGN_FIELDS.map((field) => (
              <ColorRow
                key={field.key}
                label={field.label}
                description={field.description}
                value={tokens[field.key]}
                onChange={(value) => setToken(field.key, value)}
              />
            ))}
          </div>
        </CardContent>
      </Card>

      <div className="flex justify-end">
        <Button onClick={handleSave} disabled={isPending} size="lg">
          {isPending ? "جارٍ الحفظ..." : "حفظ إعدادات التصميم"}
        </Button>
      </div>
    </div>
  );
}