import path from "path";
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

// ------------------------------------------------------------
// بناة عناصر PDF (إصلاح M38)
// ------------------------------------------------------------
// حزمة `@react-pdf/reconciler` تُحمَّل خارج حزمة Next.js، فتحلّ
// استيرادها لـ`react` إلى إصدار المشروع (‎18.2.0‎) وتختار
// مُوائِم React 18 الذي لا يقبل سوى العناصر الرمزية `react.element`.
// أما JSX داخل حزمة Next.js الإنتاجية فيُترجَم إلى نسخة React
// المضمّنة في Next (‎19.x‎) فينتج عناصر `react.transitional.element`
// التي يرفضها ذلك المُوائِم (خطأ React #31 → HTTP 500 عند الإصدار).
//
// الحل محصور في توليد الـPDF: نبني شجرة المستند هنا بأنفسنا بدل
// الاعتماد على JSX، بصيغة يقبلها مُوائِم @react-pdf في كل بيئة
// (تطوير أو إنتاج) دون تغيير React الأساسي في بقية التطبيق.
// ------------------------------------------------------------
const PDF_ELEMENT_TYPE = Symbol.for("react.element");

type PdfComponentProps = Record<string, unknown>;

type PdfElement = {
  $$typeof: symbol;
  type: string;
  key: string | null;
  ref: null;
  props: PdfComponentProps;
};

type PdfNode = PdfElement | string | number | boolean | null | undefined;

// `@react-pdf/renderer` يصدّر أنواع المضيف (DOCUMENT/PAGE/TEXT/VIEW) كنصوص
// وقت التشغيل، بينما تعريفاته (d.ts) تصفها كأصناف React — نثبّت النوع هنا.
const PdfDocument = Document as unknown as string;
const PdfPage = Page as unknown as string;
const PdfText = Text as unknown as string;
const PdfView = View as unknown as string;

/** إنشاء عنصر PDF متوافق مع مُوائِم @react-pdf */
function h(
  type: string,
  props: (PdfComponentProps & { key?: string | number }) | null,
  ...children: PdfNode[]
): PdfElement {
  const nextProps: PdfComponentProps = {};
  let key: string | null = null;

  if (props) {
    for (const name of Object.keys(props)) {
      if (name === "key") {
        const rawKey = props[name];
        key = rawKey === null || rawKey === undefined ? null : String(rawKey);
        continue;
      }
      nextProps[name] = props[name];
    }
  }

  if (children.length === 1) {
    nextProps.children = children[0];
  } else if (children.length > 1) {
    nextProps.children = children;
  }

  return { $$typeof: PDF_ELEMENT_TYPE, type, key, ref: null, props: nextProps };
}

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
  /** اسم الجهة/المؤسسة المُصدِرة — تُستكمل من بيانات الطالب (محايد بلا علامة جمعية معيّنة) */
  organizationName?: string;
};

/**
 * إنشاء مستند الشهادة (React-PDF)
 */
function CertificateDocument({ data }: { data: CertificatePdfData }): PdfElement {
  const { studentName, finalScore, issuedDate, serialNumber, managerName, organizationName } = data;
  const dateStr = issuedDate.toLocaleDateString("ar-SA", {
    year: "numeric",
    month: "long",
    day: "numeric",
  });

  return h(
    PdfDocument,
    null,
    h(
      PdfPage,
      { size: "A4", style: styles.page },
      h(PdfView, { style: styles.border }),
      h(PdfView, { style: styles.innerBorder }),

      h(PdfText, { style: styles.serial }, serialNumber),
      h(PdfText, { style: styles.title }, "شهادة اجتياز اختبار القرآن الكريم"),
      h(PdfText, { style: styles.subtitle }, organizationName ?? "منصة مجتاز"),

      h(PdfText, { style: styles.body }, "تشهد إدارة الاختبارات بأن الطالب/الطالبة"),
      h(PdfText, { style: styles.studentName }, studentName),
      h(
        PdfText,
        { style: styles.body },
        "قد اجتاز بنجاح اختبار حفظ القرآن الكريم، وقد حصل على الدرجة التالية:"
      ),
      h(PdfText, { style: styles.score }, "الدرجة النهائية: ", finalScore, " / 100"),
      h(PdfText, { style: styles.date }, "صدرت بتاريخ ", dateStr),

      h(
        PdfView,
        { style: styles.footer },
        h(
          PdfView,
          { style: styles.signatureBox },
          h(
            PdfText,
            { style: { fontSize: 14, fontWeight: "bold", color: "#015e63" } },
            managerName ?? "مدير الاختبارات"
          ),
          h(PdfText, { style: styles.signatureLabel }, "التوقيع")
        ),
        h(
          PdfView,
          { style: styles.signatureBox },
          h(
            PdfText,
            { style: { fontSize: 14, fontWeight: "bold", color: "#015e63" } },
            "مصدر الشهادات"
          ),
          h(PdfText, { style: styles.signatureLabel }, "اعتماد الإصدار")
        )
      )
    )
  );
}

/**
 * توليد Buffer PDF للشهادة
 */
export async function generateCertificatePdfBuffer(
  data: CertificatePdfData
): Promise<Buffer> {
  registerCertificateFonts();
  const document = CertificateDocument({ data });

  // حارس توافق: لا نمرّر عنصراً بصيغة لا يفهمها مُوائِم @react-pdf
  if (document.$$typeof !== PDF_ELEMENT_TYPE) {
    throw new Error("تعذر بناء مستند الشهادة — خطأ داخلي في توليد الملف");
  }

  const buffer = await renderToBuffer(
    document as unknown as Parameters<typeof renderToBuffer>[0]
  );
  return Buffer.from(buffer);
}
