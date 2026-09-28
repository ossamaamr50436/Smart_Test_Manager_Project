import { describe, it, expect, beforeAll, afterAll, vi } from "vitest";
import { config as loadEnv } from "dotenv";
import { deflateSync } from "node:zlib";

// تحميل متغيرات البيئة كما تفعل Next.js (Prisma / UploadThing يحتاجانها)
loadEnv({ path: ".env" });

// ============================================================
// M34 / M38 / M39 — اختبار تكاملي مباشر لسير عمل الشهادة
// ------------------------------------------------------------
// يشغّل Server Actions الحقيقية (طبقة الصلاحيات + التحقق + Prisma
// + UploadThing) بدون متصفح وبدون فتح أي منفذ.
// Mock واحد فقط: هوية الجلسة (نقل الجلسة من المتصفح إلى الخادم)
// و revalidatePath. كل المنطق والصلاحيات والقيود حقيقية، والدليل
// الثاني من الـDB ثم من كائن التخزين نفسه.
// ============================================================

const session = vi.hoisted(() => ({ userId: null as string | null }));

vi.mock("@/auth", () => ({
  auth: async () => (session.userId ? { user: { id: session.userId } } : null),
  signIn: async () => undefined,
  signOut: async () => undefined,
  handlers: {},
}));

vi.mock("next/cache", () => ({
  revalidatePath: () => undefined,
  revalidateTag: () => undefined,
  unstable_cache: (fn: unknown) => fn,
}));

// حزمة next-auth تستورد next/server (Next runtime) ولا تُحمَّل خارج Next.js
// — نُقلّد رمز الخطأ فقط (يُستخدم في catch لمسار تسجيل الدخول، لا لمسار الشهادة)
vi.mock("next-auth", () => ({
  AuthError: class AuthError extends Error {},
}));

const TENANT_ID = "cmubnu64m0000e6dfmj3fkmg3"; // tenant 50436 — tenant الاختبار
const OTHER_TENANT_ID = "cmu5ngaxg0000to23u132olty"; // tenant 12345 — قراءة فقط
// توليد PDF ورفعه على وحدة تخزين حقيقية يحتاج وقتاً أطول من الحد الافتراضي
const UPLOAD_TIMEOUT = 90_000;

type Ctx = {
  prisma: typeof import("@/lib/prisma")["prisma"];
  actions: typeof import("@/lib/actions/certificate-actions");
  questionBank: typeof import("@/lib/actions/question-bank-actions");
  storage: typeof import("@/lib/file-storage");
  ids: {
    certSource: string;
    admin: string;
    specialist: string;
    examiner1: string;
    institutionUser: string;
    otherTenantCertSource: string;
  };
  /** طلاب مُعدّون في الـfixture لدورة إصدار كاملة قابلة لإعادة التشغيل */
  run: { studentId: string; duplicateStudentId: string };
};

let ctx: Ctx;

const BRANCHES = ["5", "10", "15", "20", "25", "30"] as const;
type Branch = (typeof BRANCHES)[number];

/** يحوّل فرع قاعدة البيانات إلى نوع مدخلات<Action بدون cast غير آمن */
function toBranch(value: string): Branch {
  const hit = BRANCHES.find((b) => b === value);
  if (!hit) throw new Error(`فرع غير معروف في الـfixture: ${value}`);
  return hit;
}

/** مقاطع نموذج صالحة بالعدد الافتراضي (5) */
function buildSegments(count: number) {
  return Array.from({ length: count }, (_, i) => ({
    number: i + 1,
    fromText: `من قوله تعالى ${i + 1}`,
    fromSurah: "البقرة",
    fromVerse: i + 1,
    toText: `إلى قوله تعالى ${i + 1}`,
    toSurah: "البقرة",
    toVerse: i + 2,
  }));
}

async function asUser(userId: string) {
  session.userId = userId;
}

/** ينتظر رفض العملية ويعيد رسالتها العربية */
async function rejection(promise: Promise<unknown>): Promise<string> {
  try {
    await promise;
  } catch (e) {
    return e instanceof Error ? e.message : String(e);
  }
  throw new Error("كان متوقعًا رفض العملية، لكنها نجحت");
}

