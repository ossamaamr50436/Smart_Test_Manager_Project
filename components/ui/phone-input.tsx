"use client";

import { useId } from "react";
import PhoneInputLib from "react-phone-number-input";
import "react-phone-number-input/style.css";
import flags from "react-phone-number-input/flags";
import ar from "react-phone-number-input/locale/ar.json";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { validatePhoneE164 } from "@/lib/phone-countries";

// ============================================================
// مكوّن PhoneInput (قاتل الأخطاء — المرحلة 11 + المهمة 7)
// - أعلام حقيقية (SVG) عبر react-phone-number-input/flags
// - أسماء الدول بالعربية (locale/ar.json)
// - الافتراضي: السعودية +966 (defaultCountry="SA")
// - موضع رمز الدولة: يسار الحقل (كتابة الذكية أرقام بأرقام 2)
//   عدد: الحقل dir="ltr" — العلم ورمز الاتصال يبدآن من اليسار
//   ويتلوها حقل الرقم.
// - القيمة النهائية: +966501234567 (E.164)
// ============================================================

type PhoneInputProps = {
  id?: string;
  label: string;
  value: string;
  onChange: (value: string) => void;
  required?: boolean;
  error?: string;
  placeholder?: string;
};

export function PhoneInput({
  id,
  label,
  value,
  onChange,
  required,
  error,
  placeholder = "رقم الهاتف",
}: PhoneInputProps) {
  const generatedId = useId();
  const inputId = id ?? generatedId;

  const isValid = value.length === 0 ? true : validatePhoneE164(value);

  return (
    <div className="space-y-2">
      <Label htmlFor={inputId}>
        {label}
        {required ? " *" : ""}
      </Label>
      {/* dir=ltr يُبقي العلم ورمز الاتصال على اليسار (كما يليق بالأرقام) */}
      <div
        dir="ltr"
        className={`rounded-md border focus-within:ring-2 focus-within:ring-ring focus-within:ring-offset-0 ${
          error ? "border-destructive" : "border-input"
        }`}
      >
        <PhoneInputLib
          international
          addInternationalOption={false}
          defaultCountry="SA"
          flags={flags}
          labels={ar}
          value={value.length > 0 ? value : undefined}
          onChange={(v) => onChange(v ?? "")}
          placeholder={placeholder}
          id={inputId}
          inputComponent={Input}
          className="border-0 shadow-none focus-visible:ring-0 focus-visible:ring-offset-0"
        />
      </div>

      {required && value.length > 0 && !isValid && (
        <p className="text-xs text-destructive">
          رقم هاتف غير صالح — يجب أن يكون أرقاماً فقط (6-15 خانة)
        </p>
      )}
      {error && <p className="text-xs text-destructive">{error}</p>}
    </div>
  );
}

/** التحقق من صحة رقم الهاتف الدولي (E.164 + طول 6-15) */
export function validateInternationalPhone(phone: string): boolean {
  return validatePhoneE164(phone);
}