"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Palette } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { updateTenantDesignSettings, type DesignTokens } from "@/lib/actions/settings-actions";

const DESIGN_FIELDS: { key: keyof DesignTokens; label: string; description: string }[] = [
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
  const [error, setError] = useState("");
  const [success, setSuccess] = useState("");

  function setToken(key: keyof DesignTokens, value: string) {
    setTokens((prev) => ({ ...prev, [key]: value }));
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