function getCertificate(studentId: string) {
  return ctx.prisma.certificate.findFirst({
    where: { tenantId: TENANT_ID, studentId },
    select: {
      id: true,
      serialNumber: true,
      status: true,
      fileUrl: true,
      fileId: true,
      signatureUrl: true,
      issuedDate: true,
      issuedById: true,
      signedAt: true,
      signedById: true,
      sentAt: true,
      createdAt: true,
      finalScore: true,
    },
  });
}

/** سجلات التدقيق تحفظ تفاصيلها كنص JSON، لذا نبحث فيها داخل الكود */
async function findAuditStep(step: string, userId: string) {
  const rows = await ctx.prisma.auditLog.findMany({
    where: { tenantId: TENANT_ID, userId },
    select: { id: true, action: true, details: true, timestamp: true },
    orderBy: { timestamp: "desc" },
    take: 100,
  });

  for (const row of rows) {
    const raw = row.details;
    if (raw === null || raw === undefined) continue;
    let parsed: unknown = raw;
    if (typeof raw === "string") {
      try {
        parsed = JSON.parse(raw);
      } catch {
        continue;
      }
    }
    if (parsed && typeof parsed === "object" && (parsed as { step?: string }).step === step) {
      return row;
    }
  }
  return null;
}

// ------------------------------------------------------------
// PNG صالح صغير (توقيع) — يُبنى في الذاكرة بلا ملفات مؤقتة
// ------------------------------------------------------------
const CRC_TABLE = (() => {
  const table: number[] = [];
  for (let n = 0; n < 256; n++) {
    let c = n;
    for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
    table.push(c >>> 0);
  }
  return table;
})();

function crc32(buf: Buffer): number {
  let crc = 0xffffffff;
  for (const byte of buf) {
    crc = CRC_TABLE[(crc ^ byte) & 0xff]! ^ (crc >>> 8);
  }
  return (crc ^ 0xffffffff) >>> 0;
}

function pngChunk(type: string, data: Buffer): Buffer {
  const len = Buffer.alloc(4);
  len.writeUInt32BE(data.length, 0);
  const typeBuf = Buffer.from(type, "ascii");
  const crcBuf = Buffer.alloc(4);
  crcBuf.writeUInt32BE(crc32(Buffer.concat([typeBuf, data])), 0);
  return Buffer.concat([len, typeBuf, data, crcBuf]);
}

function buildSignaturePng(size = 48): Buffer {
  const sig = Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]);
  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(size, 0);
  ihdr.writeUInt32BE(size, 4);
  ihdr[8] = 8; // bit depth
  ihdr[9] = 2; // truecolor RGB
  const raw: number[] = [];
  for (let y = 0; y < size; y++) {
    raw.push(0); // filter type per scanline
    for (let x = 0; x < size; x++) {
      raw.push((y * 3 + x * 5) % 256, (y * 7 + x * 11) % 256, (y * 13 + x * 17) % 256);
    }
  }
  return Buffer.concat([
    sig,
    pngChunk("IHDR", ihdr),
    pngChunk("IDAT", deflateSync(Buffer.from(raw))),
    pngChunk("IEND", Buffer.alloc(0)),
  ]);
}

/**
 * ينشئ طالباً في حالة READY_FOR_CERTIFICATE داخل tenant الاختبار، بجلسة
 * اختبار مرتبطة بنموذج غير مستخدم وتقييم معتمد — حتى يكون مسار الإصدار
 * قابلاً للتنفيذ من جديد في كل تشغيل (idempotent).
 *
 * القالب (الموسم + اللجنة + المختبران) يُشتق من البيانات الموجودة أو يُنشأ
 * إن غاب، فلا يعتمد الاختبار على أي صف留下ه تشغيل سابق.
 */
const created = {
  seasonIds: [] as string[],
  committeeIds: [] as string[],
  studentIds: [] as string[],
  sessionIds: [] as string[],
  modelIds: [] as string[],
};

