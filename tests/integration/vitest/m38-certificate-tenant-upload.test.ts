import { describe, it, expect, beforeAll, afterAll, vi } from "vitest";
import { config as loadEnv } from "dotenv";

// لا يُشغَّل بالتوازي مع certificate-workflow.test.ts: كلاهما يتعامل مع
// بيانات التخزين الحقيقية للمستأجر 50436 (يبدّل هذا الملف رمز المستأجر
// للتحقق من Wiring) ومع فضاء أرقام الشهادات نفسه.
//   npx vitest run <هذا الملف> <certificate-workflow> --no-file-parallelism

loadEnv({ path: ".env" });

const session = vi.hoisted(() => ({ userId: null as string | null }));

const uploads = vi.hoisted(() => [] as Array<{
  fileName: string;
  mimeType: string | undefined;
  token: string | null | undefined;
  bytes: number;
}>);

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

vi.mock("next-auth", () => ({
  AuthError: class AuthError extends Error {},
}));

// نُسجّل_boundary الرفع فقط: الرفع الحقيقي مغطّى في certificate-workflow.test.ts
vi.mock("@/lib/file-storage", () => ({
  uploadFile: async (
    buffer: Buffer,
    fileName: string,
    mimeType?: string,
    options?: { token?: string | null }
  ) => {
    uploads.push({
      fileName,
      mimeType,
      token: options?.token,
      bytes: buffer.byteLength,
    });
    return { fileId: `test-${uploads.length}`, url: `https://example.test/${uploads.length}.pdf` };
  },
  deleteFile: async () => undefined,
  isTrustedStoredUrl: () => true,
  isValidFileKey: () => true,
  downloadFileByUrl: async () => Buffer.from("%PDF-"),
  sanitizeFileName: (name: string) => name,
}));

let prisma: typeof import("@/lib/prisma")["prisma"];
let actions: typeof import("@/lib/actions/certificate-actions");

const TENANT = "50436";
// رمز مستأجر بصيغة UploadThing المعتمدة (base64 لـ JSON) حتى لا يوهم
// الاختبار بأن المفتاح المجرّد sk_… رمز صالح.
const TOKEN = Buffer.from(
  JSON.stringify({ apiKey: "sk_test_marker_50436", appId: "udw6m0lq15", regions: ["sea1"] })
).toString("base64");
const BARE_KEY = "sk_test_marker_50436";

let tenantId: string;
let certSourceId: string;
let originalToken: string | null = null;
const createdStudentIds: string[] = [];
const createdSessionIds: string[] = [];
const createdModelIds: string[] = [];

// فرع خاص بهذا الملف: QuestionBankModel له قيد @@unique([tenantId, modelNumber,
// branch])، وcreateQuestionBankModel في certificate-workflow.test.ts يختار
// رقمه بـ max+1 داخل نفس الفرع —的合作 على فرع واحد يسبب تصادماً. فرع مستقل
// يجعل أرقام هذا الملف خارج مدى ذلك الاختيار نهائياً.
const TEST_BRANCH = "م38-رفع-مستأجر";
let modelCounter = 0;

// حدّ المعدل مخزّن في قاعدة البيانات بنافذة 15 دقيقة، فمفتاحه userId.
// لذلك يب��ى هذا الملف مستخدماً خاصاً به — غير المستخدم المشترك في
// certificate-workflow.test.ts — حتى لا يستهلك أحدهما حصة الآخر.
const RUN_EMAIL = `m38-tenant-upload-${Date.now()}@e2e.exp.local`;

async function resetRateLimits(userId: string): Promise<void> {
  await prisma.rateLimit.deleteMany({
    where: { key: { contains: userId } },
  });
}

async function asCertSource(): Promise<void> {
  const user = await prisma.user.findUniqueOrThrow({
    where: { email: RUN_EMAIL },
    select: { id: true, role: true },
  });
  expect(user.role, "المستخدم يجب أن يكون مصدر شهادات").toBe("CERTIFICATE_SOURCE");
  session.userId = user.id;
}

// الإصدار يفشل برمي استثناء برسالة عربية (لا حقل error في نوع الإرجاع)
async function generate(studentId: string): Promise<{ ok: boolean; message: string; serial: string }> {
  try {
    const result = await actions.generateCertificate(studentId);
    return {
      ok: result.success,
      message: result.success ? "" : "أعاد الإجراء فشلاً بلا استثناء",
      serial: result.serialNumber,
    };
  } catch (error) {
    return {
      ok: false,
      message: error instanceof Error ? error.message : String(error),
      serial: "",
    };
  }
}

