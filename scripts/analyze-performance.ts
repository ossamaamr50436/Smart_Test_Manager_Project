// ============================================================
// تحليل الأداء (Performance Analysis) — Session 4 B.1
// يحاكي الحجم الحرج: 5000 طالب / 10+ مؤسسات / مؤسسة اختبار واحدة
// ثم يقيس زمن أكبر الاستعلامات الساخنة (قبل/بعد إضافة الفهارس)
// ويفحص خطط التنفيذ بحثاً عن مسح تسلسلي (Seq Scan).
//
// التشغيل:
//   npx tsx scripts/analyze-performance.ts --setup      (تهيئة بيانات المحاكاة)
//   npx tsx scripts/analyze-performance.ts --measure before
//   npx tsx scripts/analyze-performance.ts --measure after
//   npx tsx scripts/analyze-performance.ts --cleanup    (حذف بيانات المحاكاة)
//
// النتائج: benchmarks/perf-before.json و benchmarks/perf-after.json
// ============================================================
import { prisma } from "../lib/prisma";
import { writeFileSync, mkdirSync } from "node:fs";
import { join } from "node:path";
import { performance } from "node:perf_hooks";
import { Role, StudentStatus, ExamSessionStatus, CertificateStatus, AuditAction } from "@prisma/client";

const BENCH_SLUG = "benchmark-perf";
const SIM_STUDENTS = Number(process.env.SIM_STUDENTS ?? 5000);
const SIM_INSTITUTIONS = Number(process.env.SIM_INSTITUTIONS ?? 10);
const SIM_SESSIONS = Number(process.env.SIM_SESSIONS ?? 5000);
const SIM_AUDIT_LOGS = Number(process.env.SIM_AUDIT_LOGS ?? 5000);
const SIM_NOTIFICATIONS = Number(process.env.SIM_NOTIFICATIONS ?? 5000);
const SIM_CERTIFICATES = Number(process.env.SIM_CERTIFICATES ?? 1000);
const BRANCHES = ["5", "10", "15", "20", "25", "30"];
const STATUSES = [
  StudentStatus.PENDING,
  StudentStatus.APPROVED,
  StudentStatus.ASSIGNED,
  StudentStatus.COMPLETED,
  StudentStatus.CERTIFICATE_ISSUED,
];

const OUT_DIR = join(process.cwd(), "benchmarks");

const mode = process.argv[2] ?? "measure";

function median(xs: number[]): number {
  const s = [...xs].sort((a, b) => a - b);
  return s[Math.floor(s.length / 2)] ?? 0;
}

async function addBenchTenantId() {
  const tenant = await prisma.tenant.findUnique({
    where: { slug: BENCH_SLUG },
    select: { id: true },
  });
  if (!tenant) throw new Error("مؤسسة المحاكاة غير موجودة — نفّذ --setup أولاً");
  return tenant.id;
}

function chunks<T>(arr: T[], size: number): T[][] {
  const out: T[][] = [];
  for (let i = 0; i < arr.length; i += size) out.push(arr.slice(i, i + size));
  return out;
}