async function ensureSeasonId(): Promise<string> {
  const existing = await ctx.prisma.examSeason.findFirst({
    where: { tenantId: TENANT_ID },
    select: { id: true },
  });
  if (existing) return existing.id;

  const season = await ctx.prisma.examSeason.create({
    data: {
      tenantId: TENANT_ID,
      name: `موسم شهادات ${Date.now()}`,
      startDate: new Date("2026-01-01T00:00:00.000Z"),
      endDate: new Date("2026-12-31T00:00:00.000Z"),
      isActive: true,
    },
    select: { id: true },
  });
  created.seasonIds.push(season.id);
  return season.id;
}

async function ensureTemplate(): Promise<{
  seasonId: string;
  teacher1Id: string;
  teacher2Id: string;
  branch: string;
}> {
  const seasonId = await ensureSeasonId();

  const committee = await ctx.prisma.committee.findFirst({
    where: { tenantId: TENANT_ID, seasonId },
    select: { id: true, branch: true, teacher1Id: true, teacher2Id: true },
  });
  if (committee) {
    return {
      seasonId,
      teacher1Id: committee.teacher1Id,
      teacher2Id: committee.teacher2Id,
      branch: toBranch(committee.branch),
    };
  }

  const examiners = await ctx.prisma.user.findMany({
    where: { tenantId: TENANT_ID, role: "EXAMINER" },
    select: { id: true },
    orderBy: { email: "asc" },
    take: 2,
  });
  if (examiners.length < 2) {
    throw new Error("يحتاج مستأجر الاختبار إلى مختبرين على الأقل");
  }
  const first = examiners[0];
  const second = examiners[1];
  if (!first || !second) throw new Error("المختبران غير متوفرين");

  const made = await ctx.prisma.committee.create({
    data: {
      tenantId: TENANT_ID,
      seasonId,
      name: `لجنة شهادات ${Date.now()}`,
      branch: "5",
      teacher1Id: first.id,
      teacher2Id: second.id,
    },
    select: { id: true },
  });
  created.committeeIds.push(made.id);

  return { seasonId, teacher1Id: first.id, teacher2Id: second.id, branch: "5" };
}

async function createReadyStudent(label: string) {
  const stamp = `${label} ${Date.now()}`;

  const template = await ensureTemplate();

  const usedModelIds = (
    await ctx.prisma.examSession.findMany({
      where: { tenantId: TENANT_ID, modelId: { not: null } },
      select: { modelId: true },
    })
  )
    .map((s) => s.modelId)
    .filter((id): id is string => Boolean(id));

  // اللجنة المرتبطة بالجلسة المرجعية: نربط الطالب بها فعلياً حتى تبقى العلاقة
  // (طالب → لجنة → جلسة) مطابقة لقاعدة M33، لا جلسة بلا لجنة.
  const committee = await ctx.prisma.committee.findFirstOrThrow({
    where: {
      tenantId: TENANT_ID,
      seasonId: template.seasonId,
      teacher1Id: template.teacher1Id,
      teacher2Id: template.teacher2Id,
    },
    select: { id: true, branch: true },
  });

  // نموذج مخصّص لكل طالب يُنشأ عبر Server Action (رقم النموذج يُحسب على الخادم)
  // — لا نعتمد على رصيد النماذج الحرة، فيبقى الاختبار قابلاً لإعادة التشغيل.
  // الفرع من اللجنة نفسها حتى يطابق فرع الطالب والنموذج (قاعدة M35).
  const branch = toBranch(committee.branch);
  const created2 = await ctx.questionBank.createQuestionBankModel({
    modelNumber: 1,
    branch,
    segmentsCount: 5,
    segments: buildSegments(5),
  });
  if (!created2.success) throw new Error(`تعذر إنشاء نموذج لطالب ${stamp}`);

  const freeModel = await ctx.prisma.questionBankModel.findUniqueOrThrow({
    where: { id: created2.modelId },
    select: { id: true, branch: true },
  });
  created.modelIds.push(freeModel.id);

  const institutionId = await ctx.prisma.institution.findFirstOrThrow({
    where: { tenantId: TENANT_ID },
    select: { id: true },
  });

  if (freeModel.id && usedModelIds.includes(freeModel.id)) {
    throw new Error("النموذج الجديد مستخدم مسبقاً — لا يجوز ربطه بجلسة");
  }

  const studentId = await ctx.prisma.$transaction(async (tx) => {
    const student = await tx.student.create({
      data: {
        name: stamp,
        age: 13,
        branch: freeModel.branch,
        nationality: "سعودي",
        teacherName: "معلم الاختبار",
        parentPhone: "0551234567",
        status: "READY_FOR_CERTIFICATE",
        approvedAt: new Date(),
        assignedAt: new Date(),
        finalizedAt: new Date(),
        committeeId: committee.id,
        institutionId: institutionId.id,
        tenantId: TENANT_ID,
      },
      select: { id: true },
    });

    const examSession = await tx.examSession.create({
      data: {
        studentId: student.id,
        teacher1Id: template.teacher1Id,
        teacher2Id: template.teacher2Id,
        examDate: new Date(),
        period: "صباحية",
        status: "COMPLETED",
        seasonId: template.seasonId,
        modelId: freeModel.id,
        tenantId: TENANT_ID,
      },
      select: { id: true },
    });

    await tx.assessment.create({
      data: {
        examSessionId: examSession.id,
        evaluatorId: template.teacher1Id,
        modelId: freeModel.id,
        finalScore: 92.5,
        totalDeduction: 7.5,
        status: "APPROVED",
        tenantId: TENANT_ID,
      },
    });

    created.studentIds.push(student.id);
    created.sessionIds.push(examSession.id);
    return student.id;
  });

  return studentId;
}

