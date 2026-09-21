"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Moon, Palette, Shapes, Type } from "lucide-react";
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
  { value: "pill", label: "حبة الدواء" },
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

const SIDEBAR_COLOR_FIELDS = [
  {
    key: "sidebarBg",
    label: "خلفية الشريط الجانبي",
    description: "خلفية الأعمدة والقوائم",
  },
  {
    key: "sidebarText",
    label: "نص الشريط الجانبي",
    description: "لون النصوص في القوائم",
  },
  {
    key: "sidebarActiveBg",
    label: "خلفية العنصر النشط",
    description: "خلفية الرابط المحدد",
  },
  {
    key: "sidebarActiveText",
    label: "نص العنصر النشط",
    description: "لون نص الرابط المحدد",
  },
] as const;

const TOPBAR_COLOR_FIELDS = [
  {
    key: "topbarBg",
    label: "خلفية الشريط العلوي",
    description: "خلفية الشريط العلوي",
  },
  {
    key: "topbarText",
    label: "نص الشريط العلوي",
    description: "لون النصوص في الشريط العلوي",
  },
] as const;

const LOGIN_COLOR_FIELDS = [
  {
    key: "loginBg",
    label: "خلفية تسجيل الدخول",
    description: "خلفية صفحة تسجيل الدخول",
  },
  {
    key: "loginGradientFrom",
    label: "بداية التدرج",
    description: "بداية التدرج اللوني لخلفية الدخول",
  },
  {
    key: "loginGradientTo",
    label: "نهاية التدرج",
    description: "نهاية التدرج اللوني لخلفية الدخول",
  },
  {
    key: "loginCardBg",
    label: "خلفية بطاقة الدخول",
    description: "خلفية بطاقة تسجيل الدخول",
  },
] as const;

const BUTTON_COLOR_FIELDS = [
  {
    key: "buttonPrimaryBg",
    label: "خلفية الزر الأساسي",
    description: "خلفية الأزرار الأساسية",
  },
  {
    key: "buttonPrimaryText",
    label: "نص الزر الأساسي",
    description: "لون نص الأزرار الأساسية",
  },
  {
    key: "buttonSecondaryBg",
    label: "خلفية الزر الثانوي",
    description: "خلفية الأزرار الثانوية",
  },
  {
    key: "buttonSecondaryText",
    label: "نص الزر الثانوي",
    description: "لون نص الأزرار الثانوية",
  },
] as const;

// ===== Dark Mode Tokens (D1) =====
const DARK_COLOR_FIELDS = [
  {
    key: "primaryColorDark",
    label: "اللون الأساسي الداكن",
    description: "التنقل والأزرار الأساسية في الوضع الداكن",
  },
  {
    key: "secondaryColorDark",
    label: "اللون الثانوي الداكن",
    description: "اللمسات الثانوية في الوضع الداكن",
  },
  {
    key: "accentColorDark",
    label: "لون التمييز الداكن",
    description: "الأسطح الداكنة والعناوين في الوضع الداكن",
  },
  {
    key: "backgroundColorDark",
    label: "خلفية الوضع الداكن",
    description: "خلفية المنصة العامة في الوضع الداكن",
  },
  {
    key: "textColorDark",
    label: "نص الوضع الداكن",
    description: "النصوص الأساسية في الوضع الداكن",
  },
  {
    key: "borderColorDark",
    label: "حدود الوضع الداكن",
    description: "حدود البطاقات والحقول في الوضع الداكن",
  },
] as const;

const DARK_SIDEBAR_COLOR_FIELDS = [
  {
    key: "sidebarBgDark",
    label: "خلفية الشريط الجانبي الداكنة",
    description: "خلفية القوائم في الوضع الداكن",
  },
  {
    key: "sidebarTextDark",
    label: "نص الشريط الجانبي الداكن",
    description: "لون النصوص في القوائم الداكنة",
  },
  {
    key: "sidebarActiveBgDark",
    label: "خلفية العنصر النشط الداكنة",
    description: "خلفية الرابط المحدد في الوضع الداكن",
  },
  {
    key: "sidebarActiveTextDark",
    label: "نص العنصر النشط الداكن",
    description: "لون نص الرابط المحدد في الوضع الداكن",
  },
] as const;

const DARK_TOPBAR_COLOR_FIELDS = [
  {
    key: "topbarBgDark",
    label: "خلفية الشريط العلوي الداكنة",
    description: "خلفية الشريط العلوي في الوضع الداكن",
  },
  {
    key: "topbarTextDark",
    label: "نص الشريط العلوي الداكن",
    description: "لون النصوص في الشريط العلوي الداكن",
  },
] as const;

