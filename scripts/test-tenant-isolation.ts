// ============================================================
// اختبار عزل المستأجرين (Tenant Isolation Test) — Session 4 A.6
// يتحقق على مستوى قاعدة البيانات من:
// 1) صحة بيانات المؤسسة الرئيسية (madina-quran) قبل وبعد الاختبار.
// 2) إنشاء مؤسسة اختبار + مشرف وربطهما بأمان.
// 3) عدم تسرّب بيانات مؤسسة إلى أخرى (فلاتر tenantId).
// 4) سلامة القيود: slug فريد، المفتاح الأجنبي للـ tenant إلزامي.
// 5) سجل التدقيق على مستوى المنصة (tenantId: null) يعمل بالتوازي.
// 6) تنظيف كامل لبيانات الاختبار (بدون ماس ).madina-quran
// التشغيل: npx tsx scripts/test-tenant-isolation.ts
// ============================================================
import { prisma } from "../lib/prisma";
import bcrypt from "bcryptjs";
import { Role, AuditAction } from "@prisma/client";

const TEST_SUFFIX = `t${Date.now()}`;
const TEST_TENANT_SLUG = `isolation-test-${TEST_SUFFIX}`;
const TEST_ADMIN_EMAIL = `isolation-${TEST_SUFFIX}@test.local`;

let passed = 0;
let failed = 0;
let createdTenantId: string | null = null;
let createdAdminId: string | null = null;
let createdAuditIds: string[] = [];

function check(name: string, condition: boolean) {
  if (condition) {
    passed++;
    console.log(`  PASS  ${name}`);
  } else {
    failed++;
    console.error(`  FAIL  ${name}`);
  }
}

