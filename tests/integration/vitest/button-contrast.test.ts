import { describe, it, expect, beforeAll } from "vitest";
import fs from "node:fs";
import path from "node:path";
import type { VariantProps } from "class-variance-authority";
import { buttonVariants } from "@/components/ui/button";

type VariantName = NonNullable<VariantProps<typeof buttonVariants>["variant"]>;

const ROOT = process.cwd();

function readFile(relativePath: string): string {
  return fs.readFileSync(path.join(ROOT, relativePath), "utf8");
}

function escapeRegExp(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

function parseVarBlock(css: string, selector: string): Record<string, string> {
  const found: Record<string, string> = {};
  const blockPattern = new RegExp(
    `(^|[}\\s])${escapeRegExp(selector)}\\s*\\{([^}]*)\\}`,
    "gm"
  );
  let block = blockPattern.exec(css);
  while (block !== null) {
    const body = block[2] ?? "";
    const varPattern = /(--[a-z0-9-]+)\s*:\s*([^;]+);/gi;
    let entry = varPattern.exec(body);
    while (entry !== null) {
      const name = entry[1];
      const value = (entry[2] ?? "").trim();
      if (name && !name.endsWith("-dark")) found[name] = value;
      entry = varPattern.exec(body);
    }
    block = blockPattern.exec(css);
  }
  return found;
}

function normalizeHex(value: string): string {
  const trimmed = value.trim().toLowerCase();
  const bare = trimmed.startsWith("#") ? trimmed.slice(1) : trimmed;
  if (!/^[0-9a-f]{3}$|^[0-9a-f]{6}$/.test(bare)) {
    throw new Error(`Unsupported color value: ${value}`);
  }
  return bare.length === 3
    ? bare
        .split("")
        .map((char) => char + char)
        .join("")
    : bare;
}

function relativeLuminance(hex: string): number {
  const channels = Array.from(normalizeHex(hex).match(/.{2}/g) ?? []).map((pair) => {
    const ratio = parseInt(pair, 16) / 255;
    return ratio <= 0.03928 ? ratio / 12.92 : Math.pow((ratio + 0.055) / 1.055, 2.4);
  });
  const [r, g, b] = channels as [number, number, number];
  return 0.2126 * r + 0.7152 * g + 0.0722 * b;
}

function contrastRatio(foreground: string, background: string): number {
  const first = relativeLuminance(foreground);
  const second = relativeLuminance(background);
  return (Math.max(first, second) + 0.05) / (Math.min(first, second) + 0.05);
}

const STATIC_COLORS: Record<string, string> = {
  "text-white": "#ffffff",
  "from-red-500": "#ef4444",
  "from-red-600": "#dc2626",
  "from-red-700": "#b91c1c",
  "to-red-600": "#dc2626",
  "to-red-700": "#b91c1c",
  "hover:from-red-600": "#dc2626",
  "hover:to-red-700": "#b91c1c",
  "hover:from-red-700": "#b91c1c",
  "hover:to-red-800": "#991b1b",
};

const VAR_COLORS: Record<string, string> = {
  "text-foreground": "--foreground",
  "text-primary": "--primary",
  "bg-background": "--background",
  "bg-accent": "--accent",
  "text-accent-foreground": "--accent-foreground",
  "text-destructive-foreground": "--destructive-foreground",
};

const BUTTON_TOKENS = [
  "--button-primary-bg",
  "--button-primary-text",
  "--button-secondary-bg",
  "--button-secondary-text",
] as const;

const EXPECTED_LIGHT: Record<(typeof BUTTON_TOKENS)[number], string> = {
  "--button-primary-bg": "#015e63",
  "--button-primary-text": "#ffffff",
  "--button-secondary-bg": "#d3bb8b",
  "--button-secondary-text": "#0f172a",
};

const EXPECTED_DARK: Record<(typeof BUTTON_TOKENS)[number], string> = {
  "--button-primary-bg": "#0e6e73",
  "--button-primary-text": "#ffffff",
  "--button-secondary-bg": "#d3bb8b",
  "--button-secondary-text": "#0f172a",
};

const DB_KEYS: Record<(typeof BUTTON_TOKENS)[number], { light: string; dark: string }> = {
  "--button-primary-bg": { light: "buttonPrimaryBg", dark: "buttonPrimaryBgDark" },
  "--button-primary-text": { light: "buttonPrimaryText", dark: "buttonPrimaryTextDark" },
  "--button-secondary-bg": { light: "buttonSecondaryBg", dark: "buttonSecondaryBgDark" },
  "--button-secondary-text": {
    light: "buttonSecondaryText",
    dark: "buttonSecondaryTextDark",
  },
};

const globalsCss = readFile("app/globals.css");
const layoutSource = readFile("app/layout.tsx");
const buttonSource = readFile("components/ui/button.tsx");

const lightTokens = parseVarBlock(globalsCss, ":root");
const darkTokens = parseVarBlock(globalsCss, ".dark");

function classesOf(variant: VariantName): string[] {
  return buttonVariants({ variant }).split(/\s+/).filter(Boolean);
}

function resolveClass(
  className: string | undefined,
  mode: "light" | "dark"
): string | null {
  if (!className) return null;
  const tokens = mode === "light" ? lightTokens : darkTokens;

  const arbitrary = /^(?:bg|text)-\[color:var\((--[a-z0-9-]+)\)\]$/.exec(className);
  if (arbitrary?.[1]) return tokens[arbitrary[1]] ?? null;

  const arbitraryPlain = /^(?:bg|text)-\[var\((--[a-z0-9-]+)\)\]$/.exec(className);
  if (arbitraryPlain?.[1]) return tokens[arbitraryPlain[1]] ?? null;

  const mappedVar = VAR_COLORS[className];
  if (mappedVar) return tokens[mappedVar] ?? null;

  return STATIC_COLORS[className] ?? null;
}

function expectTokenPair(bgClass: string, textClass: string, label: string): void {
  for (const mode of ["light", "dark"] as const) {
    const background = resolveClass(bgClass, mode);
    const foreground = resolveClass(textClass, mode);
    expect(background, `${label} background resolves in ${mode}`).not.toBeNull();
    expect(foreground, `${label} text resolves in ${mode}`).not.toBeNull();
    const ratio = contrastRatio(String(foreground), String(background));
    expect(ratio, `${label} contrast in ${mode}`).toBeGreaterThanOrEqual(4.5);
  }
}

function layoutFallbacks(): Record<string, { operator: string; fallback: string }> {
  const pattern =
    /const (button(?:Primary|Secondary)(?:Bg|Text)(?:Dark)?) = settings\.\1 (\?\?|\|\|) "([^"]+)";/g;
  const found: Record<string, { operator: string; fallback: string }> = {};
  let match = pattern.exec(layoutSource);
  while (match !== null) {
    const [, name, operator, fallback] = match;
    if (name && operator && fallback) found[name] = { operator, fallback };
    match = pattern.exec(layoutSource);
  }
  return found;
}