const DARK_LOGIN_COLOR_FIELDS = [
  {
    key: "loginBgDark",
    label: "خلفية الدخول الداكنة",
    description: "خلفية صفحة تسجيل الدخول في الوضع الداكن",
  },
  {
    key: "loginGradientFromDark",
    label: "بداية التدرج الداكن",
    description: "بداية تدرج خلفية الدخول في الوضع الداكن",
  },
  {
    key: "loginGradientToDark",
    label: "نهاية التدرج الداكن",
    description: "نهاية تدرج خلفية الدخول في الوضع الداكن",
  },
  {
    key: "loginCardBgDark",
    label: "خلفية بطاقة الدخول الداكنة",
    description: "خلفية بطاقة تسجيل الدخول في الوضع الداكن",
  },
] as const;

const DARK_BUTTON_COLOR_FIELDS = [
  {
    key: "buttonPrimaryBgDark",
    label: "خلفية الزر الأساسي الداكنة",
    description: "خلفية الأزرار الأساسية في الوضع الداكن",
  },
  {
    key: "buttonPrimaryTextDark",
    label: "نص الزر الأساسي الداكن",
    description: "لون نص الأزرار الأساسية في الوضع الداكن",
  },
  {
    key: "buttonSecondaryBgDark",
    label: "خلفية الزر الثانوي الداكنة",
    description: "خلفية الأزرار الثانوية في الوضع الداكن",
  },
  {
    key: "buttonSecondaryTextDark",
    label: "نص الزر الثانوي الداكن",
    description: "لون نص الأزرار الثانوية في الوضع الداكن",
  },
] as const;

type SectionColorKey =
  | (typeof SIDEBAR_COLOR_FIELDS)[number]["key"]
  | (typeof TOPBAR_COLOR_FIELDS)[number]["key"]
  | (typeof LOGIN_COLOR_FIELDS)[number]["key"]
  | (typeof BUTTON_COLOR_FIELDS)[number]["key"];

