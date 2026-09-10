import { PrismaClient, Role, StudentStatus } from "@prisma/client";
import bcrypt from "bcryptjs";

const prisma = new PrismaClient();

// ============================================================
// بذر شامل لقاعدة بيانات منصة مدير الاختبارات الذكي
// جمعية تعليم القرآن وعلومه — فرع المدينة المنورة
// ============================================================

// الحساب الرسمي — المسؤول العام (يُقرأ من بيئة التشغيل حفاظاً على الأمان)
const ADMIN_EMAIL = process.env.ADMIN_EMAIL || "";
const ADMIN_NAME = process.env.ADMIN_NAME || "المسؤول العام";
const ADMIN_PASSWORD = process.env.ADMIN_PASSWORD || "";
const ADMIN_BIRTH_DATE = process.env.ADMIN_BIRTH_DATE || "1980-01-01";

// كلمة مرور موحدة للحسابات التجريبية (البيانات التجريبية فقط)
const DEMO_PASSWORD = "QuranTest2026!Strong";

// أسماء الجهات التعليمية (87 جهة)
const INSTITUTIONS = [
  "حلقات النور القرآنية",
  "معهد الهدى لتحفيظ القرآن",
  "دار التقوى النسائية",
  "حلقات الفرقان",
  "جمعية تحفيظ القرآن بالعوالي",
  "مدارس البيان النموذجية",
  "مركز الصديق لتحفيظ القرآن",
  "حلقات الرحمة",
  "المعهد القرآني بالمدينة",
  "حلقات الإمام نافع",
  "جمعية الخير لتحفيظ القرآن",
  "دار القرآن الكريم",
  "حلقات الكندي",
  "مدرسة أبي بن كعب",
  "مركز الزهراء النسائي",
  "حلقات الإتقان",
  "معهد المقام المحمود",
  "دار الإيمان النسائية",
  "حلقات ابن كثير",
  "مركز النور لتعليم القرآن",
  "جمعية الرابطة القرآنية",
  "حلقات الأرقم بن أبي الأرقم",
  "مدرسة عثمان بن عفان",
  "مركز الذكر الحكيم",
  "حلقات البركة",
  "معهد طيبة للقراءات",
  "دار عمار بن ياسر",
  "حلقات الخلفاء الراشدين",
  "مركز الفرقان النموذجي",
  "جمعية البركة لتحفيظ القرآن",
  "مدرسة سعد بن معاذ",
  "حلقات المثنى",
  "مركز الكوثر النسائي",
  "دار حفص لتحفيظ القرآن",
  "حلقات شعبة بن عياش",
  "معهد الإسراء القرآني",
  "حلقات أبي الدرداء",
  "مركز النجاح لتحفيظ القرآن",
  "جمعية الهدى بالمدينة",
  "دار السلام القرآني",
  "حلقات أحمد بن حنبل",
  "مدرسة بلال بن رباح",
  "مركز الصفا النسائي",
  "حلقات المدينة المنورة",
  "معهد الإتقان للقراءات العشر",
  "دار الفتح القرآني",
  "حلقات ابن الجزري",
  "مركز السكينة النسائي",
  "جمعية الفرقان لتحفيظ القرآن",
  "مدرسة جابر بن عبدالله",
  "حلقات الإخلاص",
  "معهد النور المبين",
  "حلقات عمر بن الخطاب",
  "مركز الهدى النبوي",
  "دار المصطفى القرآني",
  "حلقات أبي موسى الأشعري",
  "جمعية السلام لتحفيظ القرآن",
  "مدرسة خالد بن الوليد",
  "مركز البشائر النسائي",
  "حلقات الطيبة",
  "معهد الرشاد القرآني",
  "دار الأنصار لتحفيظ القرآن",
  "حلقات أسامة بن زيد",
  "مركز المؤمنات النسائي",
  "جمعية البيان بالمدينة",
  "مدرسة أبي هريرة",
  "حلقات الفيحاء",
  "معهد المعالي للقراءات",
  "حلقات سيدنا علي",
  "مركز النخبة النسائي",
  "دار زيد بن ثابت",
  "حلقات الشاطبية",
  "جمعية الرحمة القرآنية",
  "مدرسة مصعب بن عمير",
  "مركز الروضة النسائي",
  "حلقات أهل المدينة",
  "معهد العلم النافع",
  "حلقات أبي طلحة الأنصاري",
  "مركز المهد قرآني",
  "دار عمر بن عبدالعزيز",
  "حلقات الإمام مالك",
  "جمعية البر بالمدينة",
  "مدرسة عبدالله بن عباس",
  "مركز الحوراء النسائي",
  "حلقات أهل الصفة",
  "معهد الإحسان القرآني",
  "دار نافع المدني",
];

