import type { Config } from "tailwindcss";

const config: Config = {
  darkMode: ["class"],
  content: [
    "./pages/**/*.{ts,tsx}",
    "./components/**/*.{ts,tsx}",
    "./app/**/*.{ts,tsx}",
    "./src/**/*.{ts,tsx}",
  ],
  theme: {
    container: {
      center: true,
      padding: "2rem",
      screens: {
        "2xl": "1400px",
      },
    },
    extend: {
      colors: {
        // الهوية البصرية الجديدة (المرحلة 2)
        // الخطوط العريضة: الأزرق المخضر #015e63 (أساسي) والذهبي البيج #d3bb8b (ثانوي)
        // تتبع الألوان الديناميكية من CSS Variables (حوكمة الأدمن)
        primary: {
          DEFAULT: "var(--primary)",
          50: "#e6f2f2",
          100: "#c5e2e3",
          200: "#8fc7c9",
          300: "#5aa8ac",
          400: "#2f8489",
          500: "#015e63",
          600: "#015057",
          700: "#01414a",
          800: "#01323c",
          900: "#00222d",
          foreground: "#FFFFFF",
        },
        secondary: {
          DEFAULT: "var(--secondary)",
          50: "#faf7f0",
          100: "#f1ead9",
          200: "#e6d7b5",
          300: "#d3bb8b",
          400: "#b99b62",
          500: "#a17f47",
          600: "#8a6a3c",
          700: "#735631",
          800: "#5c4426",
          900: "#45331c",
          foreground: "#01434a",
        },
        muted: {
          DEFAULT: "var(--muted)",
          foreground: "var(--muted-foreground)",
        },
        foreground: "var(--foreground)",
        background: "var(--background)",
        border: "var(--border)",
        input: "var(--input)",
        ring: "var(--primary)",
        destructive: {
          DEFAULT: "var(--destructive)",
          foreground: "var(--destructive-foreground)",
        },
        accent: {
          DEFAULT: "var(--accent)",
          foreground: "var(--accent-foreground)",
        },
        card: {
          DEFAULT: "var(--card)",
          foreground: "var(--card-foreground)",
        },
        popover: {
          DEFAULT: "var(--popover)",
          foreground: "var(--popover-foreground)",
        },
      },
      borderRadius: {
        lg: "0.75rem",
        md: "0.5rem",
        sm: "0.3125rem",
      },
      keyframes: {
        "accordion-down": {
          from: { height: "0" },
          to: { height: "var(--radix-accordion-content-height)" },
        },
        "accordion-up": {
          from: { height: "var(--radix-accordion-content-height)" },
          to: { height: "0" },
        },
      },
      animation: {
        "accordion-down": "accordion-down 0.2s ease-out",
        "accordion-up": "accordion-up 0.2s ease-out",
      },
    },
  },
  plugins: [require("tailwindcss-animate")],
};

export default config;