describe("button design tokens", () => {
  it("declares the four button tokens for light mode in globals.css", () => {
    for (const token of BUTTON_TOKENS) {
      expect(lightTokens[token], `globals.css :root ${token}`).toBeDefined();
      expect(normalizeHex(lightTokens[token] ?? "")).toBe(normalizeHex(EXPECTED_LIGHT[token]));
    }
  });

  it("declares the four button tokens for dark mode in globals.css", () => {
    for (const token of BUTTON_TOKENS) {
      expect(darkTokens[token], `globals.css .dark ${token}`).toBeDefined();
      expect(normalizeHex(darkTokens[token] ?? "")).toBe(normalizeHex(EXPECTED_DARK[token]));
    }
  });

  it("keeps layout fallbacks identical to the globals.css tokens", () => {
    const fallbacks = layoutFallbacks();
    expect(Object.keys(fallbacks).length).toBeGreaterThanOrEqual(8);

    for (const token of BUTTON_TOKENS) {
      const light = fallbacks[DB_KEYS[token].light];
      const dark = fallbacks[DB_KEYS[token].dark];
      expect(light, `layout fallback for ${DB_KEYS[token].light}`).toBeDefined();
      expect(dark, `layout fallback for ${DB_KEYS[token].dark}`).toBeDefined();
      expect(normalizeHex(light?.fallback ?? "")).toBe(normalizeHex(EXPECTED_LIGHT[token]));
      expect(normalizeHex(dark?.fallback ?? "")).toBe(normalizeHex(EXPECTED_DARK[token]));
    }
  });

  it("coalesces empty platform settings so no token can be emitted blank", () => {
    const fallbacks = layoutFallbacks();
    for (const [, entry] of Object.entries(fallbacks)) {
      expect(entry.operator, "layout must use || so empty strings fall back").toBe("||");
      expect(entry.fallback.trim(), "layout fallback must be a non-empty color").not.toBe("");
    }
  });
});