// بيانات المعلمين (8 معلمين بأعمار مختلفة)
const EXAMINERS: {
  name: string;
  email: string;
  birthDate: string; // سن تقريبي عند البذر
}[] = [
  { name: "أحمد محمد", email: "ahmed.mohammad@example.com", birthDate: "1970-03-15" }, // ~56 سنة
  { name: "فاطمة علي", email: "fatima.ali@example.com", birthDate: "2002-07-20" }, // ~24 سنة
  { name: "خالد عبدالله", email: "khaled.abdullah@example.com", birthDate: "1975-11-02" }, // ~51 سنة
  { name: "سارة إبراهيم", email: "sara.ibrahim@example.com", birthDate: "1995-04-10" }, // ~31 سنة
  { name: "محمود حسن", email: "mahmoud.hassan@example.com", birthDate: "1980-09-25" }, // ~46 سنة
  { name: "نورة سعد", email: "noura.saad@example.com", birthDate: "2000-01-05" }, // ~26 سنة
  { name: "عبدالرحمن فهد", email: "abdulrahman.fahad@example.com", birthDate: "1965-12-30" }, // ~60 سنة
  { name: "هند خالد", email: "hind.khaled@example.com", birthDate: "1990-06-18" }, // ~36 سنة
];

// مدن المملكة للأجهزة التعليمية
const CITIES = [
  "المدينة المنورة",
  "مكة المكرمة",
  "جدة",
  "الرياض",
  "الدمام",
  "الطائف",
  "ينبع",
  "تبوك",
  "بريدة",
  "خيبر",
  "العلا",
  "بدر",
];

// السور وأعداد آياتها (مصحف المدينة النبوية) — لبناء مقاطع النماذج تقريباً
const SURAHS: { name: string; verses: number }[] = [
  { name: "الفاتحة", verses: 7 },
  { name: "البقرة", verses: 286 },
  { name: "آل عمران", verses: 200 },
  { name: "النساء", verses: 176 },
  { name: "المائدة", verses: 120 },
  { name: "الأنعام", verses: 165 },
  { name: "الأعراف", verses: 206 },
  { name: "الأنفال", verses: 75 },
  { name: "التوبة", verses: 129 },
  { name: "يونس", verses: 109 },
  { name: "هود", verses: 123 },
  { name: "يوسف", verses: 111 },
  { name: "الرعد", verses: 43 },
  { name: "إبراهيم", verses: 52 },
  { name: "الحجر", verses: 99 },
  { name: "النحل", verses: 128 },
  { name: "الإسراء", verses: 111 },
  { name: "الكهف", verses: 110 },
  { name: "مريم", verses: 98 },
  { name: "طه", verses: 135 },
  { name: "الأنبياء", verses: 112 },
  { name: "الحج", verses: 78 },
  { name: "المؤمنون", verses: 118 },
  { name: "النور", verses: 64 },
  { name: "الفرقان", verses: 77 },
  { name: "الشعراء", verses: 227 },
  { name: "النمل", verses: 93 },
  { name: "القصص", verses: 88 },
  { name: "العنكبوت", verses: 69 },
  { name: "الروم", verses: 60 },
  { name: "لقمان", verses: 34 },
  { name: "السجدة", verses: 30 },
  { name: "الأحزاب", verses: 73 },
  { name: "سبأ", verses: 54 },
  { name: "فاطر", verses: 45 },
  { name: "يس", verses: 83 },
  { name: "الصافات", verses: 182 },
  { name: "ص", verses: 88 },
  { name: "الزمر", verses: 75 },
  { name: "غافر", verses: 85 },
  { name: "فصلت", verses: 54 },
  { name: "الشورى", verses: 53 },
  { name: "الزخرف", verses: 89 },
  { name: "الدخان", verses: 59 },
  { name: "الجاثية", verses: 37 },
  { name: "الأحقاف", verses: 35 },
  { name: "محمد", verses: 38 },
  { name: "الفتح", verses: 29 },
  { name: "الحجرات", verses: 18 },
  { name: "ق", verses: 45 },
];

