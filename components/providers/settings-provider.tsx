"use client";

import { createContext, useContext, useEffect, useState } from "react";
import type { PlatformSettings, DesignTokens } from "@/lib/actions/settings-actions";
import { getMyTenantColors } from "@/lib/actions/super-admin-actions";
import { getMyTenantDesignTokens } from "@/lib/actions/settings-actions";
import { hexToHsl } from "@/lib/colors";

// ============================================================
// سياق إعدادات المنصة (لل.'/'.$吉林省/$$ CLIENT Components)
// يجلب الاسم والشعار ديناميكياً من قاعدة البيانات
// ============================================================

type SettingsContextType = {
  settings: PlatformSettings | null;
  refreshSettings: () => Promise<void>;
};

const SettingsContext = createContext<SettingsContextType>({
  settings: null,
  refreshSettings: async () => {},
});

export function usePlatformSettings() {
  return useContext(SettingsContext);
}

export function SettingsProvider({ children }: { children: React.ReactNode }) {
  const [settings, setSettings] = useState<PlatformSettings | null>(null);

  async function fetchSettings() {
    try {
      const res = await fetch("/api/settings");
      if (res.ok) {
        const data = await res.json();
        setSettings(data);
      }
    } catch {
      // في حالة الخطأ، نستخدم القيم الافتراضية
      setSettings({
        platformName: "منصة مجتاز",
        platformNameLine1: null,
        platformNameLine2: null,
        logoUrl: null,
        logoFileId: null,
        useTemplateMode: false,
        templateFileId: null,
        primaryColor: "#015e63",
        secondaryColor: "#d3bb8b",
        accentColor: "#1a262e",
        backgroundColor: "#ffffff",
        textColor: "#0f172a",
        borderColor: "#e2e8f0",
        headingFont: "Cairo",
        bodyFont: "Cairo",
        borderRadius: "0.5rem",
        shadowIntensity: "md",
        buttonStyle: "rounded",
        whatsappNumber: null,
        darkModeEnabled: false,
        requireStudentApplicationFile: false,
        showTutorialSection: true,
        sidebarBg: "#015e63",
        sidebarText: "#ffffff",
        sidebarActiveBg: "#014a4e",
        sidebarActiveText: "#ffffff",
        topbarBg: "#ffffff",
        topbarText: "#0f172a",
        loginBg: "#015e63",
        loginGradientFrom: "#014a4e",
        loginGradientTo: "#d3bb8b",
        loginCardBg: "#ffffff",
        buttonPrimaryBg: "#015e63",
        buttonPrimaryText: "#ffffff",
        buttonSecondaryBg: "#d3bb8b",
        buttonSecondaryText: "#0f172a",
        primaryColorDark: "#0e6e73",
        secondaryColorDark: "#e2d3ab",
        accentColorDark: "#0f1a22",
        backgroundColorDark: "#0e171b",
        textColorDark: "#eef1f4",
        borderColorDark: "#24343e",
        sidebarBgDark: "#071014",
        sidebarTextDark: "#dbe7ec",
        sidebarActiveBgDark: "#015e63",
        sidebarActiveTextDark: "#ffffff",
        topbarBgDark: "#121c22",
        topbarTextDark: "#eef1f4",
        loginBgDark: "#0a1416",
        loginGradientFromDark: "#06282b",
        loginGradientToDark: "#182830",
        loginCardBgDark: "#121c22",
        buttonPrimaryBgDark: "#0e6e73",
        buttonPrimaryTextDark: "#ffffff",
        buttonSecondaryBgDark: "#d3bb8b",
        buttonSecondaryTextDark: "#0f172a",
      });
    }
  }

  useEffect(() => {
    fetchSettings();
    applyTenantColors();
  }, []);

  // الألوان الديناميكية لكل Tenant (Multi-Tenant Branding):
  // مستخدم ضمن مؤسسة → تُطبَّق ألوان مؤسسته على المتغيرات العامة.
  // SUPER_ADMIN أو بلا مؤسسة → null → لا تُعدَّل المتغيرات.
  async function applyTenantColors() {
    try {
      // M17: تطبيق كامل التوكنز المخصصة للجهة (فوق افتراضيات المنصة)
      const designTokens = await getMyTenantDesignTokens();
      const colors = await getMyTenantColors();
      if (colors) {
        document.documentElement.style.setProperty("--primary", hexToHsl(colors.primaryColor));
        document.documentElement.style.setProperty("--secondary", hexToHsl(colors.secondaryColor));
      }
      if (!designTokens) return;
      applyDesignTokens(designTokens);
    } catch {
      // في حالة الخطأ نستخدم الألوان الافتراضية
    }
  }

  function applyDesignTokens(tokens: DesignTokens) {
    // نسكب ورقة أنماط ديناميكية بدل inline styles — تُحترم فيها :root و .dark
    const styleId = "tenant-design-tokens";
    let style = document.getElementById(styleId) as HTMLStyleElement | null;
    if (!style) {
      style = document.createElement("style");
      style.id = styleId;
      document.head.appendChild(style);
    }
    const light = `:root {
      --primary: ${hexToHsl(tokens.primaryColor)};
      --secondary: ${hexToHsl(tokens.secondaryColor)};
      --accent: ${hexToHsl(tokens.accentColor)};
      --background: ${hexToHsl(tokens.backgroundColor)};
      --foreground: ${hexToHsl(tokens.textColor)};
      --border: ${hexToHsl(tokens.borderColor)};
      --font-heading: ${tokens.headingFont};
      --font-body: ${tokens.bodyFont};
      --sidebar-bg: ${hexToHsl(tokens.sidebarBg)};
      --sidebar-text: ${hexToHsl(tokens.sidebarText)};
      --sidebar-active-bg: ${hexToHsl(tokens.sidebarActiveBg)};
      --sidebar-active-text: ${hexToHsl(tokens.sidebarActiveText)};
      --topbar-bg: ${hexToHsl(tokens.topbarBg)};
      --topbar-text: ${hexToHsl(tokens.topbarText)};
      --login-bg: ${hexToHsl(tokens.loginBg)};
      --login-gradient-from: ${hexToHsl(tokens.loginGradientFrom)};
      --login-gradient-to: ${hexToHsl(tokens.loginGradientTo)};
      --login-card-bg: ${hexToHsl(tokens.loginCardBg)};
      --button-primary-bg: ${hexToHsl(tokens.buttonPrimaryBg)};
      --button-primary-text: ${hexToHsl(tokens.buttonPrimaryText)};
      --button-secondary-bg: ${hexToHsl(tokens.buttonSecondaryBg)};
      --button-secondary-text: ${hexToHsl(tokens.buttonSecondaryText)};
    }`;
    const dark = `.dark {
      --primary: ${hexToHsl(tokens.primaryColorDark)};
      --secondary: ${hexToHsl(tokens.secondaryColorDark)};
      --accent: ${hexToHsl(tokens.accentColorDark)};
      --background: ${hexToHsl(tokens.backgroundColorDark)};
      --foreground: ${hexToHsl(tokens.textColorDark)};
      --border: ${hexToHsl(tokens.borderColorDark)};
      --sidebar-bg: ${hexToHsl(tokens.sidebarBgDark)};
      --sidebar-text: ${hexToHsl(tokens.sidebarTextDark)};
      --sidebar-active-bg: ${hexToHsl(tokens.sidebarActiveBgDark)};
      --sidebar-active-text: ${hexToHsl(tokens.sidebarActiveTextDark)};
      --topbar-bg: ${hexToHsl(tokens.topbarBgDark)};
      --topbar-text: ${hexToHsl(tokens.topbarTextDark)};
      --login-bg: ${hexToHsl(tokens.loginBgDark)};
      --login-gradient-from: ${hexToHsl(tokens.loginGradientFromDark)};
      --login-gradient-to: ${hexToHsl(tokens.loginGradientToDark)};
      --login-card-bg: ${hexToHsl(tokens.loginCardBgDark)};
      --button-primary-bg: ${hexToHsl(tokens.buttonPrimaryBgDark)};
      --button-primary-text: ${hexToHsl(tokens.buttonPrimaryTextDark)};
      --button-secondary-bg: ${hexToHsl(tokens.buttonSecondaryBgDark)};
      --button-secondary-text: ${hexToHsl(tokens.buttonSecondaryTextDark)};
    }`;
    style.textContent = `${light}\n${dark}`;
  }

  return (
    <SettingsContext.Provider value={{ settings, refreshSettings: fetchSettings }}>
      {children}
    </SettingsContext.Provider>
  );
}