describe("button variant contrast", () => {
  it("meets AA for the default variant in both themes", () => {
    const classes = classesOf("default");
    const bg = classes.find((item) => item.startsWith("bg-[var("));
    const text = classes.find((item) => item.startsWith("text-[var("));
    expect(bg, "default variant background utility").toBeDefined();
    expect(text, "default variant text utility").toBeDefined();
    expectTokenPair(bg ?? "", text ?? "", "default");
  });

  it("meets AA for the secondary variant in both themes", () => {
    const classes = classesOf("secondary");
    const bg = classes.find((item) => item.startsWith("bg-[var("));
    const text = classes.find((item) => item.startsWith("text-[var("));
    expect(bg, "secondary variant background utility").toBeDefined();
    expect(text, "secondary variant text utility").toBeDefined();
    expectTokenPair(bg ?? "", text ?? "", "secondary");
  });

  it("meets AA for the destructive variant at its lightest gradient stop", () => {
    const classes = classesOf("destructive");
    const textClass = classes.find(
      (item) => item === "text-white" || item === "text-destructive-foreground"
    );
    expect(textClass, "destructive variant must pin an explicit text color").toBeDefined();

    const foreground = resolveClass(textClass, "light");
    expect(foreground, "destructive text resolves").not.toBeNull();

    const stops = classes
      .filter((item) => STATIC_COLORS[item] !== undefined && /^(from|to)-/.test(item))
      .map((item) => STATIC_COLORS[item] as string);
    expect(stops.length, "destructive gradient stops").toBeGreaterThanOrEqual(2);

    for (const stop of stops) {
      const ratio = contrastRatio(String(foreground), stop);
      expect(ratio, `destructive contrast on ${stop}`).toBeGreaterThanOrEqual(4.5);
    }
  });

  it("meets AA for the outline variant in both themes", () => {
    const classes = classesOf("outline");
    const text = classes.find(
      (item) => item === "text-foreground" || item === "text-primary"
    );
    expect(text, "outline variant must declare its own text color").toBeDefined();
    const background = darkTokens["--background"];
    expect(background, ".dark background token").toBeDefined();

    for (const mode of ["light", "dark"] as const) {
      const foreground = resolveClass(text, mode);
      const base = (mode === "light" ? lightTokens : darkTokens)["--background"];
      expect(foreground, `outline text resolves in ${mode}`).not.toBeNull();
      const ratio = contrastRatio(String(foreground), String(base));
      expect(ratio, `outline contrast in ${mode}`).toBeGreaterThanOrEqual(4.5);
    }
  });

  it("gives the link variant a readable color in both themes", () => {
    const classes = classesOf("link");
    const text = classes.find(
      (item) => item === "text-[var(--link)]" || item === "text-primary" || item === "text-foreground"
    );
    expect(text, "link variant text class").toBeDefined();

    expect(lightTokens["--link"], "globals.css :root --link").toBeDefined();
    expect(darkTokens["--link"], "globals.css .dark --link").toBeDefined();

    for (const mode of ["light", "dark"] as const) {
      const foreground = resolveClass(text, mode);
      const base = (mode === "light" ? lightTokens : darkTokens)["--background"];
      expect(foreground, `link text resolves in ${mode}`).not.toBeNull();
      const ratio = contrastRatio(String(foreground), String(base));
      expect(ratio, `link contrast in ${mode}`).toBeGreaterThanOrEqual(4.5);
    }
  });

  it("keeps the button source wired to the design tokens", () => {
    expect(buttonSource).toContain("bg-[var(--button-primary-bg)]");
    expect(buttonSource).toContain("text-[var(--button-primary-text)]");
    expect(buttonSource).toContain("bg-[var(--button-secondary-bg)]");
    expect(buttonSource).toContain("text-[var(--button-secondary-text)]");
  });
});

describe("platform button token row", () => {
  let settings: Record<string, unknown> | null = null;

  beforeAll(async () => {
    const { config: loadEnv } = await import("dotenv");
    loadEnv({ path: path.join(ROOT, ".env") });
    const { PrismaClient } = await import("@prisma/client");
    const prisma = new PrismaClient();
    try {
      const row = await prisma.appSettings.findUnique({ where: { id: "singleton" } });
      settings = row ? { ...row } : null;
    } finally {
      await prisma.$disconnect();
    }
  });

  it("stores button tokens that meet AA in both themes", () => {
    expect(settings, "appSettings singleton row must exist").not.toBeNull();
    const row = settings ?? {};

    const read = (key: string): string => {
      const value = row[key];
      expect(typeof value, `${key} must be a string`).toBe("string");
      const text = String(value ?? "").trim();
      expect(text, `${key} must not be empty`).not.toBe("");
      return text;
    };

    const lightPrimaryBg = read("buttonPrimaryBg");
    const lightPrimaryText = read("buttonPrimaryText");
    const lightSecondaryBg = read("buttonSecondaryBg");
    const lightSecondaryText = read("buttonSecondaryText");
    const darkPrimaryBg = read("buttonPrimaryBgDark");
    const darkPrimaryText = read("buttonPrimaryTextDark");
    const darkSecondaryBg = read("buttonSecondaryBgDark");
    const darkSecondaryText = read("buttonSecondaryTextDark");

    expect(contrastRatio(lightPrimaryText, lightPrimaryBg)).toBeGreaterThanOrEqual(4.5);
    expect(contrastRatio(lightSecondaryText, lightSecondaryBg)).toBeGreaterThanOrEqual(4.5);
    expect(contrastRatio(darkPrimaryText, darkPrimaryBg)).toBeGreaterThanOrEqual(4.5);
    expect(contrastRatio(darkSecondaryText, darkSecondaryBg)).toBeGreaterThanOrEqual(4.5);
  });
});