// تقريب نهاية كل جزء بالرقم الترتيبي للسورة (للفروع)
function branchEndSurahIndex(branch: string): number {
  switch (branch) {
    case "5":
      return 4; // حتى سورة النساء تقريباً
    case "10":
      return 8; // حتى سورة الأنفال/التوبة
    case "15":
      return 15; // حتى النحل
    case "20":
      return 28; // حتى القصص
    case "25":
      return 40; // حتى غافر
    default:
      return SURAHS.length;
  }
}

// نصوص افتتاح / ختام معروفة لبعض السور (للمقاطع الواقعية)
const KNOWN_OPENINGS: Record<string, string> = {
  "الفاتحة": "بِسْمِ اللَّهِ الرَّحْمَنِ الرَّحِيمِ",
  "البقرة": "الم ذَلِكَ الْكِتَابُ لَا رَيْبَ فِيهِ",
  "آل عمران": "الم اللَّهُ لَا إِلَهَ إِلَّا هُوَ الْحَيُّ الْقَيُّومُ",
  "النساء": "يَا أَيُّهَا النَّاسُ اتَّقُوا رَبَّكُمُ",
  "المائدة": "يَا أَيُّهَا الَّذِينَ آمَنُوا أَوْفُوا بِالْعُقُودِ",
  "الأنعام": "الْحَمْدُ لِلَّهِ الَّذِي خَلَقَ السَّمَاوَاتِ",
  "الأعراف": "المص كِتَابٌ أُنزِلَ إِلَيْكَ",
  "الأنفال": "يَسْأَلُونَكَ عَنِ الْأَنفَالِ",
  "التوبة": "بَرَاءَةٌ مِّنَ اللَّهِ وَرَسُولِهِ",
  "يونس": "الر تِلْكَ آيَاتُ الْكِتَابِ الْحَكِيمِ",
  "هود": "الر كِتَابٌ أُحْكِمَتْ آيَاتُهُ ثُمَّ فُصِّلَتْ",
  "يوسف": "الر تِلْكَ آيَاتُ الْكِتَابِ الْمُبِينِ",
  "إبراهيم": "الر كِتَابٌ أَنزَلْنَاهُ إِلَيْكَ",
  "النحل": "أَتَى أَمْرُ اللَّهِ فَلَا تَسْتَعْجِلُوهُ",
  "الإسراء": "سُبْحَانَ الَّذِي أَسْرَى بِعَبْدِهِ لَيْلًا",
  "الكهف": "الْحَمْدُ لِلَّهِ الَّذِي أَنزَلَ عَلَى عَبْدِهِ الْكِتَابَ",
  "مريم": "كَهيعص ذِكْرُ رَحْمَتِ رَبِّكَ عَبْدَهُ زَكَرِيَّا",
  "طه": "طه مَا أَنزَلْنَا عَلَيْكَ الْقُرْآنَ لِتَشْقَى",
  "الأنبياء": "اقْتَرَبَ لِلنَّاسِ حِسَابُهُمْ وَهُمْ فِي غَفْلَةٍ",
  "الحج": "يَا أَيُّهَا النَّاسُ اتَّقُوا رَبَّكُمْ إِنَّ زَلْزَلَةَ السَّاعَةِ",
  "النور": "سُورَةٌ أَنزَلْنَاهَا وَفَرَضْنَاهَا",
  "الفرقان": "تَبَارَكَ الَّذِي نَزَّلَ الْفُرْقَانَ عَلَى عَبْدِهِ",
  "الشعراء": "طسم تِلْكَ آيَاتُ الْكِتَابِ الْمُبِينِ",
  "النمل": "طس تِلْكَ آيَاتُ الْقُرْآنِ وَكِتَابٍ مُّبِينٍ",
  "القصص": "طسم تِلْكَ آيَاتُ الْكِتَابِ الْمُبِينِ",
  "العنكبوت": "الم أَحَسِبَ النَّاسُ أَن يُتْرَكُوا أَن يَقُولُوا آمَنَّا",
  "الروم": "الم غُلِبَتِ الرُّومُ",
  "لقمان": "الم تِلْكَ آيَاتُ الْكِتَابِ الْحَكِيمِ",
  "السجدة": "الم تَنزِيلُ الْكِتَابِ لَا رَيْبَ فِيهِ",
  "الأحزاب": "يَا أَيُّهَا النَّبِيُّ اتَّقِ اللَّهَ",
  "سبأ": "الْحَمْدُ لِلَّهِ الَّذِي لَهُ مَا فِي السَّمَاوَاتِ",
  "فاطر": "الْحَمْدُ لِلَّهِ فَاطِرِ السَّمَاوَاتِ وَالْأَرْضِ",
  "يس": "يس وَالْقُرْآنِ الْحَكِيمِ",
  "الصافات": "وَالصَّافَّاتِ صَفًّا",
  "ص": "ص وَالْقُرْآنِ ذِي الذِّكْرِ",
  "الزمر": "تَنزِيلُ الْكِتَابِ مِنَ اللَّهِ الْعَزِيزِ الْحَكِيمِ",
  "غافر": "حم تَنزِيلُ الْكِتَابِ مِنَ اللَّهِ الْعَزِيزِ",
  "فصلت": "حم تَنزِيلٌ مِّنَ الرَّحْمَنِ الرَّحِيمِ",
};

