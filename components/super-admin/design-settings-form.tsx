"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Palette, Shapes, Type } from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardHeader,
  CardTitle,
  CardDescription,
} from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  updateDesignSettings,
  type PlatformSettings,
} from "@/lib/actions/settings-actions";

const RADIUS_OPTIONS = [
  { value: "0rem", label: "حادة (0)" },
  { value: "0.25rem", label: "خفيفة (4px)" },
  { value: "0.5rem", label: "متوسطة (8px)" },
  { value: "0.75rem", label: "ناعمة (12px)" },
  { value: "1rem", label: "دائرية (16px)" },
] as const;

const SHADOW_OPTIONS = [
  { value: "none", label: "بدون ظل" },
  { value: "sm", label: "خفيف" },
  { value: "md", label: "متوسط" },
  { value: "lg", label: "قوي" },
  { value: "xl", label: "قوي جداً" },
] as const;

const BUTTON_STYLE_OPTIONS = [
  { value: "rounded", label: "متوسط الاستدارة" },
  { value: "square", label: "مربع" },
  { value: "pill", label: "حبة الدواء (Pill)" },
] as const;

const FONT_OPTIONS = ["Cairo", "Noto Sans Arabic", "Tahoma", "Arial"] as const;

const SHADOW_STYLES: Record<string, string> = {
  none: "none",
  sm: "0 1px 2px 0 rgb(0 0 0 / 0.05)",
  md: "0 4px 6px -1px rgb(0 0 0 / 0.10)",
  lg: "0 10px 15px -3px rgb(0 0 0 / 0.10)",
  xl: "0 20px 25px -5px rgb(0 0 0 / 0.10)",
};

const COLOR_FIELDS = [
  {
    key: "primaryColor",
    label: "اللون الأساسي",
    description: "التنقل والأزرار الأساسية",
  },
  {
    key: "secondaryColor",
    label: "اللون الثانوي",
    description: "اللمسات الثانوية والتمييز",
  },
  {
    key: "accentColor",
    label: "لون التمييز",
    description: "الأسطح الداكنة والعناوين",
  },
  {
    key: "backgroundColor",
    label: "لون الخلفية",
    description: "خلفية المنصة العامة",
  },
  {
    key: "textColor",
    label: "لون النص",
    description: "النصوص الأساسية",
  },
  {
    key: "borderColor",
    label: "لون الحدود",
    description: "حدود البطاقات والحقول",
  },
] as const;

type ColorKey = (typeof COLOR_FIELDS)[number]["key"];

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

