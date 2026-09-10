"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { Search, ChevronDown } from "lucide-react";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  COUNTRY_OPTIONS,
  countryFromValue,
  validatePhoneE164,
  type CountryOption,
} from "@/lib/phone-countries";

// ============================================================
// مكوّن PhoneInput احترافي (المرحلة 11)
// - على اليسار: العلم + رمز الاتصال (فتح قائمة بحث عربي/إنجليزي)
// - على اليمين مباشرة وملاصقاً: حقل إدخال الرقم (أرقام فقط)
// - التحقق: أرقام فقط، طول 6-15
// - القيمة النهائية: +966501234567
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

// الدولة الافتراضية عند غياب أي اختيار أو عدم تطابق (ثابتة خارج المكوّن)
const DEFAULT_COUNTRY: CountryOption = {
  code: "SA",
  name: "Saudi Arabia",
  ar: "السعودية",
  flag: "🇸🇦",
  dial: "+966",
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
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState("");
  const containerRef = useRef<HTMLDivElement>(null);

  const country: CountryOption = useMemo(
    () =>
      value.startsWith("+")
        ? countryFromValue(value)
        : (COUNTRY_OPTIONS[0] ?? DEFAULT_COUNTRY),
    [value]
  );

  const localNumber = country ? value.slice(country.dial.length) : "";

  // إغلاق القائمة عند الضغط خارج المكوّن
  useEffect(() => {
    function handleClickOutside(event: MouseEvent) {
      if (
        containerRef.current &&
        !containerRef.current.contains(event.target as Node)
      ) {
        setOpen(false);
      }
    }
    document.addEventListener("mousedown", handleClickOutside);
    return () => document.removeEventListener("mousedown", handleClickOutside);
  }, []);

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return COUNTRY_OPTIONS;
    return COUNTRY_OPTIONS.filter(
      (c) =>
        c.ar.toLowerCase().includes(q) ||
        c.name.toLowerCase().includes(q) ||
        c.dial.includes(q)
    );
  }, [query]);

  function selectCountry(c: CountryOption) {
    onChange(c.dial + localNumber.replace(/[^\d]/g, ""));
    setOpen(false);
    setQuery("");
  }

  function handleNumberChange(e: React.ChangeEvent<HTMLInputElement>) {
    const digits = e.target.value.replace(/[^\d]/g, "").slice(0, 15);
    onChange(country.dial + digits);
  }

  const isValid = value.length === 0 ? true : validatePhoneE164(value);

  return (
    <div className="space-y-2">
      <Label htmlFor={id}>
        {label}
        {required ? " *" : ""}
      </Label>
      <div ref={containerRef} className="relative">
        <div
          className={`flex overflow-hidden rounded-md border bg-background focus-within:ring-2 focus-within:ring-ring focus-within:ring-offset-0 ${
            error ? "border-destructive" : "border-input"
          }`}
        >
          {/* الجزء الأيسر: العلم + رمز الاتصال */}
          <button
            type="button"
            onClick={() => setOpen((v) => !v)}
            className="flex shrink-0 items-center gap-1.5 border-e bg-muted/40 px-3 py-2 text-sm font-medium transition-colors hover:bg-muted"
            aria-label="اختيار الدولة"
          >
            <span aria-hidden>{country?.flag ?? "🇸🇦"}</span>
            <span dir="ltr" className="tabular-nums">
              {country?.dial ?? "+966"}
            </span>
            <ChevronDown className="h-3.5 w-3.5 opacity-60" />
          </button>

          {/* الجزء الأيمن ملاصقاً: حقل الرقم (أرقام فقط) */}
          <Input
            id={id}
            type="tel"
            dir="ltr"
            className="rounded-none border-0 text-right shadow-none focus-visible:ring-0 focus-visible:ring-offset-0"
            value={localNumber}
            onChange={handleNumberChange}
            placeholder={placeholder}
          />
        </div>

        {/* القائمة المنسدلة مع البحث */}
        {open && (
          <div className="absolute z-50 mt-1 w-full overflow-hidden rounded-md border bg-background shadow-lg">
            <div className="flex items-center gap-2 border-b p-2">
              <Search className="h-4 w-4 shrink-0 opacity-50" />
              <input
                autoFocus
                type="text"
                value={query}
                onChange={(e) => setQuery(e.target.value)}
                placeholder="ابحث عن الدولة بالعربية أو الإنجليزية..."
                className="w-full bg-transparent text-sm outline-none placeholder:text-muted-foreground"
              />
            </div>
            <ul className="max-h-56 overflow-y-auto py-1">
              {filtered.length === 0 && (
                <li className="px-3 py-2 text-sm text-muted-foreground">
                  لا توجد نتائج
                </li>
              )}
              {filtered.map((c) => (
                <li key={c.code}>
                  <button
                    type="button"
                    onClick={() => selectCountry(c)}
                    className={`flex w-full items-center gap-2 px-3 py-1.5 text-sm hover:bg-muted ${
                      country?.code === c.code ? "bg-muted/60 font-medium" : ""
                    }`}
                  >
                    <span aria-hidden>{c.flag}</span>
                    <span className="text-right">{c.ar}</span>
                    <span className="ms-auto text-xs text-muted-foreground tabular-nums" dir="ltr">
                      {c.dial}
                    </span>
                  </button>
                </li>
              ))}
            </ul>
          </div>
        )}
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