function segments(count: number) {
  return Array.from({ length: count }, (_, index) => ({
    segmentNumber: index + 1,
    type: "word" as const,
    title: `جزء ${index + 1}`,
    words: [{ word: "كلمة", tajweedErrors: 0, letterErrors: 0, wordErrors: 0 }],
  }));
}

// لكل طالب نموذجه: ExamSession له قيد @@unique([seasonId, modelId])
async function ensureModel(): Promise<string> {
  const model = await prisma.questionBankModel.create({
    data: {
      tenantId,
      branch: TEST_BRANCH,
      modelNumber: modelCounter++ + 1,
      segmentsCount: 5,
      detailsJSON: { segments: segments(5) },
    },
    select: { id: true },
  });
  createdModelIds.push(model.id);
  return model.id;
}

async function makeReadyStudent(label: string): Promise<string> {
  const season = await prisma.examSeason.findFirst({ where: { tenantId }, select: { id: true } });
  if (!season) throw new Error("لا يوجد موسم في مستأجر الاختبار");

  const committee = await prisma.committee.findFirst({
    where: { tenantId, seasonId: season.id },
    select: { id: true, branch: true, teacher1Id: true, teacher2Id: true },
  });
  if (!committee) throw new Error("لا توجد لجنة في موسم مستأجر الاختبار");

  const institution = await prisma.institution.findFirst({ where: { tenantId }, select: { id: true } });
  if (!institution) throw new Error("لا توجد جهة تعليمية في مستأجر الاختبار");

  const currentModelId = await ensureModel();

  const studentId = await prisma.$transaction(async (tx) => {
    const student = await tx.student.create({
      data: {
        name: `${label} ${Date.now()}`,
        age: 13,
        branch: TEST_BRANCH,
        nationality: "سعودي",
        teacherName: "معلم الاختبار",
        parentPhone: "0551234567",
        status: "READY_FOR_CERTIFICATE",
        approvedAt: new Date(),
        assignedAt: new Date(),
        finalizedAt: new Date(),
        committeeId: committee.id,
        institutionId: institution.id,
        tenantId,
      },
      select: { id: true },
    });
    const session_ = await tx.examSession.create({
      data: {
        studentId: student.id,
        teacher1Id: committee.teacher1Id,
        teacher2Id: committee.teacher2Id,
        examDate: new Date(),
        period: "مسائية",
        status: "COMPLETED",
        seasonId: season.id,
        modelId: currentModelId,
        tenantId,
      },
      select: { id: true },
    });

    await tx.assessment.create({
      data: {
        examSessionId: session_.id,
        evaluatorId: committee.teacher1Id,
        modelId: currentModelId,
        finalScore: 88,
        totalDeduction: 12,
        status: "APPROVED",
        tenantId,
      },
    });

    createdStudentIds.push(student.id);
    createdSessionIds.push(session_.id);
    return student.id;
  });

  return studentId;
}

beforeAll(async () => {
  ({ prisma } = await import("@/lib/prisma"));
  actions = await import("@/lib/actions/certificate-actions");

  const tenant = await prisma.tenant.findUniqueOrThrow({
    where: { slug: TENANT },
    select: { id: true, uploadthingToken: true },
  });
  tenantId = tenant.id;
  originalToken = tenant.uploadthingToken;

  // مستخدم مصدر شهادات خاص بهذا التشغيل: يعزل حدّ المعدل والتدقيق
  const user = await prisma.user.create({
    data: {
      name: "مصدر شهادات M38",
      email: RUN_EMAIL,
      password: "e2e-only-not-a-real-secret",
      role: "CERTIFICATE_SOURCE",
      birthDate: new Date("1990-01-01"),
      tenantId,
    },
    select: { id: true, role: true },
  });
  certSourceId = user.id;
  expect(user.role, "الدور المطلوب لمصدر الشهادات").toBe("CERTIFICATE_SOURCE");

  await resetRateLimits(certSourceId);
  await asCertSource();
}, 120_000);