async function setup() {
  const existing = await prisma.tenant.findUnique({
    where: { slug: BENCH_SLUG },
  });
  if (existing) {
    console.log("بيانات المحاكاة موجودة مسبقاً — أستخدمها (نفّذ --cleanup لإعادة البناء).");
    return;
  }

  console.time("setup");
  const tenant = await prisma.tenant.create({
    data: {
      name: "مؤسسة قياس الأداء (تُحذف بعد القياس)",
      slug: BENCH_SLUG,
      primaryColor: "#015e63",
      secondaryColor: "#d3bb8b",
    },
  });

  const season = await prisma.examSeason.create({
    data: {
      name: "موسم القياس",
      startDate: new Date("2026-01-01"),
      endDate: new Date("2026-12-31"),
      isActive: true,
      tenantId: tenant.id,
    },
  });

  // 6 نماذج (نموذج واحد لكل فرع) — مطلوبة للـ assessments
  await prisma.examModel.createMany({
    data: BRANCHES.map((branch, i) => ({
      modelNumber: i + 1,
      branch,
      seasonId: season.id,
      tenantId: tenant.id,
      detailsJSON: { segments: Array.from({ length: 5 }, (_, s) => ({ part: s + 1 })) },
      segmentsCount: 5,
    })),
    skipDuplicates: true,
  });
  const modelIds = await prisma.examModel.findMany({
    where: { tenantId: tenant.id },
    select: { id: true },
  });

  // جهات تعليمية
  const institutionsData = Array.from({ length: SIM_INSTITUTIONS }, (_, i) => ({
    name: `جهة المحاكاة ${i + 1}`,
    managerName: `مدير ${i + 1}`,
    supervisorName: `مشرف ${i + 1}`,
    managerPhone: `05${String(i + 1).padStart(8, "0")}`,
    supervisorPhone: `05${String(i + 10).padStart(8, "0")}`,
    licenseNumber: `BNC-${String(i + 1).padStart(6, "0")}`,
    district: `حي ${(i % 8) + 1}`,
    tenantId: tenant.id,
  }));
  await prisma.institution.createMany({ data: institutionsData, skipDuplicates: true });
  const institutionIds = await prisma.institution.findMany({
    where: { tenantId: tenant.id },
    select: { id: true },
  });
  console.log(`  institutions: ${institutionIds.length}`);

  // معلمون (مقيّمون)
  const examinersData = Array.from({ length: 60 }, (_, i) => ({
    name: `معلم المحاكاة ${i + 1}`,
    email: `bench-examiner-${i + 1}@test.local`,
    password: "Bench#Pass",
    role: Role.EXAMINER,
    birthDate: new Date("1990-01-01"),
    mustChangePassword: false,
    tenantId: tenant.id,
  }));
  await prisma.user.createMany({ data: examinersData, skipDuplicates: true });
  const examinerIds = await prisma.user.findMany({
    where: { tenantId: tenant.id, role: Role.EXAMINER },
    select: { id: true },
  });
  console.log(`  examiners: ${examinerIds.length}`);

  // لجان
  const committeeData = Array.from({ length: 120 }, (_, i) => ({
    name: `لجنة المحاكاة ${i + 1}`,
    branch: BRANCHES[i % BRANCHES.length]!,
    seasonId: season.id,
    teacher1Id: examinerIds[i % examinerIds.length]!.id,
    teacher2Id: examinerIds[(i + 1) % examinerIds.length]!.id,
    tenantId: tenant.id,
  }));
  await prisma.committee.createMany({ data: committeeData, skipDuplicates: true });
  console.log(`  committees: ${committeeData.length}`);

  // طلاب
  console.log(`  seeding ${SIM_STUDENTS} students...`);
  let studentCreated = 0;
  for (const batch of chunks(
    Array.from({ length: SIM_STUDENTS }, (_, i) => ({
      name: `طالب المحاكاة ${i + 1}`,
      age: 8 + (i % 20),
      branch: BRANCHES[i % BRANCHES.length]!,
      teacherName: `معلم الطالب ${i % 60}`,
      parentPhone: `0540${String(i).padStart(6, "0")}`,
      phone: null,
      status: STATUSES[i % STATUSES.length]!,
      institutionId: institutionIds[i % institutionIds.length]!.id,
      tenantId: tenant.id,
    })),
    1000
  )) {
    const r = await prisma.student.createMany({ data: batch });
    studentCreated += r.count;
  }
  console.log(`  students created: ${studentCreated}`);
  const allStudents = await prisma.student.findMany({
    where: { tenantId: tenant.id },
    select: { id: true },
  });

  // جلسات اختبار
  console.log(`  seeding ${SIM_SESSIONS} sessions...`);
  let sessionCreated = 0;
  for (const batch of chunks(
    Array.from({ length: SIM_SESSIONS }, (_, i) => ({
      studentId: allStudents[i % allStudents.length]!.id,
      teacher1Id: examinerIds[i % examinerIds.length]!.id,
      teacher2Id: examinerIds[(i + 1) % examinerIds.length]!.id,
      examDate: new Date(Date.UTC(2026, 0, 1 + (i % 30), 8 + (i % 10))),
      period: i % 2 === 0 ? "صباحي" : "مسائي",
      status: [ExamSessionStatus.SCHEDULED, ExamSessionStatus.IN_PROGRESS, ExamSessionStatus.COMPLETED][
        i % 3
      ]!,
      seasonId: season.id,
      modelId: null,
      tenantId: tenant.id,
    })),
    1000
  )) {
    const r = await prisma.examSession.createMany({ data: batch });
    sessionCreated += r.count;
  }
  console.log(`  sessions created: ${sessionCreated}`);
  const allSessions = await prisma.examSession.findMany({
    where: { tenantId: tenant.id },
    select: { id: true },
  });

  // تقييمات
  console.log("  seeding assessments...");
  const assessments: { examSessionId: string; evaluatorId: string; modelId: string; tenantId: string }[] = [];
  const usedEvaluatorPairs = new Set<string>();
  for (let i = 0; i < allSessions.length; i++) {
    const s = allSessions[i]!;
    const evaluatorId = examinerIds[i % examinerIds.length]!.id;
    const key = `${s.id}:${evaluatorId}`;
    if (usedEvaluatorPairs.has(key)) continue;
    usedEvaluatorPairs.add(key);
    assessments.push({
      examSessionId: s.id,
      evaluatorId,
      modelId: modelIds[i % modelIds.length]!.id,
      tenantId: tenant.id,
    });
  }
  for (const batch of chunks(assessments, 500)) {
    await prisma.assessment.createMany({ data: batch, skipDuplicates: true });
  }
  console.log(`  assessments: ${assessments.length}`);

  // شهادات
  const certificateData = Array.from({ length: SIM_CERTIFICATES }, (_, i) => ({
    serialNumber: `BENCH-${String(i + 1).padStart(8, "0")}`,
    studentId: allStudents[i % allStudents.length]!.id,
    finalScore: 85 + (i % 15),
    status: i % 2 === 0 ? CertificateStatus.PENDING : CertificateStatus.SIGNED,
    tenantId: tenant.id,
  }));
  await prisma.certificate.createMany({ data: certificateData, skipDuplicates: true });
  console.log(`  certificates: ${SIM_CERTIFICATES}`);

  // إشعارات
  const notificationData = Array.from({ length: SIM_NOTIFICATIONS }, (_, i) => ({
    userId: examinerIds[i % examinerIds.length]!.id,
    message: `إشعار محاكاة ${i + 1}`,
    tenantId: tenant.id,
    isRead: i % 2 === 0,
  }));
  for (const batch of chunks(notificationData, 1000)) {
    await prisma.notification.createMany({ data: batch });
  }
  console.log(`  notifications: ${SIM_NOTIFICATIONS}`);

  // سجل تدقيق
  const auditData = Array.from({ length: SIM_AUDIT_LOGS }, (_, i) => ({
    userId: examinerIds[i % examinerIds.length]!.id,
    action: [AuditAction.CREATE, AuditAction.UPDATE, AuditAction.APPROVE][i % 3]!,
    details: { bench: true, n: i },
    tenantId: tenant.id,
  }));
  for (const batch of chunks(auditData, 1000)) {
    await prisma.auditLog.createMany({ data: batch });
  }
  console.log(`  audit_logs: ${SIM_AUDIT_LOGS}`);

  console.timeEnd("setup");
  console.log("تم تجهيز بيانات المحاكاة — الآن نفّذ --measure before.");
}

