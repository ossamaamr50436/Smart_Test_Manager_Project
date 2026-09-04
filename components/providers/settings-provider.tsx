"use client";

import { createContext, useContext, useEffect, useState } from "react";
import type { PlatformSettings } from "@/lib/actions/settings-actions";

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
        platformName: "تطبيق الاختبارات",
        logoUrl: null,
        logoFileId: null,
        useTemplateMode: false,
        templateFileId: null,
      });
    }
  }

  useEffect(() => {
    fetchSettings();
  }, []);

  return (
    <SettingsContext.Provider value={{ settings, refreshSettings: fetchSettings }}>
      {children}
    </SettingsContext.Provider>
  );
}