afterAll(async () => {
  if (!prisma) return;
  await prisma.tenant.update({
    where: { id: tenantId },
    data: { uploadthingToken: originalToken },
  });

  if (createdStudentIds.length > 0) {
    const students = await prisma.student.findMany({
      where: { id: { in: createdStudentIds } },
      select: { id: true, name: true },
    });
    const names = students.map((s) => s.name);
    const certificates = await prisma.certificate.findMany({
      where: { studentId: { in: createdStudentIds } },
      select: { id: true },
    });

    await prisma.certificate.deleteMany({ where: { studentId: { in: createdStudentIds } } });

    // الإشعارات تُقتصّ باسم طالب الاختبار فقط، لا كل إشعارات المستأجر
    if (names.length > 0) {
      await prisma.notification.deleteMany({
        where: {
          tenantId,
          OR: names.map((name) => ({ message: { contains: name } })),
        },
      });
    }

    // سجلات التدقيق تُقتصّ ببيانات شهادات/طلاب هذا الملف فقط
    const logs = await prisma.auditLog.findMany({
      where: { tenantId, userId: certSourceId },
      select: { id: true, details: true },
    });
    const ids = [...createdStudentIds, ...certificates.map((c) => c.id)];
    const mine = logs.filter((log) => {
      const raw = log.details;
      const serialized = typeof raw === "string" ? raw : JSON.stringify(raw);
      return ids.some((id) => serialized.includes(id));
    });
    if (mine.length > 0) {
      await prisma.auditLog.deleteMany({ where: { id: { in: mine.map((l) => l.id) } } });
    }

    await prisma.assessment.deleteMany({
      where: { examSessionId: { in: createdSessionIds } },
    });
    await prisma.examSession.deleteMany({ where: { id: { in: createdSessionIds } } });
    await prisma.student.deleteMany({ where: { id: { in: createdStudentIds } } });
  }
  if (createdModelIds.length > 0) {
    await prisma.questionBankModel.deleteMany({ where: { id: { in: createdModelIds } } });
  }

  // المستخدم المؤقت + حصة حدّ المعدل الخاصة به
  if (certSourceId) {
    await resetRateLimits(certSourceId);
    await prisma.user.deleteMany({ where: { id: certSourceId } });
  }

  await prisma.$disconnect();
});