type DarkSectionColorKey =
  | (typeof DARK_SIDEBAR_COLOR_FIELDS)[number]["key"]
  | (typeof DARK_TOPBAR_COLOR_FIELDS)[number]["key"]
  | (typeof DARK_LOGIN_COLOR_FIELDS)[number]["key"]
  | (typeof DARK_BUTTON_COLOR_FIELDS)[number]["key"];

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
    sidebarBg: initial.sidebarBg,
    sidebarText: initial.sidebarText,
    sidebarActiveBg: initial.sidebarActiveBg,
    sidebarActiveText: initial.sidebarActiveText,
    topbarBg: initial.topbarBg,
    topbarText: initial.topbarText,
    loginBg: initial.loginBg,
    loginGradientFrom: initial.loginGradientFrom,
    loginGradientTo: initial.loginGradientTo,
    loginCardBg: initial.loginCardBg,
    buttonPrimaryBg: initial.buttonPrimaryBg,
    buttonPrimaryText: initial.buttonPrimaryText,
    buttonSecondaryBg: initial.buttonSecondaryBg,
    buttonSecondaryText: initial.buttonSecondaryText,
    primaryColorDark: initial.primaryColorDark,
    secondaryColorDark: initial.secondaryColorDark,
    accentColorDark: initial.accentColorDark,
    backgroundColorDark: initial.backgroundColorDark,
    textColorDark: initial.textColorDark,
    borderColorDark: initial.borderColorDark,
    sidebarBgDark: initial.sidebarBgDark,
    sidebarTextDark: initial.sidebarTextDark,
    sidebarActiveBgDark: initial.sidebarActiveBgDark,
    sidebarActiveTextDark: initial.sidebarActiveTextDark,
    topbarBgDark: initial.topbarBgDark,
    topbarTextDark: initial.topbarTextDark,
    loginBgDark: initial.loginBgDark,
    loginGradientFromDark: initial.loginGradientFromDark,
    loginGradientToDark: initial.loginGradientToDark,
    loginCardBgDark: initial.loginCardBgDark,
    buttonPrimaryBgDark: initial.buttonPrimaryBgDark,
    buttonPrimaryTextDark: initial.buttonPrimaryTextDark,
    buttonSecondaryBgDark: initial.buttonSecondaryBgDark,
    buttonSecondaryTextDark: initial.buttonSecondaryTextDark,
  });
  const [headingFont, setHeadingFont] = useState(initial.headingFont);
  const [bodyFont, setBodyFont] = useState(initial.bodyFont);
  const [radius, setRadius] = useState(initial.borderRadius);
  const [shadow, setShadow] = useState(initial.shadowIntensity);
  const [buttonStyle, setButtonStyle] = useState(initial.buttonStyle);
  const [error, setError] = useState("");
  const [success, setSuccess] = useState("");

  function setColor(
    key: ColorKey | SectionColorKey | (typeof DARK_COLOR_FIELDS)[number]["key"] | DarkSectionColorKey,
    value: string
  ) {
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
          sidebarBg: colors.sidebarBg,
          sidebarText: colors.sidebarText,
          sidebarActiveBg: colors.sidebarActiveBg,
          sidebarActiveText: colors.sidebarActiveText,
          topbarBg: colors.topbarBg,
          topbarText: colors.topbarText,
          loginBg: colors.loginBg,
          loginGradientFrom: colors.loginGradientFrom,
          loginGradientTo: colors.loginGradientTo,
          loginCardBg: colors.loginCardBg,
          buttonPrimaryBg: colors.buttonPrimaryBg,
          buttonPrimaryText: colors.buttonPrimaryText,
          buttonSecondaryBg: colors.buttonSecondaryBg,
          buttonSecondaryText: colors.buttonSecondaryText,
          primaryColorDark: colors.primaryColorDark,
          secondaryColorDark: colors.secondaryColorDark,
          accentColorDark: colors.accentColorDark,
          backgroundColorDark: colors.backgroundColorDark,
          textColorDark: colors.textColorDark,
          borderColorDark: colors.borderColorDark,
          sidebarBgDark: colors.sidebarBgDark,
          sidebarTextDark: colors.sidebarTextDark,
          sidebarActiveBgDark: colors.sidebarActiveBgDark,
          sidebarActiveTextDark: colors.sidebarActiveTextDark,
          topbarBgDark: colors.topbarBgDark,
          topbarTextDark: colors.topbarTextDark,
          loginBgDark: colors.loginBgDark,
          loginGradientFromDark: colors.loginGradientFromDark,
          loginGradientToDark: colors.loginGradientToDark,
          loginCardBgDark: colors.loginCardBgDark,
          buttonPrimaryBgDark: colors.buttonPrimaryBgDark,
          buttonPrimaryTextDark: colors.buttonPrimaryTextDark,
          buttonSecondaryBgDark: colors.buttonSecondaryBgDark,
          buttonSecondaryTextDark: colors.buttonSecondaryTextDark,
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
              className="h-24 w-24 rounded-lg border object-contain"
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
            <Moon className="h-5 w-5" />
            الوضع الداكن
          </CardTitle>
          <CardDescription>
            نظام ألوان متكامل للوضع الداكن — تُطبَّق هذه القيم عند تفعيل الوضع الليلي بدل ألوان الوضع النهاري
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-8">
          <div
            className="rounded-lg border p-5"
            style={{
              backgroundColor: colors.backgroundColorDark,
              color: colors.textColorDark,
              borderColor: colors.borderColorDark,
              borderRadius: radius,
              boxShadow: SHADOW_STYLES[shadow] ?? "none",
              fontFamily: bodyFont,
            }}
          >
            <p className="text-sm font-semibold" style={{ color: colors.primaryColorDark }}>
              منصة مجتاز — الوضع الداكن
            </p>
            <p className="mt-1 text-xs" style={{ color: colors.textColorDark, opacity: 0.75 }}>
              معاينة مباشرة لتباين ألوان الوضع الداكن قبل الحفظ.
            </p>
            <div className="mt-4 flex flex-wrap items-center gap-3">
              <button
                type="button"
                className="px-4 py-2 text-sm font-medium transition-opacity hover:opacity-90"
                style={{
                  backgroundColor: colors.buttonPrimaryBgDark,
                  color: colors.buttonPrimaryTextDark,
                  borderRadius: previewRadius,
                }}
              >
                زر أساسي
              </button>
              <button
                type="button"
                className="px-4 py-2 text-sm font-medium transition-opacity hover:opacity-90"
                style={{
                  backgroundColor: colors.buttonSecondaryBgDark,
                  color: colors.buttonSecondaryTextDark,
                  borderRadius: previewRadius,
                }}
              >
                زر ثانوي
              </button>
            </div>
            <div
              className="mt-4 rounded-md p-3 text-sm"
              style={{
                backgroundColor: colors.accentColorDark,
                color: colors.textColorDark,
                borderRadius: previewRadius,
              }}
            >
              <span className="font-semibold" style={{ fontFamily: headingFont }}>
                عنوان في الوضع الداكن
              </span>
              <span className="ms-3 opacity-75">نص توضيحي لتباين النصوص</span>
            </div>
          </div>

          <section className="space-y-4">
            <h3 className="text-sm font-semibold">الخلفيات والنصوص</h3>
            <div className="grid gap-5 sm:grid-cols-2">
              {DARK_COLOR_FIELDS.map((field) => (
                <ColorRow
                  key={field.key}
                  label={field.label}
                  description={field.description}
                  value={colors[field.key]}
                  onChange={(value) => setColor(field.key, value)}
                />
              ))}
            </div>
          </section>

          <section className="space-y-4">
            <h3 className="text-sm font-semibold">الشريط الجانبي الداكن</h3>
            <div
              className="rounded-lg p-4"
              style={{
                backgroundColor: colors.sidebarBgDark,
                color: colors.sidebarTextDark,
              }}
            >
              <p className="text-sm font-semibold">لوحة التحكم</p>
              <div
                className="mt-2 rounded-md px-3 py-2 text-sm"
                style={{
                  backgroundColor: colors.sidebarActiveBgDark,
                  color: colors.sidebarActiveTextDark,
                }}
              >
                القائمة النشطة
              </div>
            </div>
            <div className="grid gap-5 sm:grid-cols-2">
              {DARK_SIDEBAR_COLOR_FIELDS.map((field) => (
                <ColorRow
                  key={field.key}
                  label={field.label}
                  description={field.description}
                  value={colors[field.key]}
                  onChange={(value) => setColor(field.key, value)}
                />
              ))}
            </div>
          </section>

          <section className="space-y-4">
            <h3 className="text-sm font-semibold">الشريط العلوي الداكن</h3>
            <div
              className="flex items-center justify-between rounded-t-lg px-4 py-3"
              style={{ backgroundColor: colors.topbarBgDark, color: colors.topbarTextDark }}
            >
              <p className="text-sm font-semibold">الشريط العلوي</p>
              <p className="text-xs opacity-75">اسم المستخدم</p>
            </div>
            <div className="grid gap-5 sm:grid-cols-2">
              {DARK_TOPBAR_COLOR_FIELDS.map((field) => (
                <ColorRow
                  key={field.key}
                  label={field.label}
                  description={field.description}
                  value={colors[field.key]}
                  onChange={(value) => setColor(field.key, value)}
                />
              ))}
            </div>
          </section>

          <section className="space-y-4">
            <h3 className="text-sm font-semibold">تسجيل الدخول الداكن</h3>
            <div>
              <div
                className="rounded-lg p-4"
                style={{
                  backgroundColor: colors.loginBgDark,
                  backgroundImage: `linear-gradient(160deg, ${colors.loginGradientFromDark} 0%, ${colors.loginGradientToDark} 100%)`,
                }}
              >
                <div
                  className="mx-auto max-w-[200px] rounded-md px-4 py-3 text-center shadow-md"
                  style={{
                    backgroundColor: colors.loginCardBgDark,
                    color: colors.textColorDark,
                  }}
                >
                  <p className="text-sm font-semibold">تسجيل الدخول</p>
                </div>
              </div>
            </div>
            <div className="grid gap-5 sm:grid-cols-2">
              {DARK_LOGIN_COLOR_FIELDS.map((field) => (
                <ColorRow
                  key={field.key}
                  label={field.label}
                  description={field.description}
                  value={colors[field.key]}
                  onChange={(value) => setColor(field.key, value)}
                />
              ))}
            </div>
          </section>

          <section className="space-y-4">
            <h3 className="text-sm font-semibold">الأزرار الداكنة</h3>
            <div className="flex flex-wrap items-center gap-3 rounded-lg border p-4">
              <button
                type="button"
                className="px-4 py-2 text-sm font-medium transition-opacity hover:opacity-90"
                style={{
                  backgroundColor: colors.buttonPrimaryBgDark,
                  color: colors.buttonPrimaryTextDark,
                  borderRadius: previewRadius,
                }}
              >
                زر أساسي
              </button>
              <button
                type="button"
                className="px-4 py-2 text-sm font-medium transition-opacity hover:opacity-90"
                style={{
                  backgroundColor: colors.buttonSecondaryBgDark,
                  color: colors.buttonSecondaryTextDark,
                  borderRadius: previewRadius,
                }}
              >
                زر ثانوي
              </button>
            </div>
            <div className="grid gap-5 sm:grid-cols-2">
              {DARK_BUTTON_COLOR_FIELDS.map((field) => (
                <ColorRow
                  key={field.key}
                  label={field.label}
                  description={field.description}
                  value={colors[field.key]}
                  onChange={(value) => setColor(field.key, value)}
                />
              ))}
            </div>
          </section>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Palette className="h-5 w-5" />
            تفاصيل الواجهة
          </CardTitle>
          <CardDescription>
            الشريط الجانبي، الشريط العلوي، تسجيل الدخول، والأزرار — تُطبَّق فوراً عبر متغيرات CSS
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-8">
          <section className="space-y-4">
            <h3 className="text-sm font-semibold">الشريط الجانبي</h3>
            <div
              className="rounded-lg p-4"
              style={{ backgroundColor: colors.sidebarBg, color: colors.sidebarText }}
            >
              <p className="text-sm font-semibold">لوحة التحكم</p>
              <div
                className="mt-2 rounded-md px-3 py-2 text-sm"
                style={{
                  backgroundColor: colors.sidebarActiveBg,
                  color: colors.sidebarActiveText,
                }}
              >
                القائمة النشطة
              </div>
            </div>
            <div className="grid gap-5 sm:grid-cols-2">
              {SIDEBAR_COLOR_FIELDS.map((field) => (
                <ColorRow
                  key={field.key}
                  label={field.label}
                  description={field.description}
                  value={colors[field.key]}
                  onChange={(value) => setColor(field.key, value)}
                />
              ))}
            </div>
          </section>

          <section className="space-y-4">
            <h3 className="text-sm font-semibold">الشريط العلوي</h3>
            <div
              className="flex items-center justify-between rounded-t-lg px-4 py-3"
              style={{ backgroundColor: colors.topbarBg, color: colors.topbarText }}
            >
              <p className="text-sm font-semibold">الشريط العلوي</p>
              <p className="text-xs opacity-80">اسم المستخدم</p>
            </div>
            <div className="grid gap-5 sm:grid-cols-2">
              {TOPBAR_COLOR_FIELDS.map((field) => (
                <ColorRow
                  key={field.key}
                  label={field.label}
                  description={field.description}
                  value={colors[field.key]}
                  onChange={(value) => setColor(field.key, value)}
                />
              ))}
            </div>
          </section>

          <section className="space-y-4">
            <h3 className="text-sm font-semibold">تسجيل الدخول</h3>
            <div>
              <div
                className="rounded-lg p-4"
                style={{
                  backgroundColor: colors.loginBg,
                  backgroundImage: `linear-gradient(160deg, ${colors.loginGradientFrom} 0%, ${colors.loginGradientTo} 100%)`,
                }}
              >
                <div
                  className="mx-auto max-w-[200px] rounded-md px-4 py-3 text-center shadow-md"
                  style={{ backgroundColor: colors.loginCardBg, color: colors.textColor }}
                >
                  <p className="text-sm font-semibold">تسجيل الدخول</p>
                </div>
              </div>
            </div>
            <div className="grid gap-5 sm:grid-cols-2">
              {LOGIN_COLOR_FIELDS.map((field) => (
                <ColorRow
                  key={field.key}
                  label={field.label}
                  description={field.description}
                  value={colors[field.key]}
                  onChange={(value) => setColor(field.key, value)}
                />
              ))}
            </div>
          </section>

          <section className="space-y-4">
            <h3 className="text-sm font-semibold">الأزرار</h3>
            <div className="flex flex-wrap items-center gap-3 rounded-lg border p-4">
              <button
                type="button"
                className="px-4 py-2 text-sm font-medium transition-opacity hover:opacity-90"
                style={{
                  backgroundColor: colors.buttonPrimaryBg,
                  color: colors.buttonPrimaryText,
                  borderRadius: previewRadius,
                }}
              >
                زر أساسي
              </button>
              <button
                type="button"
                className="px-4 py-2 text-sm font-medium transition-opacity hover:opacity-90"
                style={{
                  backgroundColor: colors.buttonSecondaryBg,
                  color: colors.buttonSecondaryText,
                  borderRadius: previewRadius,
                }}
              >
                زر ثانوي
              </button>
            </div>
            <div className="grid gap-5 sm:grid-cols-2">
              {BUTTON_COLOR_FIELDS.map((field) => (
                <ColorRow
                  key={field.key}
                  label={field.label}
                  description={field.description}
                  value={colors[field.key]}
                  onChange={(value) => setColor(field.key, value)}
                />
              ))}
            </div>
          </section>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Type className="h-5 w-5" />
            الخطوط
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
            الشكل العام
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