async function runQuery<T>(label: string, fn: () => Promise<T>, runs = 3): Promise<number> {
  const times: number[] = [];
  let last: unknown;
  for (let i = 0; i < runs; i++) {
    const t0 = performance.now();
    last = await fn();
    times.push(performance.now() - t0);
  }
  const m = median(times);
  console.log(`  ${label.padEnd(46)} ${m.toFixed(1)} ms`);
  return m;
}

async function planCheck(tenantId: string): Promise<string[]> {
  const sql = `
    EXPLAIN SELECT id FROM students WHERE "tenantId" = '${tenantId}' ORDER BY "createdAt" DESC LIMIT 20;
  `;
  const rows = await prisma.$queryRawUnsafe<{ "QUERY PLAN"?: string }[]>(sql);
  return rows.map((r) => r["QUERY PLAN"] ?? "");
}

async function measure(stage: string) {
  if (stage !== "before" && stage !== "after") {
    console.error("استخدام: --measure before | after");
    process.exit(1);
  }
  mkdirSync(OUT_DIR, { recursive: true });
  const tenantId = await addBenchTenantId();

  const results: Record<string, number> = {};

  // 1) قائمة الطلاب المصفحّة (بحث بالاسم + ترتيب بالإدراج)
  results["students_paged_list"] = await runQuery("قائمة طلاب (صفحة) + عدّ", async () => {
    const where = { tenantId, name: { contains: "المحاكاة", mode: "insensitive" as const } };
    const [rows, total] = await Promise.all([
      prisma.student.findMany({ where, take: 20, skip: 40, orderBy: { createdAt: "desc" }, select: { id: true, name: true } }),
      prisma.student.count({ where }),
    ]);
    return { rows: rows.length, total };
  });

  // 2) عدّ الطلاب حسب الحالة (لوحة)
  results["students_count_by_status"] = await runQuery("عدّ الطلاب حسب الحالة", async () => {
    const rows = await Promise.all(STATUSES.map((s) => prisma.student.count({ where: { tenantId, status: s } })));
    return rows;
  });

  // 3) قائمة الجلسات (حالة + ترتيب بالتاريخ)
  results["sessions_paged_list"] = await runQuery("قائمة جلسات (حالة+تاريخ) صفحة", async () => {
    const where = { tenantId, status: ExamSessionStatus.COMPLETED };
    const [rows, total] = await Promise.all([
      prisma.examSession.findMany({ where, take: 20, skip: 40, orderBy: { examDate: "desc" }, select: { id: true } }),
      prisma.examSession.count({ where }),
    ]);
    return { rows: rows.length, total };
  });

  // 4) قائمة الشهادات بانتظار التوقيع
  results["certificates_pending_list"] = await runQuery("قائمة شهادات بانتظار التوقيع", async () => {
    const where = { tenantId, status: CertificateStatus.PENDING };
    const [rows, total] = await Promise.all([
      prisma.certificate.findMany({ where, take: 20, orderBy: { createdAt: "desc" }, select: { id: true } }),
      prisma.certificate.count({ where }),
    ]);
    return { rows: rows.length, total };
  });

  // 5) بحث الجهات
  results["institutions_search"] = await runQuery("بحث جهات (حي/اسم)", async () => {
    const where = { tenantId, OR: [{ name: { contains: "المحاكاة", mode: "insensitive" as const } }, { district: { contains: "حي", mode: "insensitive" as const } }] };
    const [rows, total] = await Promise.all([
      prisma.institution.findMany({ where, take: 20, orderBy: { createdAt: "desc" }, select: { id: true } }),
      prisma.institution.count({ where }),
    ]);
    return { rows: rows.length, total };
  });

  // 6) سجل التدقيق للمؤسسة
  results["auditlog_tenant_list"] = await runQuery("سجل تدقيق مؤسسة (عكس الزمن)", async () => {
    const rows = await prisma.auditLog.findMany({ where: { tenantId }, take: 30, orderBy: { timestamp: "desc" }, select: { id: true } });
    return rows.length;
  });

  // 7) الموسم النشط
  results["active_season"] = await runQuery("الموسم النشط", async () => {
    return prisma.examSeason.findFirst({ where: { tenantId, isActive: true }, select: { id: true } });
  });

  // 8) إشعارات المستخدم
  const sampleExaminer = await prisma.user.findFirst({
    where: { tenantId, role: Role.EXAMINER },
    select: { id: true },
  });
  if (sampleExaminer) {
    results["user_notifications"] = await runQuery("إشعارات مستخدم (غير المقروء)", async () => {
      const [unread, rows] = await Promise.all([
        prisma.notification.count({ where: { userId: sampleExaminer.id, isRead: false } }),
        prisma.notification.findMany({
          where: { userId: sampleExaminer.id },
          take: 20,
          orderBy: { createdAt: "desc" },
          select: { id: true },
        }),
      ]);
      return { unread, rows: rows.length };
    });
  }

  // 9) فحص خطة التنفيذ (مسح تسلسلي؟)
  console.log("فحص خطة التنفيذ (Seq Scan؟):");
  const plans = await planCheck(tenantId);
  const seqScan = plans.some((l) => /Seq Scan/i.test(l));
  console.log(`  Seq Scan في استعلام الطلاب: ${seqScan ? "نعم (يحتاج فهرس)" : "لا"}`);
  plans.slice(0, 6).forEach((l) => console.log(`    ${l}`));

  const summary = {
    stage,
    capturedAt: new Date().toISOString(),
    scale: { students: SIM_STUDENTS, institutions: SIM_INSTITUTIONS, sessions: SIM_SESSIONS },
    seqScanOnStudentsList: seqScan,
    queries: results,
  };

  const file = join(OUT_DIR, `perf-${stage}.json`);
  writeFileSync(file, JSON.stringify(summary, null, 2));
  console.log(`\nتم حفظ النتائج في ${file}`);
}