describe("M38 — إصدار الشهادة مع رفع مخصّص للمستأجر", () => {
  it("يولّد الشهادة بحالة PENDING ويغيّر حالة الطالب", async () => {
    await asCertSource();
    const studentId = await makeReadyStudent("طالب اختبار المستأجر");
    uploads.length = 0;

    const result = await generate(studentId);
    expect(result.ok, result.message).toBe(true);
    expect(result.serial).toMatch(/^CERT-\d{4}-\d{4}$/);

    const certificate = await prisma.certificate.findFirstOrThrow({
      where: { studentId },
      select: { serialNumber: true, status: true, fileUrl: true, finalScore: true, tenantId: true },
    });
    expect(certificate.status, "حالة الشهادة بعد الإصدار").toBe("PENDING");
    expect(certificate.fileUrl, "رابط الملف مطلوب").toBeTruthy();
    expect(certificate.finalScore, "الدرجة النهائية").toBeGreaterThan(0);
    expect(certificate.tenantId).toBe(tenantId);

    const student = await prisma.student.findUniqueOrThrow({
      where: { id: studentId },
      select: { status: true },
    });
    expect(student.status, "حالة الطالب بعد الإصدار").toBe("CERTIFICATE_ISSUED");
  }, 90_000);

  it("يرفع PDF حقيقي غير فارغ باسم يحمل الرقم التسلسلي", async () => {
    const last = uploads[uploads.length - 1];
    expect(last, "لم يُسجَّل أي رفع").toBeDefined();
    expect(last?.mimeType).toBe("application/pdf");
    expect(last?.bytes, "حجم PDF").toBeGreaterThan(1000);
    expect(last?.fileName).toMatch(/^CERT-\d{4}-\d{4}-.*\.pdf$/);
  });

  it("يستخدم رمز UploadThing الخاص بالمستأجر لا الرمز العام", async () => {
    await asCertSource();
    await prisma.tenant.update({
      where: { id: tenantId },
      data: { uploadthingToken: TOKEN },
    });
    const studentId = await makeReadyStudent("طالب رمز المستأجر");
    uploads.length = 0;

    const result = await generate(studentId);
    expect(result.ok, result.message).toBe(true);
    expect(uploads.length, "عدد محاولات الرفع").toBe(1);
    expect(uploads[0]?.token, "يجب استخدام رمز المستأجر").toBe(TOKEN);
  }, 90_000);

  it("يعود للرمز العام عند غياب رمز المستأجر", async () => {
    await asCertSource();
    await prisma.tenant.update({
      where: { id: tenantId },
      data: { uploadthingToken: null },
    });
    const studentId = await makeReadyStudent("طالب بلا رمز");
    uploads.length = 0;

    const result = await generate(studentId);
    expect(result.ok, result.message).toBe(true);
    expect(uploads[0]?.token ?? null, "بدون رمز مستأجر = رفع عام").toBeNull();
  }, 90_000);

  it("يمنع إصدار شهادة ثانية لنفس الطالب", async () => {
    await asCertSource();
    const studentId = await makeReadyStudent("طالب منع التكرار");
    uploads.length = 0;

    const first = await generate(studentId);
    expect(first.ok, first.message).toBe(true);

    let message = "";
    try {
      const second = await actions.generateCertificate(studentId);
      message = second.success ? "" : "رفض بلا استثناء";
    } catch (error) {
      message = error instanceof Error ? error.message : String(error);
    }
    expect(message, "يجب رفض الإصدار الثاني برسالة واضحة").toMatch(/شهادة|شُدّلت|عُدّلت/);
    expect(uploads.length, "لم يُرفع ملف ثانٍ").toBe(1);

    const rows = await prisma.certificate.count({ where: { studentId } });
    expect(rows, "شهادة واحدة فقط للطالب").toBe(1);
  }, 120_000);

  it("يمنح كل شهادة رقماً تسلسلياً فريداً", async () => {
    await asCertSource();
    await prisma.tenant.update({ where: { id: tenantId }, data: { uploadthingToken: TOKEN } });

    const serials: string[] = [];
    for (const label of ["طالب تسلسل أ", "طالب تسلسل ب"]) {
      const studentId = await makeReadyStudent(label);
      const result = await generate(studentId);
      expect(result.ok, result.message).toBe(true);
      serials.push(result.serial);
    }

    expect(new Set(serials).size, `أرقام مكررة: ${serials.join(", ")}`).toBe(serials.length);
    for (const serial of serials) {
      const rows = await prisma.certificate.count({ where: { serialNumber: serial } });
      expect(rows, `الرقم ${serial} يجب أن يكون فريداً`).toBe(1);
    }
  }, 180_000);
});

describe("اختيار عميل الرفع حسب المستأجر", () => {
  it("يربط الرمز الفارغ أو غير الموجود بالعميل العام", async () => {
    const storage = await vi.importActual<typeof import("@/lib/file-storage")>(
      "@/lib/file-storage"
    );
    const shared = storage.resolveUploader(undefined);
    expect(storage.resolveUploader(null)).toBe(shared);
    expect(storage.resolveUploader("   ")).toBe(shared);
  });

  it("يبني عميلاً منفصلاً عند وجود رمز مستأجر", async () => {
    const storage = await vi.importActual<typeof import("@/lib/file-storage")>(
      "@/lib/file-storage"
    );
    const scoped = storage.resolveUploader(TOKEN);
    expect(scoped).not.toBe(storage.resolveUploader(undefined));
    expect(storage.resolveUploader(TOKEN)).not.toBe(scoped);
  });

  it("يرفض المفتاح المجرّد，因为它 ليس رمز UploadThing", async () => {
    const storage = await vi.importActual<typeof import("@/lib/file-storage")>(
      "@/lib/file-storage"
    );
    expect(storage.isValidUploadToken(TOKEN)).toBe(true);
    expect(storage.isValidUploadToken(BARE_KEY)).toBe(false);
    expect(storage.isValidUploadToken("")).toBe(false);
    expect(storage.isValidUploadToken("لا-يترجم-إلى-json")).toBe(false);
  });

  it("يرفع رسالة توضيحية عند رمز مستأجر غير صالح قبل أي اتصال", async () => {
    const storage = await vi.importActual<typeof import("@/lib/file-storage")>(
      "@/lib/file-storage"
    );
    await expect(
      storage.uploadFile(Buffer.from("%PDF-1.4 test"), "x.pdf", "application/pdf", {
        token: BARE_KEY,
      })
    ).rejects.toThrow(/base64/);
  }, 30_000);
});
