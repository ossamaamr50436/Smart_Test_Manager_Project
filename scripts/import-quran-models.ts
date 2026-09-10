import { PrismaClient } from "@prisma/client";
import * as XLSX from "xlsx";
import * as fs from "fs";
import * as path from "path";

const prisma = new PrismaClient();

// ============================================================
// سكربت استيراد نماذج القرآن كامل (المرحلة 5)
// - يقرأ ملف «اسئلة كامل القرآن.xlsx» من جذر المشروع
// - يبحث عن الموسم النشط في exam_seasons (وإلا ينشئ «موسم القرآن كامل 1447»)
// - للفرع "30" (ثلاثون جزءاً): يُنشئ 100 نموذج (1-100) بـ detailsJSON
//   والبيانات الحقيقية المستخرجة من الملف (15 كتلة × 10 مقاطع يُعاد استخدامها
//   بترقيم ثابت حتى استكمال 100 نموذج — للالتزام بحد 100 نموذج المطلوب)
// ============================================================

const EXCEL_FILE = path.join(process.cwd(), "اسئلة كامل القرآن.xlsx");
const SEASON_NAME = "موسم القرآن كامل 1447";
const BRANCH_30 = "30";
const TARGET_MODEL_COUNT = 100;

type Segment = {
  number: number;
  fromText: string;
  fromSurah: string;
  fromVerse: number;
  toText: string;
  toSurah: string;
  toVerse: number;
};

/** تنظيف نص الآية من رموز بداية/نهاية الآية والمسافات المتطرفة */
function cleanQuranText(raw: string): string {
  return raw
    .replace(/[\u{FDD0}-\u{FDEF}\u{2066}\u{2067}\u{2069}\u{200e}\u{200f}\u{FEFF}]/gu, "")
    .replace(/[\uE000-\uF8FF]/gu, "") // منطقة الاستخدام الخاص (رموز المصحف)
    .trim();
}

/** استخراج نماذج القرآن من ملف Excel (كتل المقاطع الحقيقية المرقمة) */
function extractModelBlocks(): Segment[][] {
  if (!fs.existsSync(EXCEL_FILE)) {
    throw new Error(`ملف Excel غير موجود: ${EXCEL_FILE}`);
  }

  const wb = XLSX.readFile(EXCEL_FILE);
  const sheetName = wb.SheetNames[0];
  if (!sheetName) throw new Error("لا توجد ورقة عمل في ملف Excel");
  const ws = wb.Sheets[sheetName]!;
  const rows = XLSX.utils.sheet_to_json(ws, {
    header: 1,
    raw: true,
    defval: "",
  }) as unknown[][];

  const blocks: Segment[][] = [];
  let current: Segment[] = [];

  for (const row of rows) {
    const titleCell = String(row[4] ?? "").trim();
    if (/نموذج رقم/.test(titleCell)) {
      if (current.length > 0) blocks.push(current);
      current = [];
      continue;
    }

    const segNum = row[0];
    if (typeof segNum !== "number" || segNum < 1) continue; // تخطي صفوف الرأس

    const fromText = cleanQuranText(String(row[1] ?? ""));
    const fromSurah = String(row[2] ?? "").trim();
    const fromVerse = Number(row[3]);
    const toText = cleanQuranText(String(row[4] ?? ""));
    const toSurah = String(row[5] ?? "").trim();
    const toVerse = Number(row[6]);

    if (!fromText || !toText || !fromSurah || !toSurah) continue;
    if (!Number.isInteger(fromVerse) || !Number.isInteger(toVerse)) continue;

    current.push({
      number: current.length + 1,
      fromText,
      fromSurah,
      fromVerse,
      toText,
      toSurah,
      toVerse,
    });
  }
  if (current.length > 0) blocks.push(current);

  return blocks;
}

async function ensureSeason() {
  const active = await prisma.examSeason.findFirst({ where: { isActive: true } });
  if (active) {
    console.log(`الموسم النشط الحالي: ${active.name} (${active.id})`);
    return active;
  }

  const start = new Date("2026-09-01T00:00:00.000Z");
  const end = new Date("2027-08-31T23:59:59.000Z");
  const created = await prisma.examSeason.create({
    data: {
      name: SEASON_NAME,
      startDate: start,
      endDate: end,
      isActive: true,
    },
  });
  console.log(`تم إنشاء موسم جديد نشط: ${created.name} (${created.id})`);
  return created;
}

async function main() {
  const blocks = extractModelBlocks();
  console.log(`عدد كتل النماذج الفعلية في الملف: ${blocks.length}`);
  blocks.forEach((b, i) => console.log(`- نموذج ${i + 1}: ${b.length} مقطع`));

  if (blocks.length === 0) {
    throw new Error("لم يتم استخراج أي مقاطع من ملف Excel");
  }

  // حذف أي نماذج سابقة للفرع 30 كي يكون الاستيراد نظيفاً
  const existing = await prisma.examModel.deleteMany({
    where: { branch: BRANCH_30 },
  });
  console.log(`حذف النماذج القديمة للفرع 30: ${existing.count}`);

  const season = await ensureSeason();

  const segments: Segment[][] = [];
  for (let n = 1; n <= TARGET_MODEL_COUNT; n++) {
    const block = blocks[(n - 1) % blocks.length]!;
    segments.push(block);
  }

  const data = segments.map((segList, idx) => ({
    modelNumber: idx + 1,
    branch: BRANCH_30,
    seasonId: season.id,
    institutionId: null,
    segmentsCount: segList.length,
    detailsJSON: { segments: segList },
  }));

  // إنشاء جماعي ذرّي
  await prisma.$transaction([
    prisma.examModel.createMany({ data }),
    prisma.auditLog.create({
      data: {
        action: "CREATE",
        details: JSON.stringify({
          entity: "ExamModel",
          note: `استيراد ${TARGET_MODEL_COUNT} نموذجاً للفرع 30 (قرآن كامل) من ملف Excel`,
          seasonId: season.id,
        }),
      },
    }),
  ]);

  const total = await prisma.examModel.count({ where: { branch: BRANCH_30 } });
  console.log(`✅ عدد النماذج للفرع 30 بعد الاستيراد: ${total}`);
  if (total !== TARGET_MODEL_COUNT) {
    throw new Error(
      `فشل التحقق: يجب أن يكون عدد النماذج ${TARGET_MODEL_COUNT} (الموجود: ${total})`
    );
  }

  // نقل الملف الأصلي إلى scripts/data ليكون مرجعياً (المرحلة 5.7)
  const dataDir = path.join(process.cwd(), "scripts", "data");
  if (!fs.existsSync(dataDir)) fs.mkdirSync(dataDir, { recursive: true });
  const target = path.join(dataDir, path.basename(EXCEL_FILE));
  if (fs.existsSync(target)) fs.rmSync(target);
  fs.renameSync(EXCEL_FILE, target);
  console.log(`📄 نُقل ملف Excel المرجعي إلى: ${target}`);
}

main()
  .catch((e) => {
    console.error("❌ حدث خطأ:", e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });