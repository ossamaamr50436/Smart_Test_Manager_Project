"use client";

import { useState } from "react";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";

// الدول مع رموز الاتصال والأعلام (أبجدية عربية)
export const COUNTRIES = [
  { code: "SA", name: "السعودية", dial: "+966", flag: "\u{1F1F8}\u{1F1E6}", pattern: /^05\d{8}$/ },
  { code: "EG", name: "مصر", dial: "+20", flag: "\u{1F1EA}\u{1F1EC}", pattern: /^01[0125]\d{8}$/ },
  { code: "AE", name: "الإمارات", dial: "+971", flag: "\u{1F1E6}\u{1F1EA}", pattern: /^05\d{8}$/ },
  { code: "KW", name: "الكويت", dial: "+965", flag: "\u{1F1F0}\u{1F1FC}", pattern: /^[569]\d{7}$/ },
  { code: "QA", name: "قطر", dial: "+974", flag: "\u{1F1F6}\u{1F1E6}", pattern: /^[3567]\d{7}$/ },
  { code: "BH", name: "البحرين", dial: "+973", flag: "\u{1F1E7}\u{1F1ED}", pattern: /^[36]\d{7}$/ },
  { code: "OM", name: "عمان", dial: "+968", flag: "\u{1F1F4}\u{1F1F2}", pattern: /^[79]\d{7}$/ },
  { code: "JO", name: "الأردن", dial: "+962", flag: "\u{1F1EF}\u{1F1F4}", pattern: /^[789]\d{8}$/ },
  { code: "PS", name: "فلسطين", dial: "+970", flag: "\u{1F1F5}\u{1F1F8}", pattern: /^5[69]\d{7}$/ },
  { code: "SY", name: "سوريا", dial: "+963", flag: "\u{1F1F8}\u{1F1FE}", pattern: /^9\d{8}$/ },
  { code: "LB", name: "لبنان", dial: "+961", flag: "\u{1F1F1}\u{1F1E7}", pattern: /^[37]\d{7}$/ },
  { code: "IQ", name: "العراق", dial: "+964", flag: "\u{1F1EE}\u{1F1F6}", pattern: /^7\d{9}$/ },
  { code: "YE", name: "اليمن", dial: "+967", flag: "\u{1F1FE}\u{1F1EA}", pattern: /^7\d{8}$/ },
  { code: "SD", name: "السودان", dial: "+249", flag: "\u{1F1F8}\u{1F1E9}", pattern: /^9\d{8}$/ },
  { code: "MA", name: "المغرب", dial: "+212", flag: "\u{1F1F2}\u{1F1E6}", pattern: /^[67]\d{8}$/ },
  { code: "DZ", name: "الجزائر", dial: "+213", flag: "\u{1F1E9}\u{1F1FF}", pattern: /^[567]\d{8}$/ },
  { code: "TN", name: "تونس", dial: "+216", flag: "\u{1F1F9}\u{1F1F3}", pattern: /^[2345]\d{7}$/ },
  { code: "LY", name: "ليبيا", dial: "+218", flag: "\u{1F1F1}\u{1F1FE}", pattern: /^9\d{8}$/ },
  { code: "MR", name: "موريتانيا", dial: "+222", flag: "\u{1F1F2}\u{1F1F7}", pattern: /^[234]\d{7}$/ },
] as const;

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
  // استخراج رمز الدولة من القيمة الحالية
  const selectedCountry = COUNTRIES.find((c) => value.startsWith(c.dial));
  const countryDial = selectedCountry?.dial ?? "+966";
  const countryCode = selectedCountry?.code ?? "SA";
  const localNumber = selectedCountry
    ? value.slice(selectedCountry.dial.length)
    : value;

  function handleCountryChange(newDial: string) {
    const country = COUNTRIES.find((c) => c.dial === newDial);
    if (country) {
      onChange(country.dial + localNumber);
    }
  }

  function handleNumberChange(e: React.ChangeEvent<HTMLInputElement>) {
    const raw = e.target.value.replace(/[^\d]/g, "");
    onChange(countryDial + raw);
  }

  return (
    <div className="space-y-2">
      <Label htmlFor={id}>{label}{required ? " *" : ""}</Label>
      <div className="flex gap-2">
        <Select value={countryCode} onValueChange={(v) => {
          const c = COUNTRIES.find((x) => x.code === v);
          if (c) onChange(c.dial + localNumber);
        }}>
          <SelectTrigger className="w-[140px] shrink-0">
            <SelectValue>
              {selectedCountry ? `${selectedCountry.flag} ${selectedCountry.dial}` : "\u{1F1F8}\u{1F1E6} +966"}
            </SelectValue>
          </SelectTrigger>
          <SelectContent>
            {COUNTRIES.map((c) => (
              <SelectItem key={c.code} value={c.code}>
                {c.flag} {c.name} ({c.dial})
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
        <Input
          id={id}
          type="tel"
          dir="ltr"
          value={localNumber}
          onChange={handleNumberChange}
          placeholder={placeholder}
          className="flex-1"
        />
      </div>
      {error && <p className="text-xs text-destructive">{error}</p>}
    </div>
  );
}

/** التحقق من صحة الرقم international phone */
export function validateInternationalPhone(phone: string): boolean {
  if (!phone || !phone.startsWith("+")) return false;
  for (const country of COUNTRIES) {
    if (phone.startsWith(country.dial)) {
      const local = phone.slice(country.dial.length);
      return country.pattern.test(local) && local.length >= 7 && local.length <= 12;
    }
  }
  return false;
}
