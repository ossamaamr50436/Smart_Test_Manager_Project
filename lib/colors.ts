// ============================================================
// أدوات الألوان الديناميكية (Multi-Tenant Branding)
// تحويل Hex إلى HSL بصيغة CSS كاملة لتُستخدم في CSS Variables
// ============================================================

function hexToRgb(hex: string): { r: number; g: number; b: number } {
  const clean = hex.replace("#", "");
  const full = clean.length === 3 ? clean.split("").map((c) => c + c).join("") : clean;
  if (full.length !== 6) throw new Error("لون غير صالح");
  const value = Number.parseInt(full, 16);
  if (Number.isNaN(value)) throw new Error("لون غير صالح");
  return {
    r: (value >> 16) & 255,
    g: (value >> 8) & 255,
    b: value & 255,
  };
}

/**
 * تحويل لون Hex (مثال: #015e63) إلى دالة HSL/CSS كاملة
 * (مثال: hsl(183, 55%, 20%)) — صالحة للاستخدام مباشرة كقيمة CSS.
 */
export function hexToHsl(hex: string): string {
  const { r, g, b } = hexToRgb(hex);
  const rn = r / 255;
  const gn = g / 255;
  const bn = b / 255;

  const max = Math.max(rn, gn, bn);
  const min = Math.min(rn, gn, bn);
  const l = (max + min) / 2;

  let h = 0;
  let s = 0;
  const delta = max - min;
  if (delta !== 0) {
    s = l > 0.5 ? delta / (2 - max - min) : delta / (max + min);
    if (max === rn) {
      h = (gn - bn) / delta + (gn < bn ? 6 : 0);
    } else if (max === gn) {
      h = (bn - rn) / delta + 2;
    } else {
      h = (rn - gn) / delta + 4;
    }
    h *= 60;
  }

  return `hsl(${Math.round(h)}, ${Math.round(s * 100)}%, ${Math.round(l * 100)}%)`;
}