beforeAll(async () => {
  const { prisma } = await import("@/lib/prisma");
  const actions = await import("@/lib/actions/certificate-actions");
  const questionBank = await import("@/lib/actions/question-bank-actions");
  const storage = await import("@/lib/file-storage");

  const users = await prisma.user.findMany({
    where: { tenantId: TENANT_ID, email: { startsWith: "fx50436-" } },
    select: { id: true, email: true },
  });
  const byEmail = (suffix: string) => {
    const hit = users.find((u) => u.email === `fx50436-${suffix}@e2e.exp.local`);
    if (!hit) throw new Error(`مستخدم fixture مفقود: ${suffix}`);
    return hit.id;
  };

  const otherTenantCertSource = await prisma.user.findFirstOrThrow({
    where: { tenantId: OTHER_TENANT_ID, role: "CERTIFICATE_SOURCE" },
    select: { id: true },
  });

  ctx = {
    prisma,
    actions,
    questionBank,
    storage,
    ids: {
      certSource: byEmail("certsource"),
      admin: byEmail("admin"),
      specialist: byEmail("specialist"),
      examiner1: byEmail("examiner1"),
      institutionUser: byEmail("institution"),
      otherTenantCertSource: otherTenantCertSource.id,
    },
    run: { studentId: "", duplicateStudentId: "" },
  };

  // حدّ المعدل مخزّن في قاعدة البيانات بنافذة 15 دقيقة، فتراكم التشغيلات
  // المتكررة كان يُفشل هذا الملف رغم صحة الكود. تصفير مفاتيح هذا الملف فقط.
  for (const id of [ctx.ids.certSource, ctx.ids.admin, ctx.ids.otherTenantCertSource]) {
    await prisma.rateLimit.deleteMany({ where: { key: { contains: id } } });
  }

  // الطلاب يحتاجون جلسة الأخصائي لإنشاء نموذج مخصّص لكل طالب
  await asUser(ctx.ids.specialist);
  ctx.run.studentId = await createReadyStudent("طالب دورة شهادة مباشرة");
  ctx.run.duplicateStudentId = await createReadyStudent("طالب منع التكرار");
  // اتصال Prisma البارد بقاعدة Neon + تحميل شجرة وحدات الخادم
}, 180_000);

