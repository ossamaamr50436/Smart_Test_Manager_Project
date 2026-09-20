"use client";

import { createContext, useContext, useEffect, useState } from "react";
import type { PlatformSettings } from "@/lib/actions/settings-actions";
import { getMyTenantColors } from "@/lib/actions/super-admin-actions";
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
        platformName: "منصة إدارة الاختبارات الذكية",
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
      const colors = await getMyTenantColors();
      if (!colors) return;
      document.documentElement.style.setProperty("--primary", hexToHsl(colors.primaryColor));
      document.documentElement.style.setProperty("--secondary", hexToHsl(colors.secondaryColor));
    } catch {
      // في حالة الخطأ نستخدم الألوان الافتراضية
    }
  }

  return (
    <SettingsContext.Provider value={{ settings, refreshSettings: fetchSettings }}>
      {children}
    </SettingsContext.Provider>
  );
}