async function cleanup() {
  const tenant = await prisma.tenant.findUnique({ where: { slug: BENCH_SLUG }, select: { id: true } });
  if (!tenant) {
    console.log("لا توجد بيانات محاكاة لتنظيفها.");
    return;
  }
  await prisma.$transaction([
    prisma.notification.deleteMany({ where: { tenantId: tenant.id } }),
    prisma.auditLog.deleteMany({ where: { tenantId: tenant.id } }),
    prisma.assessment.deleteMany({ where: { tenantId: tenant.id } }),
    prisma.certificate.deleteMany({ where: { tenantId: tenant.id } }),
    prisma.examSession.deleteMany({ where: { tenantId: tenant.id } }),
    prisma.student.deleteMany({ where: { tenantId: tenant.id } }),
    prisma.committee.deleteMany({ where: { tenantId: tenant.id } }),
    prisma.examModel.deleteMany({ where: { tenantId: tenant.id } }),
    prisma.examSeason.deleteMany({ where: { tenantId: tenant.id } }),
    prisma.institution.deleteMany({ where: { tenantId: tenant.id } }),
    prisma.user.deleteMany({ where: { tenantId: tenant.id } }),
    prisma.tenant.delete({ where: { id: tenant.id } }),
  ]);
  console.log("تم حذف بيانات المحاكاة بالكامل.");
}

async function main() {
  if (mode === "--setup") await setup();
  else if (mode === "--measure") await measure(process.argv[3] ?? "before");
  else if (mode === "--cleanup") await cleanup();
  else {
    console.error("استخدام: --setup | --measure before|after | --cleanup");
    process.exit(1);
  }
}

main().finally(() => prisma.$disconnect());