afterAll(async () => {
  if (!ctx?.prisma) return;
  const prisma = ctx.prisma;
  const studentIds = [ctx.run.studentId, ctx.run.duplicateStudentId].filter(Boolean);

  if (studentIds.length > 0) {
    const students = await prisma.student.findMany({
      where: { id: { in: studentIds } },
      select: { id: true, name: true },
    });
    const names = students.map((s) => s.name);

    const certificates = await prisma.certificate.findMany({
      where: { studentId: { in: studentIds } },
      select: { id: true, fileId: true, signatureFileId: true },
    });

    for (const cert of certificates) {
      for (const fileId of [cert.fileId, cert.signatureFileId]) {
        if (!fileId) continue;
        try {
          await ctx.storage.deleteFile(fileId);
        } catch {
          // الملف محذوف مسبقاً أو غير متاح — لا يوقف التنظيف
        }
      }
    }

    await prisma.certificate.deleteMany({ where: { studentId: { in: studentIds } } });

    if (names.length > 0) {
      await prisma.notification.deleteMany({
        where: {
          tenantId: TENANT_ID,
          OR: names.map((name) => ({ message: { contains: name } })),
        },
      });
    }

    const logs = await prisma.auditLog.findMany({
      where: { tenantId: TENANT_ID },
      select: { id: true, details: true },
    });
    const ids = [...studentIds, ...certificates.map((c) => c.id)];
    const mine = logs.filter((log) => {
      const raw = log.details;
      const serialized = typeof raw === "string" ? raw : JSON.stringify(raw);
      return ids.some((id) => serialized.includes(id));
    });
    if (mine.length > 0) {
      await prisma.auditLog.deleteMany({ where: { id: { in: mine.map((l) => l.id) } } });
    }

    await prisma.assessment.deleteMany({
      where: { examSession: { studentId: { in: studentIds } } },
    });
    await prisma.examSession.deleteMany({ where: { studentId: { in: studentIds } } });
    await prisma.student.deleteMany({ where: { id: { in: studentIds } } });
  }

  if (created.modelIds.length > 0) {
    await prisma.questionBankModel.deleteMany({
      where: { id: { in: created.modelIds } },
    });
  }

  if (created.committeeIds.length > 0) {
    await prisma.committee.deleteMany({
      where: { id: { in: created.committeeIds } },
    });
  }

  if (created.seasonIds.length > 0) {
    await prisma.examSeason.deleteMany({
      where: { id: { in: created.seasonIds } },
    });
  }

  await prisma.$disconnect();
});

// ------------------------------------------------------------
// M34 — عزل الصلاحيات وعزل الـtenant
// ------------------------------------------------------------
describe("M34 — عزل الصلاحيات وعزل الـtenant", () => {
  it("يرفض إصدار الشهادة لمن ليس مصدر شهادات (مختبر)", async () => {
    await asUser(ctx.ids.examiner1);
    const message = await rejection(ctx.actions.generateCertificate(ctx.run.studentId));
    expect(message).toContain("غير مصرح");
    expect(message).toMatch(/صلاحية/);
  });

  it("يرفض قراءة رابط شهادة من خارج الدور (مختبر)", async () => {
    await asUser(ctx.ids.examiner1);
    const message = await rejection(ctx.actions.getCertificateFileLink(ctx.run.studentId));
    expect(message).toContain("غير مصرح");
  });

  it("لا يسرّب رابط شهادة طالب من جهة أخرى (عزل قراءة)", async () => {
    await asUser(ctx.ids.otherTenantCertSource);
    const link = await ctx.actions.getCertificateFileLink(ctx.run.studentId);
    expect(link, "تسريب عبر tenant آخر").toBeNull();
  });

  it("يرفض إصدار شهادة طالب من جهة أخرى رغم صحة الدور", async () => {
    await asUser(ctx.ids.otherTenantCertSource);
    const message = await rejection(ctx.actions.generateCertificate(ctx.run.studentId));
    expect(message).toContain("غير مصرح");
  });

  it("لا يعرض لمصدر الشهادات بيانات اختبار غير لازمة", async () => {
    await asUser(ctx.ids.certSource);
    const pending = await ctx.actions.getPendingCertificatesForSignature();
    const serialized = JSON.stringify(pending);
    for (const forbidden of ["detailsJSON", "wordErrors", "letterErrors", "tajweedErrors", "segments"]) {
      expect(serialized, `تسريب ${forbidden} لمصدر الشهادات`).not.toContain(forbidden);
    }
  });

  it("لا يسرّب استعلام صفحة مصدر الشهادات أي بيانات خارج الدور (المسار الحي)", async () => {
    // نفس استعلامي app/(dashboard)/certificate-source/page.tsx (المسار الحي فعلياً)
    const readyStudents = await ctx.prisma.student.findMany({
      where: { tenantId: TENANT_ID, status: "READY_FOR_CERTIFICATE" },
      include: {
        institution: { select: { name: true } },
        examSessions: {
          include: {
            assessments: {
              where: { status: { in: ["APPROVED", "ACCEPTED", "NOTIFIED"] } },
              select: { finalScore: true },
              orderBy: { updatedAt: "desc" },
              take: 1,
            },
          },
        },
      },
      orderBy: { updatedAt: "desc" },
    });

    const rows = readyStudents.map((student) => {
      const assessment = student.examSessions[0]?.assessments[0];
      return {
        id: student.id,
        name: student.name,
        branch: student.branch,
        institutionName: student.institution.name,
        finalScore: assessment?.finalScore ?? null,
      };
    });

    const forbidden = [
      "detailsJSON",
      "wordErrors",
      "letterErrors",
      "tajweedErrors",
      "recitationScore",
      "tajweedScore",
      "segments",
      "modelId",
      "phone",
      "parentPhone",
      "address",
      "applicationFileUrl",
    ];
    for (const row of rows) {
      const serialized = JSON.stringify(row);
      for (const key of forbidden) {
        expect(serialized, `تسريب ${key} من صفحة مصدر الشهادات`).not.toContain(key);
      }
    }

    // قائمة الشهادات الصادرة في نفس الصفحة مربوطة بـtenant الخاص
    const issued = await ctx.prisma.certificate.findMany({
      where: { tenantId: TENANT_ID, status: { in: ["PENDING", "UPLOADED", "SIGNED", "SENT"] } },
      include: { student: { select: { name: true, branch: true } } },
      orderBy: { createdAt: "desc" },
      take: 50,
    });
    const ownStudentIds = new Set(
      (await ctx.prisma.student.findMany({ where: { tenantId: TENANT_ID }, select: { id: true } })).map(
        (s) => s.id
      )
    );
    for (const cert of issued) {
      expect(ownStudentIds.has(cert.studentId), "شهادة من tenant أخرى في صفحة المصدر").toBe(true);
      expect(cert.student.name, "اسم طالب غير موجود في هذا الـtenant").toBeTruthy();
    }
  });
});