async function main() {
  console.log("=== اختبار عزل المستأجرين ===");

  // 1) المؤسسة الرئيسية سليمة
  const madina = await prisma.tenant.findUnique({
    where: { slug: "madina-quran" },
    select: { id: true, name: true },
  });
  check("المؤسسة الرئيسية (madina-quran) موجودة", Boolean(madina));
  if (!madina) throw new Error("لا يمكن متابعة الاختبار: madina-quran غير موجودة");

  const madinaModelsBefore = await prisma.examModel.count({
    where: { tenantId: madina.id },
  });
  check("madina-quran تحتوي نماذج اختبار (بياناتها سليمة)", madinaModelsBefore > 0);

  const madinaModels = await prisma.examModel.findMany({
    where: { tenantId: madina.id },
    select: { tenantId: true },
  });
  check(
    "كل نماذج madina-quran تابعة لمؤسستها فقط",
    madinaModels.every((m) => m.tenantId === madina.id) &&
      madinaModels.length === madinaModelsBefore
  );

  // 2) إنشاء مؤسسة اختبار + مشرف
  const testTenant = await prisma.tenant.create({
    data: {
      name: "مؤسسة اختبار العزل",
      slug: TEST_TENANT_SLUG,
      primaryColor: "#015e63",
      secondaryColor: "#d3bb8b",
    },
  });
  createdTenantId = testTenant.id;

  const hashedPassword = await bcrypt.hash("TestPass#2026!", 12);
  const testAdmin = await prisma.user.create({
    data: {
      name: "مشرف اختبار العزل",
      email: TEST_ADMIN_EMAIL,
      password: hashedPassword,
      role: Role.ADMIN,
      tenantId: testTenant.id,
      birthDate: new Date("1990-01-01"),
      mustChangePassword: true,
    },
  });
  createdAdminId = testAdmin.id;

  const adminRow = await prisma.user.findUnique({
    where: { id: testAdmin.id },
    select: { tenantId: true, role: true, mustChangePassword: true, password: true },
  });
  check("المشرف مرتبط بالمؤسسة الصحيحة", adminRow?.tenantId === testTenant.id);
  check("دور المشرف ADMIN", adminRow?.role === Role.ADMIN);
  check("يُطلب تغيير كلمة المرور عند أول دخول", adminRow?.mustChangePassword === true);
  const passwordHashOk =
    adminRow?.password !== undefined &&
    (await bcrypt.compare("TestPass#2026!", adminRow.password));
  check("كلمة المرور مشفّرة رقمياً (bcrypt)", passwordHashOk === true);

  // 3) العزل: بيانات الاختبار تظهر فقط ضمن نطاق مؤسستها
  const testTenantModels = await prisma.examModel.count({
    where: { tenantId: testTenant.id },
  });
  check("مؤسسة الاختبار تبدأ بدون نماذج", testTenantModels === 0);

  const scopedToTest = await prisma.examModel.findFirst({
    where: { tenantId: testTenant.id },
    select: { id: true },
  });
  check("استعلام بمؤشر مؤسسة الاختبار لا يُرجع نماذج madina", scopedToTest === null);

  const oneMadinaModel = await prisma.examModel.findFirst({
    where: { tenantId: madina.id },
    select: { tenantId: true },
  });
  check(
    "استعلام بمؤشر madina يُرجع نموذجاً يخصها",
    oneMadinaModel?.tenantId === madina.id
  );

  const madinaUsersNormalized = await prisma.user.findMany({
    where: { tenantId: madina.id },
    select: { email: true, tenantId: true },
  });
  const leakedIntoMadina = madinaUsersNormalized.some(
    (u) => u.tenantId !== madina.id || u.email === TEST_ADMIN_EMAIL
  );
  check("لا يتسرب أي مشرف اختبار إلى madina-quran", !leakedIntoMadina);

  const madinaModelsAfterCreate = await prisma.examModel.count({
    where: { tenantId: madina.id },
  });
  check(
    "أعداد madina-quran لم تتأثر بإنشاء مؤسسة جديدة",
    madinaModelsAfterCreate === madinaModelsBefore
  );

  // 4) القيود (Constraints)
  let duplicateSlugRejected = false;
  try {
    await prisma.tenant.create({
      data: {
        name: "مؤسسة مكررة",
        slug: TEST_TENANT_SLUG,
        primaryColor: "#000000",
        secondaryColor: "#ffffff",
      },
    });
  } catch {
    duplicateSlugRejected = true;
  }
  check("رفض المعرّف (slug) المكرر", duplicateSlugRejected);

  let brokenForeignKeyRejected = false;
  try {
    await prisma.user.create({
      data: {
        name: "مستخدم وهمي",
        email: `ghost-${TEST_SUFFIX}@test.local`,
        password: "xxxxx",
        role: Role.EXAMINER,
        tenantId: "crmt00000000000000000000",
        birthDate: new Date("1990-01-01"),
      },
    });
  } catch {
    brokenForeignKeyRejected = true;
  }
  check("رفض ربط سجل بمؤسسة غير موجودة (FK)", brokenForeignKeyRejected);

  // 5) سجل التدقيق على مستوى المنصة (tenantId: null) ومستوى المؤسسة
  const platformLog = await prisma.auditLog.create({
    data: {
      userId: testAdmin.id,
      action: AuditAction.CREATE,
      tenantId: null,
      details: { entity: "Tenant", test: true, scope: "platform" },
    },
  });
  createdAuditIds.push(platformLog.id);

  const tenantLog = await prisma.auditLog.create({
    data: {
      userId: testAdmin.id,
      action: AuditAction.CREATE,
      tenantId: testTenant.id,
      details: { entity: "TenantUser", test: true, scope: "tenant" },
    },
  });
  createdAuditIds.push(tenantLog.id);

  const platformLogs = await prisma.auditLog.count({ where: { tenantId: null } });
  check("سجلات منصة (tenantId null) تُكتب وتُقرأ", platformLogs >= 1);

  const tenantLogsOwned = await prisma.auditLog.count({
    where: { tenantId: testTenant.id },
  });
  check("سجل تدقيق المؤسسة معزول بمؤشرها", tenantLogsOwned === 1);

  // 6) النظافة: حذف سجلات الاختبار
  await prisma.notification.deleteMany({ where: { userId: testAdmin.id } });
  await prisma.auditLog.deleteMany({
    where: { OR: [{ tenantId: testTenant.id }, { id: { in: createdAuditIds } }] },
  });
  await prisma.user.delete({ where: { id: testAdmin.id } });
  createdAdminId = null;
  await prisma.tenant.delete({ where: { id: testTenant.id } });
  createdTenantId = null;

  const madinaModelsFinal = await prisma.examModel.count({
    where: { tenantId: madina.id },
  });
  check(
    "madina-quran بعد التنظيف كما كانت تماماً",
    madinaModelsFinal === madinaModelsBefore
  );

  const leftoverTenants = await prisma.tenant.count({
    where: { slug: { startsWith: "isolation-test-" } },
  });
  const allModels = await prisma.examModel.count();
  check(
    "لا بقايا لمؤسسات الاختبار وعاد إجمالي النماذج كما كان",
    leftoverTenants === 0 && allModels === madinaModelsBefore
  );

  // خلاصة
  console.log("");
  console.log(`النتيجة: ${passed} نجحت، ${failed} فشلت`);
  if (failed > 0) process.exit(1);
}

main()
  .catch((error) => {
    console.error("فشل الاختبار:", error);
    process.exitCode = 1;
  })
  .finally(async () => {
    const tenant = createdTenantId
      ? await prisma.tenant.findUnique({ where: { id: createdTenantId } })
      : null;
    const admin = createdAdminId
      ? await prisma.user.findUnique({ where: { id: createdAdminId } })
      : null;
    if (admin) await prisma.notification.deleteMany({ where: { userId: admin.id } });
    if (admin) await prisma.auditLog.deleteMany({ where: { userId: admin.id } });
    if (admin) await prisma.user.delete({ where: { id: admin.id } });
    if (tenant) await prisma.tenant.delete({ where: { id: tenant.id } });
    if (createdAuditIds.length > 0) {
      await prisma.auditLog.deleteMany({ where: { id: { in: createdAuditIds } } });
    }
    await prisma.$disconnect();
  });