export function DesignSettingsForm({ initial }: { initial: PlatformSettings }) {
  const router = useRouter();
  const [isPending, startTransition] = useTransition();
  const [colors, setColors] = useState({
    primaryColor: initial.primaryColor,
    secondaryColor: initial.secondaryColor,
    accentColor: initial.accentColor,
    backgroundColor: initial.backgroundColor,
    textColor: initial.textColor,
    borderColor: initial.borderColor,
  });
  const [headingFont, setHeadingFont] = useState(initial.headingFont);
  const [bodyFont, setBodyFont] = useState(initial.bodyFont);
  const [radius, setRadius] = useState(initial.borderRadius);
  const [shadow, setShadow] = useState(initial.shadowIntensity);
  const [buttonStyle, setButtonStyle] = useState(initial.buttonStyle);
  const [error, setError] = useState("");
  const [success, setSuccess] = useState("");

  function setColor(key: ColorKey, value: string) {
    setColors((prev) => ({ ...prev, [key]: value }));
  }

  const previewRadius =
    buttonStyle === "square" ? "0px" : buttonStyle === "pill" ? "9999px" : radius;

  function handleSave() {
    if (isPending) return;
    setError("");
    setSuccess("");
    startTransition(async () => {
      try {
        await updateDesignSettings({
          primaryColor: colors.primaryColor,
          secondaryColor: colors.secondaryColor,
          accentColor: colors.accentColor,
          backgroundColor: colors.backgroundColor,
          textColor: colors.textColor,
          borderColor: colors.borderColor,
          headingFont,
          bodyFont,
          borderRadius: radius,
          shadowIntensity: shadow,
          buttonStyle,
        });
        setSuccess("تم حفظ إعدادات التصميم — تُطبَّق مباشرة على جميع الصفحات");
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
            <Palette className="h-5 w-5" />
            الهوية
          </CardTitle>
          <CardDescription>
            الشعار الحالي للمنصة ومعاينة مباشرة للهوية البصرية قبل الحفظ
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-5">
          <div className="flex items-center gap-4">
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img
              src={initial.logoUrl ?? "/logo.svg"}
              alt="شعار المنصة"
              className="h-16 w-16 rounded-lg border object-contain"
            />
            <p className="text-sm text-muted-foreground">
              يتم إدارة شعار المنصة من صفحة «إعدادات المنصة»
            </p>
          </div>

          <div
            className="rounded-lg border p-5"
            style={{
              backgroundColor: colors.backgroundColor,
              color: colors.textColor,
              borderColor: colors.borderColor,
              borderRadius: radius,
              boxShadow: SHADOW_STYLES[shadow] ?? "none",
              fontFamily: bodyFont,
            }}
          >
            <p className="text-sm font-semibold" style={{ color: colors.primaryColor }}>
              منصة مجتاز
            </p>
            <p className="mt-1 text-xs opacity-80">معاينة مباشرة للهوية البصرية — تظهر التغييرات هنا قبل الحفظ.</p>
            <div className="mt-4 flex flex-wrap items-center gap-3">
              <button
                type="button"
                className="px-4 py-2 text-sm font-medium text-white transition-opacity hover:opacity-90"
                style={{ backgroundColor: colors.primaryColor, borderRadius: previewRadius }}
              >
                زر أساسي
              </button>
              <button
                type="button"
                className="px-4 py-2 text-sm font-medium transition-opacity hover:opacity-90"
                style={{
                  backgroundColor: colors.secondaryColor,
                  color: colors.textColor,
                  borderRadius: previewRadius,
                }}
              >
                زر ثانوي
              </button>
              <button
                type="button"
                className="px-4 py-2 text-sm font-medium text-white transition-opacity hover:opacity-90"
                style={{ backgroundColor: colors.primaryColor, borderRadius: previewRadius }}
              >
                تنقل نشط
              </button>
            </div>
            <div
              className="mt-4 rounded-md p-3 text-sm"
              style={{
                backgroundColor: colors.accentColor,
                color: "#ffffff",
                borderRadius: previewRadius,
              }}
            >
              <span className="font-semibold" style={{ fontFamily: headingFont }}>
                عنوان رئيسي
              </span>
              <span className="ms-3 opacity-80">نص توضيحي للخط الأساسي</span>
            </div>
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Palette className="h-5 w-5" />
            الألوان
          </CardTitle>
          <CardDescription>
            الهوية اللونية الكاملة للمنصة — تُطبَّق فوراً عبر متغيرات CSS
          </CardDescription>
        </CardHeader>
        <CardContent>
          <div className="grid gap-5 sm:grid-cols-2">
            {COLOR_FIELDS.map((field) => (
              <ColorRow
                key={field.key}
                label={field.label}
                description={field.description}
                value={colors[field.key]}
                onChange={(value) => setColor(field.key, value)}
              />
            ))}
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Type className="h-5 w-5" />
            Typography
          </CardTitle>
          <CardDescription>الخطوط المستخدمة في العناوين والنصوص</CardDescription>
        </CardHeader>
        <CardContent className="grid gap-5 sm:grid-cols-2">
          <div className="space-y-2">
            <Label>خط العناوين</Label>
            <Select value={headingFont} onValueChange={setHeadingFont}>
              <SelectTrigger>
                <SelectValue placeholder="اختر خط العناوين" />
              </SelectTrigger>
              <SelectContent>
                {FONT_OPTIONS.map((font) => (
                  <SelectItem key={font} value={font}>
                    {font}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <div className="space-y-2">
            <Label>خط النصوص</Label>
            <Select value={bodyFont} onValueChange={setBodyFont}>
              <SelectTrigger>
                <SelectValue placeholder="اختر خط النصوص" />
              </SelectTrigger>
              <SelectContent>
                {FONT_OPTIONS.map((font) => (
                  <SelectItem key={font} value={font}>
                    {font}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Shapes className="h-5 w-5" />
            Shape
          </CardTitle>
          <CardDescription>
            استدارة الزوايا، شدة الظلال، ونمط الأزرار
          </CardDescription>
        </CardHeader>
        <CardContent className="grid gap-5 sm:grid-cols-3">
          <div className="space-y-2">
            <Label>استدارة الزوايا</Label>
            <Select value={radius} onValueChange={setRadius}>
              <SelectTrigger>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {RADIUS_OPTIONS.map((option) => (
                  <SelectItem key={option.value} value={option.value}>
                    {option.label}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <div className="space-y-2">
            <Label>شدة الظلال</Label>
            <Select value={shadow} onValueChange={setShadow}>
              <SelectTrigger>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {SHADOW_OPTIONS.map((option) => (
                  <SelectItem key={option.value} value={option.value}>
                    {option.label}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <div className="space-y-2">
            <Label>نمط الأزرار</Label>
            <Select value={buttonStyle} onValueChange={setButtonStyle}>
              <SelectTrigger>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {BUTTON_STYLE_OPTIONS.map((option) => (
                  <SelectItem key={option.value} value={option.value}>
                    {option.label}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
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