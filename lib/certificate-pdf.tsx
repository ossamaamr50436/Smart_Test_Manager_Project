import path from "path";
import React from "react";
import {
  Document,
  Page,
  Text,
  View,
  StyleSheet,
  Font,
  renderToBuffer,
} from "@react-pdf/renderer";

// ============================================================
// توليد PDF الشهادة (مرحلة الشهادات)
// يستخدم خط Amiri لدعم النصوص العربية بشكل صحيح داخل PDF
// ============================================================

const FONTS_DIR = path.join(process.cwd(), "assets", "fonts");

// تسجيل الخط العربي (لا يُسجَّل إلا مرة واحدة)
let fontsRegistered = false;
export function registerCertificateFonts() {
  if (fontsRegistered) return;
  Font.register({
    family: "Amiri",
    fonts: [
      { src: path.join(FONTS_DIR, "Amiri-Regular.ttf"), fontWeight: "normal" },
      { src: path.join(FONTS_DIR, "Amiri-Bold.ttf"), fontWeight: "bold" },
    ],
  });
  fontsRegistered = true;
}

const styles = StyleSheet.create({
  page: {
    flexDirection: "column",
    alignItems: "center",
    justifyContent: "center",
    padding: 48,
    fontFamily: "Amiri",
    direction: "rtl",
  },
  border: {
    position: "absolute",
    top: 24,
    bottom: 24,
    left: 24,
    right: 24,
    borderWidth: 3,
    borderColor: "#015e63",
    borderRadius: 12,
  },
  innerBorder: {
    position: "absolute",
    top: 32,
    bottom: 32,
    left: 32,
    right: 32,
    borderWidth: 1,
    borderColor: "#d3bb8b",
    borderRadius: 8,
  },
  title: {
    fontSize: 30,
    fontWeight: "bold",
    color: "#015e63",
    textAlign: "center",
    marginBottom: 6,
  },
  subtitle: {
    fontSize: 14,
    color: "#6B7280",
    textAlign: "center",
    marginBottom: 40,
  },
  body: {
    fontSize: 16,
    color: "#1A1A1A",
    textAlign: "center",
    lineHeight: 1.9,
  },
  studentName: {
    fontSize: 24,
    fontWeight: "bold",
    color: "#015e63",
    textAlign: "center",
    marginVertical: 12,
  },
  score: {
    fontSize: 18,
    fontWeight: "bold",
    color: "#015e63",
    textAlign: "center",
    marginTop: 18,
  },
  footer: {
    position: "absolute",
    bottom: 52,
    left: 48,
    right: 48,
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "flex-end",
  },
  signatureBox: {
    alignItems: "center",
  },
  signatureLabel: {
    fontSize: 12,
    color: "#6B7280",
    marginTop: 6,
  },
  serial: {
    position: "absolute",
    top: 52,
    left: 48,
    fontSize: 10,
    color: "#9CA3AF",
  },
  date: {
    fontSize: 12,
    color: "#6B7280",
    textAlign: "center",
    marginTop: 24,
  },
});

export type CertificatePdfData = {
  studentName: string;
  finalScore: number;
  issuedDate: Date;
  serialNumber: string;
  managerName?: string;
};

/**
 * إنشاء مستند الشهادة (React-PDF)
 */
function CertificateDocument({ data }: { data: CertificatePdfData }) {
  const { studentName, finalScore, issuedDate, serialNumber, managerName } = data;
  const dateStr = issuedDate.toLocaleDateString("ar-SA", {
    year: "numeric",
    month: "long",
    day: "numeric",
  });

  return (
    <Document>
      <Page size="A4" style={styles.page}>
        <View style={styles.border} />
        <View style={styles.innerBorder} />

        <Text style={styles.serial}>{serialNumber}</Text>
        <Text style={styles.title}>شهادة اجتياز اختبار القرآن الكريم</Text>
        <Text style={styles.subtitle}>
          جمعية تعليم القرآن وعلومه — فرع المدينة المنورة
        </Text>

        <Text style={styles.body}>
          تشهد إدارة الاختبارات بأن الطالب/الطالبة
        </Text>
        <Text style={styles.studentName}>{studentName}</Text>
        <Text style={styles.body}>
          قد اجتاز بنجاح اختبار حفظ القرآن الكريم الذي أقامته الجمعية، وقد حصل
          على الدرجة التالية:
        </Text>
        <Text style={styles.score}>الدرجة النهائية: {finalScore} / 20</Text>
        <Text style={styles.date}>صدرت بتاريخ {dateStr}</Text>

        <View style={styles.footer}>
          <View style={styles.signatureBox}>
            <Text style={{ fontSize: 14, fontWeight: "bold", color: "#015e63" }}>
              {managerName ?? "مدير الاختبارات"}
            </Text>
            <Text style={styles.signatureLabel}>التوقيع</Text>
          </View>
          <View style={styles.signatureBox}>
            <Text style={{ fontSize: 14, fontWeight: "bold", color: "#015e63" }}>
              مصدر الشهادات
            </Text>
            <Text style={styles.signatureLabel}>اعتماد الإصدار</Text>
          </View>
        </View>
      </Page>
    </Document>
  );
}

/**
 * توليد Buffer PDF للشهادة
 */
export async function generateCertificatePdfBuffer(
  data: CertificatePdfData
): Promise<Buffer> {
  registerCertificateFonts();
  const buffer = await renderToBuffer(
    <CertificateDocument data={data} />
  );
  return Buffer.from(buffer);
}