const KNOWN_CLOSINGS: Record<string, string> = {
  "البقرة": "وَإِلَيْهِ تُرْجَعُونَ",
  "آل عمران": "إِنَّ اللَّهَ لَا يُخْلِفُ الْمِيعَادَ",
  "النساء": "وَكَفَى بِاللَّهِ شَهِيدًا",
  "المائدة": "وَلِلَّهِ مُلْكُ السَّمَاوَاتِ وَالْأَرْضِ",
  "الفاتحة": "صِرَاطَ الَّذِينَ أَنْعَمْتَ عَلَيْهِمْ",
  "يس": "فَسُبْحَانَ الَّذِي بِيَدِهِ مَلَكُوتُ كُلِّ شَيْءٍ",
  "الكهف": "قُلْ إِنَّمَا أَنَا بَشَرٌ مِّثْلُكُمْ",
};

/** توليد المقاطع العشرة لنموذج معيّن (حسب اللائحة والعنصر المطلوب) */
function buildModelSegments(branch: string, modelNumber: number) {
  const maxIdx = branchEndSurahIndex(branch);
  const pool = SURAHS.slice(0, maxIdx);
  const segments = [];
  for (let i = 0; i < 10; i++) {
    // نوزع المقاطع على نطاق السور المدروسة في الفرع
    const startSurahIdx = Math.floor((i * pool.length) / 10);
    const endSurahIdx = Math.min(
      pool.length - 1,
      Math.floor(((i + 1) * pool.length) / 10)
    );
    const startSurah = pool[startSurahIdx]!;
    const endSurah = pool[endSurahIdx]!;
    const fromVerse = 1 + ((modelNumber + i) % Math.max(1, startSurah.verses - 5));
    const toVerse = Math.max(
      fromVerse + 5,
      startSurah.verses
    );
    segments.push({
      number: i + 1,
      fromText: KNOWN_OPENINGS[startSurah.name] ?? `الآيات من سورة ${startSurah.name}`,
      fromSurah: startSurah.name,
      fromVerse,
      toText: KNOWN_CLOSINGS[endSurah.name] ?? `آخر آيات سورة ${endSurah.name}`,
      toSurah: endSurah.name,
      toVerse: Math.min(toVerse, endSurah.verses),
    });
  }
  return segments;
}