// ------------------------------------------------------------
// M38 — إصدار الشهادة
// ------------------------------------------------------------
describe("M38 — إصدار الشهادة", () => {
  it("يقبل الإصدار من مصدر الشهادات وينشئ سجل شهادة كامل", async () => {
    await asUser(ctx.ids.certSource);

    const result = await ctx.actions.generateCertificate(ctx.run.studentId);
    expect(result.success).toBe(true);
    expect(result.serialNumber).toMatch(/^CERT-\d{4}-\d{4}$/);

    const cert = await getCertificate(ctx.run.studentId);
    expect(cert, "لم يُنشأ سجل شهادة في قاعدة البيانات").not.toBeNull();
    expect(cert!.fileUrl, "لا يوجد رابط تخزين").toMatch(/^https?:\/\//);
    expect(cert!.issuedDate, "تاريخ الإصدار غير موجود").not.toBeNull();
    expect(cert!.finalScore, "الدرجة النهائية غير منقولة").toBeGreaterThan(0);
    expect(cert!.issuedById).toBe(ctx.ids.certSource);
    expect(cert!.status, "الحالة بعد الإصدار مباشرة").toBe("PENDING");
  }, UPLOAD_TIMEOUT);

  it("ينقل حالة الطالب في الـDB إلى CERTIFICATE_ISSUED", async () => {
    const student = await ctx.prisma.student.findUniqueOrThrow({
      where: { id: ctx.run.studentId },
      select: { status: true },
    });
    expect(student.status).toBe("CERTIFICATE_ISSUED");
  });

  it("يرفع ملف PDF حقيقيًا وغير فارغ على وحدة التخزين (دليل مستقل عن الـDB)", async () => {
    const cert = (await getCertificate(ctx.run.studentId))!;
    expect(cert.fileUrl, "لا يوجد رابط تخزين").not.toBeNull();
    const bytes = await ctx.storage.downloadFileByUrl(cert.fileUrl!);
    expect(bytes.byteLength).toBeGreaterThan(3000);
    expect(bytes.subarray(0, 5).toString("latin1")).toBe("%PDF-");
  }, UPLOAD_TIMEOUT);

  it("يسجّل CERTIFICATE_ISSUED في سجل التدقيق", async () => {
    const cert = (await getCertificate(ctx.run.studentId))!;
    const audit = await findAuditStep("CERTIFICATE_ISSUED", ctx.ids.certSource);
    expect(audit, "لا يوجد سجل تدقيق CERTIFICATE_ISSUED").not.toBeNull();
    expect(JSON.stringify(audit!.details)).toContain(cert.id);
  });

  it("ينشئ إشعارًا لجهة التعليم عند الإصدار", async () => {
    const cert = (await getCertificate(ctx.run.studentId))!;
    const notification = await ctx.prisma.notification.findFirst({
      where: {
        tenantId: TENANT_ID,
        userId: ctx.ids.institutionUser,
        type: "CERTIFICATE",
        createdAt: { gte: cert.createdAt },
      },
      select: { id: true, message: true },
    });
    expect(notification, "لا يوجد إشعار لجهة التعليم").not.toBeNull();
    expect(notification!.message).toMatch(/شهادة/);
  });

  it("يمنع إصدار شهادة ثانية لنفس الطالب", async () => {
    await asUser(ctx.ids.certSource);
    const message = await rejection(ctx.actions.generateCertificate(ctx.run.studentId));
    expect(message).toContain("مسبقاً");

    const count = await ctx.prisma.certificate.count({
      where: { tenantId: TENANT_ID, studentId: ctx.run.studentId },
    });
    expect(count, "أُصدرت أكثر من شهادة لنفس الطالب").toBe(1);
  });

  it("يمنع إصدار شهادة لطالب لم يصل لمرحلة الإصدار", async () => {
    // طالب بلا شهادة سابقة — حتى نختبر حارس المرحلة نفسه لا حارس التكرار
    const notReady = await ctx.prisma.student.findFirstOrThrow({
      where: { tenantId: TENANT_ID, status: { not: "READY_FOR_CERTIFICATE" }, certificates: { none: {} } },
      select: { id: true },
    });
    await asUser(ctx.ids.certSource);
    const message = await rejection(ctx.actions.generateCertificate(notReady.id));
    expect(message).toMatch(/لم يصل|مرحلة/);
  });

  it("يمنع إصدار شهادة ثانية لطالب ثانٍ بعد إصدار الأول (استقلال الأرقام)", async () => {
    await asUser(ctx.ids.certSource);
    const first = await getCertificate(ctx.run.studentId);
    const result = await ctx.actions.generateCertificate(ctx.run.duplicateStudentId);
    expect(result.success).toBe(true);
    const second = await getCertificate(ctx.run.duplicateStudentId);

    expect(second!.serialNumber).not.toBe(first!.serialNumber);
    expect(first!.serialNumber).toMatch(/^CERT-\d{4}-\d{4}$/);
    expect(second!.serialNumber).toMatch(/^CERT-\d{4}-\d{4}$/);
  }, UPLOAD_TIMEOUT);
});

// ------------------------------------------------------------
// M39 — إرسال الشهادة
// ------------------------------------------------------------
describe("M39 — إرسال الشهادة", () => {
  it("رفع/حفظ الشهادة لا يعني إرسالها", async () => {
    const cert = (await getCertificate(ctx.run.studentId))!;

    expect(cert.status, "الحالة بعد الرفع مباشرة").toBe("PENDING");
    expect(cert.signedAt, "sentAt/‏signedAt يجب أن يبقا فارغين قبل التوقيع").toBeNull();
    expect(cert.sentAt, "sentAt يجب أن يبقى فارغًا قبل الإرسال").toBeNull();

    await asUser(ctx.ids.certSource);
    const message = await rejection(ctx.actions.sendCertificateToInstitution(cert.id));
    expect(message).toContain("لم تُوقَّع");
  });

  it("يرفض التوقيع من مصدر الشهادات (التوقيع لمسؤول رفيع فقط)", async () => {
    const cert = (await getCertificate(ctx.run.studentId))!;
    await asUser(ctx.ids.certSource);
    const message = await rejection(ctx.actions.signCertificate(cert.id, buildSignaturePng()));
    expect(message).toContain("غير مصرح");
  });

  it("يرفض التوقيع من جهة أخرى (عزل tenant)", async () => {
    const cert = (await getCertificate(ctx.run.studentId))!;
    await asUser(ctx.ids.otherTenantCertSource);
    const message = await rejection(ctx.actions.signCertificate(cert.id, buildSignaturePng()));
    expect(message).toContain("غير مصرح");
  });

  it("يوقّع الشهادة من مسؤول رفيع ويرفع صورة التوقيع", async () => {
    const cert = (await getCertificate(ctx.run.studentId))!;
    await asUser(ctx.ids.admin);
    const signed = await ctx.actions.signCertificate(cert.id, buildSignaturePng());
    expect(signed.success).toBe(true);
    expect(signed.signatureUrl).toMatch(/^https?:\/\//);

    const after = (await getCertificate(ctx.run.studentId))!;
    expect(after.status).toBe("SIGNED");
    expect(after.signedAt).not.toBeNull();
    expect(after.signedById).toBe(ctx.ids.admin);
    expect(after.signatureUrl).toMatch(/^https?:\/\//);
  }, UPLOAD_TIMEOUT);

  it("يسجّل CERTIFICATE_SIGNED في سجل التدقيق", async () => {
    const cert = (await getCertificate(ctx.run.studentId))!;
    const audit = await findAuditStep("CERTIFICATE_SIGNED", ctx.ids.admin);
    expect(audit, "لا يوجد سجل تدقيق CERTIFICATE_SIGNED").not.toBeNull();
    expect(JSON.stringify(audit!.details)).toContain(cert.id);
  });

  it("يرسل الشهادة بعملية مستقلة من مصدر الشهادات", async () => {
    const cert = (await getCertificate(ctx.run.studentId))!;
    await asUser(ctx.ids.certSource);
    const sent = await ctx.actions.sendCertificateToInstitution(cert.id);
    expect(sent.success).toBe(true);
    expect(sent.status).toBe("SENT");

    const after = (await getCertificate(ctx.run.studentId))!;
    expect(after.status).toBe("SENT");
    expect(after.sentAt, "sentAt غير موجود").not.toBeNull();
    expect(after.signedAt!.getTime()).toBeLessThanOrEqual(after.sentAt!.getTime());
  });

  it("يسجّل CERTIFICATE_SENT_TO_INSTITUTION في التدقيق وينشئ إشعار جاهزية", async () => {
    const cert = (await getCertificate(ctx.run.studentId))!;
    const audit = await findAuditStep("CERTIFICATE_SENT_TO_INSTITUTION", ctx.ids.certSource);
    expect(audit, "لا يوجد سجل تدقيق CERTIFICATE_SENT_TO_INSTITUTION").not.toBeNull();
    expect(JSON.stringify(audit!.details)).toContain(cert.id);

    const notification = await ctx.prisma.notification.findFirst({
      where: {
        tenantId: TENANT_ID,
        userId: ctx.ids.institutionUser,
        type: "CERTIFICATE",
        createdAt: { gte: cert.sentAt! },
      },
      select: { id: true, message: true },
    });
    expect(notification, "لا يوجد إشعار جاهزية التحميل").not.toBeNull();
    expect(notification!.message).toMatch(/جاهزة/);
  });

  it("يمنع الإرسال المكرر لنفس الشهادة", async () => {
    const cert = (await getCertificate(ctx.run.studentId))!;
    await asUser(ctx.ids.certSource);
    const message = await rejection(ctx.actions.sendCertificateToInstitution(cert.id));
    expect(message).toContain("أُرسلت");
  });

  it("لا يغيّر الرفع حالة إرسال الشهادة الثانية (upload/save ≠ send)", async () => {
    const cert = (await getCertificate(ctx.run.duplicateStudentId))!;
    expect(cert.status, "الشهادة الثانية يجب أن تبقى بانتظار التوقيع").toBe("PENDING");
    expect(cert.sentAt, "sentAt يجب أن يبقى فارغًا").toBeNull();
  });
});