function randomPhone(): string {
  return `05${String(Math.floor(100000000 + Math.random() * 899999999))}`;
}

function randomAge(): number {
  return 4 + Math.floor(Math.random() * 15); // 4-18
}

function pickBranch(): string {
  return ["5", "10", "15", "20", "25", "30"][Math.floor(Math.random() * 6)]!;
}

function calculateAge(birthDate: Date): number {
  const diff = Date.now() - birthDate.getTime();
  return Math.floor(diff / (1000 * 60 * 60 * 24 * 365.25));
}

async function main() {
  // ===== 0) المسؤول العام (من بيئة التشغيل) =====
  if (!ADMIN_EMAIL || !ADMIN_PASSWORD) {
    console.error(
      "❌ يجب ضبط ADMIN_EMAIL و ADMIN_PASSWORD لبدء البذر — يُرفض بسبب الأمان"
    );
    process.exit(1);
  }
  if (ADMIN_PASSWORD.length < 4) {
    console.error("❌ كلمة مرور الأدمن يجب أن تكون 4 أحرف على الأقل");
    process.exit(1);
  }
  const adminHashed = await bcrypt.hash(ADMIN_PASSWORD, 12);
  const admin = await prisma.user.upsert({
    where: { email: ADMIN_EMAIL },
    update: { name: ADMIN_NAME, role: Role.ADMIN, birthDate: new Date(ADMIN_BIRTH_DATE), password: adminHashed },
    create: {
      email: ADMIN_EMAIL,
      name: ADMIN_NAME,
      password: adminHashed,
      role: Role.ADMIN,
      birthDate: new Date(ADMIN_BIRTH_DATE),
    },
  });
  console.log("✅ المسؤول العام:", admin.email);

  const demoHash = await bcrypt.hash(DEMO_PASSWORD, 12);

  // ===== 1) الموسم النشط =====
  const now = new Date();
  const startDate = new Date(now.getFullYear(), 0, 1);
  const endDate = new Date(now.getFullYear(), 11, 31, 23, 59, 59);
  const season = await prisma.examSeason.upsert({
    where: { id: "season-1446-first" },
    update: { isActive: true, startDate, endDate },
    create: {
      id: "season-1446-first",
      name: "1446-الفصل الأول",
      startDate,
      endDate,
      isActive: true,
    },
  });
  console.log("✅ الموسم النشط:", season.name);

  // ===== 2) الجهات التعليمية (87 جهة) =====
  const createdInstitutions: string[] = [];
  for (const name of INSTITUTIONS) {
    const existing = await prisma.institution.findFirst({ where: { name } });
    if (existing) {
      createdInstitutions.push(existing.id);
      continue;
    }
    const inst = await prisma.institution.create({
      data: {
        name,
        contactInfo: randomPhone(),
        createdAt: new Date(Date.now() - Math.floor(Math.random() * 180) * 86400000),
      },
    });
    createdInstitutions.push(inst.id);

    // حساب الجهة التعليمية (حساب لكل جهة)
    const email = `inst.${inst.id.slice(0, 8)}@example.com`;
    await prisma.user.create({
      data: {
        email,
        name: `حساب ${name}`,
        password: demoHash,
        role: Role.INSTITUTION,
        birthDate: new Date("1990-01-01"),
        phone: randomPhone(),
        institutionId: inst.id,
      },
    });
  }
  console.log(`✅ الجهات التعليمية: ${createdInstitutions.length} جهة`);

  // ===== 3) المعلمون (8 معلمين بأعمار مختلفة) =====
  const examiners: { id: string; name: string; birthDate: Date }[] = [];
  for (const ex of EXAMINERS) {
    const birthDate = new Date(ex.birthDate);
    const user = await prisma.user.upsert({
      where: { email: ex.email },
      update: { name: ex.name, role: Role.EXAMINER, birthDate },
      create: {
        email: ex.email,
        name: ex.name,
        password: demoHash,
        role: Role.EXAMINER,
        birthDate,
        phone: randomPhone(),
      },
    });
    examiners.push({ id: user.id, name: user.name, birthDate });
    console.log(`✅ المعلّم ${ex.name} — العمر ${calculateAge(birthDate)} سنة`);
  }

  // ===== 4) الحسابات الإدارية =====
  const staffAccounts: { email: string; name: string; role: Role; birthDate: string }[] = [
    { email: "head.affairs@example.com", name: "رئيس الشؤون التعليمية", role: Role.HEAD_OF_AFFAIRS, birthDate: "1972-08-10" },
    { email: "specialist@example.com", name: "أخصائي الاختبارات", role: Role.TEST_SPECIALIST, birthDate: "1985-03-22" },
    { email: "certificate.source@example.com", name: "مصدر الشهادات", role: Role.CERTIFICATE_SOURCE, birthDate: "1991-11-14" },
  ];
  for (const acc of staffAccounts) {
    await prisma.user.upsert({
      where: { email: acc.email },
      update: { name: acc.name, role: acc.role, birthDate: new Date(acc.birthDate) },
      create: {
        email: acc.email,
        name: acc.name,
        password: demoHash,
        role: acc.role,
        birthDate: new Date(acc.birthDate),
        phone: randomPhone(),
      },
    });
  }
  console.log("✅ الحسابات الإدارية جاهزة (رئيس شؤون + أخصائي + مصدر شهادات)");

  // ===== 5) النماذج الاختبارية (100 نموذج لكل فرع من 6 أفرع = 600 نموذج) =====
  const modelInstitutionId = createdInstitutions[0]!;
  const modelBranches = ["5", "10", "15", "20", "25", "30"];
  let modelCount = 0;
  for (const branch of modelBranches) {
    for (let m = 1; m <= 100; m++) {
      const existing = await prisma.examModel.findFirst({
        where: {
          institutionId: modelInstitutionId,
          modelNumber: m,
          seasonId: season.id,
          branch,
        },
      });
      if (existing) continue;
      await prisma.examModel.create({
        data: {
          modelNumber: m,
          branch,
          detailsJSON: { segments: buildModelSegments(branch, m) },
          segmentsCount: 10,
          institutionId: modelInstitutionId,
          seasonId: season.id,
        },
      });
      modelCount++;
    }
  }
  console.log(`✅ النماذج الاختبارية: ${modelCount} نموذج جديد (100 لكل فرع، 6 أفرع)`);

  // ===== 6) الطلاب (200+ موزعون بتوازن على الجهات) =====
  const STUDENT_COUNT = 250;
  const firstNames = ["محمد", "أحمد", "عبدالله", "عمر", "خالد", "يوسف", "إبراهيم", "علي", "حسن", "زينب", "فاطمة", "مريم", "سارة", "نورة", "هند", "عائشة", "رقية", "أم كلثوم", "سلمان", "أنس"];
  const lastNames = ["العتيبي", "الجهني", "الأنصاري", "الحربي", "القحطاني", "الزهراني", "السلمي", "الغامدي", "البلوي", "المطيري", "الشمري", "السبيعي"];

  let studentCount = 0;
  const createdStudents: { id: string; name: string; branch: string; institutionId: string }[] = [];
  for (let i = 0; i < STUDENT_COUNT; i++) {
    const instId = createdInstitutions[i % createdInstitutions.length]!;
    const name = `${firstNames[i % firstNames.length]!} ${lastNames[i % lastNames.length]!}`;
    const existing = await prisma.student.findFirst({
      where: { name, institutionId: instId },
    });
    if (existing) continue;
    const student = await prisma.student.create({
      data: {
        name,
        age: randomAge(),
        branch: pickBranch(),
        teacherName: examiners[i % examiners.length]!.name,
        parentPhone: randomPhone(),
        address: `${CITIES[i % CITIES.length]!} — حي النور`,
        phone: randomPhone(),
        status: i % 5 === 0 ? StudentStatus.PENDING : StudentStatus.APPROVED,
        institutionId: instId,
      },
    });
    createdStudents.push({ id: student.id, name: student.name, branch: student.branch, institutionId: instId });
    studentCount++;
  }
  console.log(`✅ الطلاب: ${studentCount} طالباً موزعين على ${createdInstitutions.length} جهة`);

  // ===== 7) اللجان المتوازنة (معلمان لكل لجنة + 3-5 طلاب) =====
  // نقسم المعلمين: الأكبر سناً + الأصغر سناً
  const sortedExaminers = [...examiners].sort((a, b) => a.birthDate.getTime() - b.birthDate.getTime());
  const seniorTeachers = sortedExaminers.slice(0, 4); // الأكبر
  const juniorTeachers = sortedExaminers.slice(4); // الأصغر

  // أعمار صحيحة: نتحقق أن senior أكبر من junior (افتراضياً هكذا بالفرز)
  let committeeCount = 0;
  const usedDates = new Set<string>();
  const approvedStudents = createdStudents.filter(
    (s) => (createdStudents.indexOf(s) % 5 !== 0)
  );

  // نكوّن لجاناً بحيث تشمل المعلمين جميعاً
  for (let i = 0; i < seniorTeachers.length && i < juniorTeachers.length; i++) {
    const senior = seniorTeachers[i]!;
    const junior = juniorTeachers[i]!;
    // 3-5 طلاب لكل لجنة
    const groupSize = 3 + (i % 3); // 3,4,5
    const group = approvedStudents.slice(
      i * groupSize,
      i * groupSize + groupSize
    );
    for (const student of group) {
      // تاريخ فريد لكل جلسة (لتجنب تعارض مواعيد المعلمين)
      let examDate = new Date(now.getFullYear(), now.getMonth() + 1 + i, 10 + committeeCount % 15);
      while (usedDates.has(examDate.toISOString().slice(0, 10))) {
        examDate.setDate(examDate.getDate() + 1);
      }
      usedDates.add(examDate.toISOString().slice(0, 10));

      const existingSession = await prisma.examSession.findFirst({
        where: { studentId: student.id, seasonId: season.id },
      });
      if (existingSession) continue;

      await prisma.examSession.create({
        data: {
          studentId: student.id,
          teacher1Id: senior.id,
          teacher2Id: junior.id,
          examDate,
          period: i % 2 === 0 ? "صباحي" : "مسائي",
          status: "SCHEDULED",
          seasonId: season.id,
        },
      });
      // تحديث حالة الطالب إلى ASSIGNED (لأننا كوّنا له لجنة)
      // فقط إن لم يكن قد تحرك من APPROVED (أي مازال قابلاً للتوزيع)
      await prisma.student.updateMany({
        where: { id: student.id, status: StudentStatus.APPROVED },
        data: { status: StudentStatus.ASSIGNED },
      });
      committeeCount++;
    }
  }
  console.log(`✅ اللجان: ${committeeCount} جلسة مكوّنة (معلمان لكل لجنة، 3-5 طلاب)`);

  // ===== 8) تقرير ختامي =====
  const counts = {
    users: await prisma.user.count(),
    institutions: await prisma.institution.count(),
    students: await prisma.student.count(),
    examModels: await prisma.examModel.count(),
    examSeasons: await prisma.examSeason.count(),
    examSessions: await prisma.examSession.count(),
  };
  console.log("🏁 ملخص قاعدة البيانات:", counts);

  console.log("");
  console.log("🔑 حسابات تجريبية (كلمة المرور موحدة):", DEMO_PASSWORD);
  console.log("   - أخصائي: specialist@example.com");
  console.log("   - رئيس الشؤون: head.affairs@example.com");
  console.log("   - مصدر الشهادات: certificate.source@example.com");
  console.log("   - معلم: ahmed.mohammad@example.com");
}

main()
  .catch((e) => {
    console.error("❌ حدث خطأ أثناء البذر:", e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });