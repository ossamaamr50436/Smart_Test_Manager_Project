import { describe, it, expect, beforeAll, afterAll, vi } from "vitest";
import { config as loadEnv } from "dotenv";
import fs from "node:fs";
import path from "node:path";

loadEnv({ path: ".env" });

// ============================================================
// M34 — فحص أمن الأدوار
// - prisma حقيقي + @/auth مُموَّه => نختبر بعدد الأخطاء الحقيقي
// - كل المسارات إما قراءة فقط أو تُرفض قبل أي كتابة (لا مساس بالـbaseline)
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

vi.mock("next-auth", () => ({
  AuthError: class AuthError extends Error {},
}));

let prisma: typeof import("@/lib/prisma")["prisma"];
let adminActions: typeof import("@/lib/actions/admin-actions");
let assessmentActions: typeof import("@/lib/actions/assessment-actions");
let certificateActions: typeof import("@/lib/actions/certificate-actions");
let headActions: typeof import("@/lib/actions/head-actions");
let modelActions: typeof import("@/lib/actions/model-actions");
let security: typeof import("@/lib/security");
let tenancy: typeof import("@/lib/tenancy");

const OWN = "50436";
const OTHER = "12345";

/** رفض: يرمي من طبقة الصلاحيات أو يعيد { success:false } */
async function expectDenied(promise: Promise<unknown>): Promise<void> {
  try {
    const out = (await promise) as { success?: boolean } | undefined;
    if (out && out.success === false) return;
  } catch {
    return;
  }
  throw new Error("كان متوقعاً رفض العملية لكنها نجحت (تسريب صلاحيات!)");
}

/** نفس اختيار lib/actions/auth-actions.getCurrentUser => نوع SessionUser مطابق */
async function sessionUserByEmail(email: string) {
  return prisma.user.findUniqueOrThrow({
    where: { email },
    select: {
      id: true,
      name: true,
      email: true,
      role: true,
      birthDate: true,
      institutionId: true,
      tenantId: true,
      createdAt: true,
      mustChangePassword: true,
    },
  });
}

async function asUser(email: string) {
  const user = await sessionUserByEmail(email);
  session.userId = user.id;
  return user;
}

const E = {
  admin: "fx50436-admin@e2e.exp.local",
  head: "fx50436-head@e2e.exp.local",
  certSource: "fx50436-certsource@e2e.exp.local",
  specialist: "fx50436-specialist@e2e.exp.local",
  examiner1: "fx50436-examiner1@e2e.exp.local",
  examiner2: "fx50436-examiner2@e2e.exp.local",
  institution: "fx50436-institution@e2e.exp.local",
  otherExaminer: "ossamalcap@gmail.com",
  superAdmin: "ossamaamr50436@gmail.com",
};

/** مدخل تقييم صالح بالكامل — Goal: يتجاوز التحقق من الصحة ويرفض من طبقة الصلاحية */
const VALID_ASSESSMENT = {
  examSessionId: "",
  wordErrors: 1,
  letterErrors: 1,
  diacriticErrors: 1,
  seriousErrors: 0,
  subtleErrors: 1,
  promptingCount: 0,
  doubtCount: 0,
  tajweedErrors: 0,
  recitationScore: 18,
  tajweedScore: 9,
};

let ownSessionId: string;
let ownCommitteeId: string;
let otherTenantCommitteeId: string;
let otherTenantStudentId: string;
let ownTenantId: string;

beforeAll(async () => {
  ({ prisma } = await import("@/lib/prisma"));
  adminActions = await import("@/lib/actions/admin-actions");
  assessmentActions = await import("@/lib/actions/assessment-actions");
  certificateActions = await import("@/lib/actions/certificate-actions");
  headActions = await import("@/lib/actions/head-actions");
  modelActions = await import("@/lib/actions/model-actions");
  security = await import("@/lib/security");
  tenancy = await import("@/lib/tenancy");

  const own = await prisma.tenant.findUniqueOrThrow({
    where: { slug: OWN },
    select: { id: true },
  });
  const other = await prisma.tenant.findUniqueOrThrow({
    where: { slug: OTHER },
    select: { id: true },
  });
  ownTenantId = own.id;

  ownSessionId = (
    await prisma.examSession.findFirstOrThrow({
      where: { tenantId: own.id },
      select: { id: true },
    })
  ).id;
  ownCommitteeId = (
    await prisma.committee.findFirstOrThrow({
      where: { tenantId: own.id },
      select: { id: true },
    })
  ).id;
  otherTenantCommitteeId = (
    await prisma.committee.findFirstOrThrow({
      where: { tenantId: other.id },
      select: { id: true },
    })
  ).id;
  otherTenantStudentId = (
    await prisma.student.findFirstOrThrow({
      where: { tenantId: other.id },
      select: { id: true },
    })
  ).id;
}, 120_000);

afterAll(async () => {
  await prisma?.$disconnect();
});

// ------------------------------------------------------------
// النقطة 1 — Page Guard (فحص الكود كافٍ: الصفحات RSC)
// ------------------------------------------------------------
describe("M34/1 — Page Guard لكل دور", () => {
  const pageExpectations: Array<[string, RegExp]> = [
    ["app/(dashboard)/admin/page.tsx", /requireRole\(user, \[Role\.ADMIN\]\)/],
    ["app/(dashboard)/admin/users/page.tsx", /requireRole\(user, \[Role\.ADMIN\]\)/],
    ["app/(dashboard)/admin/design-settings/page.tsx", /requireRole\(user, \[Role\.ADMIN\]\)/],
    ["app/(dashboard)/examiner/page.tsx", /user\.role !== Role\.EXAMINER/],
    ["app/(dashboard)/examiner/pending/page.tsx", /user\.role !== Role\.EXAMINER/],
    ["app/(dashboard)/examiner/assess/[studentId]/page.tsx", /user\.role !== Role\.EXAMINER/],
    ["app/(dashboard)/examiner/tested/[studentId]/page.tsx", /user\.role !== Role\.EXAMINER/],
    ["app/(dashboard)/test-specialist/final-review/page.tsx", /user\.role !== Role\.TEST_SPECIALIST/],
    ["app/(dashboard)/head-of-affairs/page.tsx", /user\.role !== Role\.HEAD_OF_AFFAIRS/],
    ["app/(dashboard)/head-of-affairs/rejected/page.tsx", /user\.role !== Role\.HEAD_OF_AFFAIRS/],
    ["app/(dashboard)/certificate-source/page.tsx", /user\.role !== Role\.CERTIFICATE_SOURCE/],
    ["app/(dashboard)/super-admin/tenants/page.tsx", /guardSuperAdminPage\(user\)/],
    ["app/(dashboard)/super-admin/tenants/[id]/page.tsx", /guardSuperAdminPage\(user\)/],
  ];

  for (const [file, pattern] of pageExpectations) {
    it(`الحراسة موجودة في ${file}`, () => {
      const src = fs.readFileSync(path.resolve(process.cwd(), file), "utf8");
      expect(src, `لا توجد حراسة في ${file}`).toMatch(pattern);
      // نقطة الدخول للحراسة: إما جلسة مطلوبة أو رمي فوري عبر requireRole
      expect(src).toMatch(/getCurrentUser\(\)|requireUser\(\)/);
      // ومسار الرفض موجود: إعادة توجيه أو رمي من requireRole
      expect(src).toMatch(/redirect\(|requireRole\(|guardSuperAdminPage\(/);
    });
  }

  it("requireRole ترمي فعلياً عند دور غير مسموح", async () => {
    const head = await sessionUserByEmail(E.head);
    expect(() => security.requireRole(head, ["EXAMINER"])).toThrow(/غير مصرح/);
    const examiner = await sessionUserByEmail(E.examiner1);
    expect(() => security.requireRole(examiner, ["EXAMINER"])).not.toThrow();
    expect(() => security.requireRole(head, ["HEAD_OF_AFFAIRS"])).not.toThrow();
  });
});

// ------------------------------------------------------------
// النقطة 2 + 4 — Action Guard: دور A يطلب إجراء دور B → DENIED
// ------------------------------------------------------------
describe("M34/2 — Action Guard (دور A يطلب بيانات دور B)", () => {
  it("EXAMINER لا يستطيع اعتماد الأخصائي ولا رئيس الشؤون ولا إصدار شهادة", async () => {
    await asUser(E.examiner1);
    await expectDenied(adminActions.specialistFinalApprove(otherTenantStudentId));
    await expectDenied(adminActions.headOfAffairsFinalApprove(otherTenantStudentId));
    await expectDenied(certificateActions.generateCertificate(otherTenantStudentId));
  });

  it("TEST_SPECIALIST لا يستطيع اعتماد رئيس الشؤون", async () => {
    await asUser(E.specialist);
    await expectDenied(adminActions.headOfAffairsFinalApprove(otherTenantStudentId));
  });

  it("HEAD_OF_AFFAIRS لا يستطيع اعتماد الأخصائي ولا إصدار شهادة", async () => {
    await asUser(E.head);
    await expectDenied(adminActions.specialistFinalApprove(otherTenantStudentId));
    await expectDenied(certificateActions.generateCertificate(otherTenantStudentId));
  });

  it("CERTIFICATE_SOURCE لا يستطيع اعتماد الأخصائي ولا رئيس الشؤون", async () => {
    await asUser(E.certSource);
    await expectDenied(adminActions.specialistFinalApprove(otherTenantStudentId));
    await expectDenied(adminActions.headOfAffairsFinalApprove(otherTenantStudentId));
  });

  it("INSTITUTION لا يستطيع اعتماد الأخصائي ولا رئيس الشؤون", async () => {
    await asUser(E.institution);
    await expectDenied(adminActions.specialistFinalApprove(otherTenantStudentId));
    await expectDenied(adminActions.headOfAffairsFinalApprove(otherTenantStudentId));
  });

  it("ADMIN لا يستطيع إصدار شهادة (الدور محجوز لمصدر الشهادات)", async () => {
    await asUser(E.admin);
    await expectDenied(certificateActions.generateCertificate(otherTenantStudentId));
  });

  it("كل الأدوار بلا جلسة تُرفض", async () => {
    session.userId = null;
    await expectDenied(adminActions.specialistFinalApprove(otherTenantStudentId));
    await expectDenied(adminActions.headOfAffairsFinalApprove(otherTenantStudentId));
    await expectDenied(headActions.getStudentsForHeadReview());
    await expectDenied(certificateActions.generateCertificate(otherTenantStudentId));
    await expectDenied(assessmentActions.approveAssessment(ownSessionId));
  });
});

// ------------------------------------------------------------
// النقطة 3 — Tenant Scope
// ------------------------------------------------------------
describe("M34/3 — عزل الـtenant", () => {
  it("getTenantFilter يقيّد كل دور غير المالك ويفتح للمالك", async () => {
    for (const email of [
      E.admin,
      E.head,
      E.certSource,
      E.specialist,
      E.examiner1,
      E.examiner2,
      E.institution,
    ]) {
      const user = await sessionUserByEmail(email);
      expect(tenancy.getTenantFilter(user)).toEqual({ tenantId: ownTenantId });
    }
    const sa = await sessionUserByEmail(E.superAdmin);
    expect(tenancy.getTenantFilter(sa)).toEqual({});
  });

  it("requireTenantId يرمي لغير المالك", async () => {
    const user = await sessionUserByEmail(E.admin);
    expect(security.requireTenantId(user)).toBe(user.tenantId);
    const sa = await sessionUserByEmail(E.superAdmin);
    expect(() => security.requireTenantId(sa)).toThrow(/غير مصرح/);
  });

  it("TEST_SPECIALIST(50436) مرفوض عند تعديل طالب من tenant آخر", async () => {
    await asUser(E.specialist);
    await expectDenied(adminActions.specialistFinalApprove(otherTenantStudentId));
  });

  it("HEAD_OF_AFFAIRS(50436) مرفوض عند تعديل طالب من tenant آخر", async () => {
    await asUser(E.head);
    await expectDenied(adminActions.headOfAffairsFinalApprove(otherTenantStudentId));
  });

  it("CERTIFICATE_SOURCE(50436) مرفوض عند إصدار شهادة طالب من tenant آخر", async () => {
    await asUser(E.certSource);
    await expectDenied(certificateActions.generateCertificate(otherTenantStudentId));
  });

  it("EXAMINER(12345) مرفوض من تقييم واعتماد جلسة تتبع tenant 50436", async () => {
    await asUser(E.otherExaminer);
    await expectDenied(assessmentActions.approveAssessment(ownSessionId));
    await expectDenied(
      assessmentActions.saveAssessment({
        ...VALID_ASSESSMENT,
        examSessionId: ownSessionId,
      })
    );
  });

  it("getCommitteeSelectedModelIds لا يسرّب نماذج tenant آخر", async () => {
    await asUser(E.specialist);
    const leaked = await modelActions.getCommitteeSelectedModelIds(otherTenantCommitteeId);
    expect(leaked, "تسريب أفقي: معرّفات نماذج tenant آخر").toEqual([]);
  });

  it("getCommitteeSelectedModelIds يرى لجانته هو", async () => {
    await asUser(E.specialist);
    const own = await modelActions.getCommitteeSelectedModelIds(ownCommitteeId);
    expect(Array.isArray(own)).toBe(true);
  });

  it("assertSameTenant يرمي عند سجل من tenant آخر", async () => {
    const user = await sessionUserByEmail(E.admin);
    const otherStudent = await prisma.student.findUniqueOrThrow({
      where: { id: otherTenantStudentId },
      select: { id: true, tenantId: true },
    });
    expect(() => tenancy.assertSameTenant(user, otherStudent)).toThrow(/غير مصرح/);
  });
});

// ------------------------------------------------------------
// الفحوصات المحددة لكل دور
// ------------------------------------------------------------
describe("M34/EXAMINER — التقييد باللجنة", () => {
  it("مختبر غير عضو في اللجنة مرفوض من الاعتماد", async () => {
    await asUser(E.otherExaminer);
    await expectDenied(assessmentActions.approveAssessment(ownSessionId));
  });

  it("لجنة 50436 فيها مختبران مختلفان (عضوية متقاطعة)", async () => {
    const committee = await prisma.committee.findUniqueOrThrow({
      where: { id: ownCommitteeId },
      select: { teacher1Id: true, teacher2Id: true },
    });
    expect(committee.teacher1Id).not.toBe(committee.teacher2Id);
  });

  it("assertExaminerInSession مستخدم في الحفظ والاعتماد معاً", () => {
    const src = fs.readFileSync(
      path.resolve(process.cwd(), "lib/actions/assessment-actions.ts"),
      "utf8"
    );
    expect(src).toMatch(/export async function saveAssessment[\s\S]*?assertExaminerInSession\(/);
    expect(src).toMatch(/export async function approveAssessment[\s\S]*?assertExaminerInSession\(/);
  });
});

describe("M34/TEST_SPECIALIST — تفاصيل كاملة داخل نطاقه فقط", () => {
  it("صفحة المراجعة النهائية تعرض تفاصيل التقييم داخل نطاق الـtenant", () => {
    const src = fs.readFileSync(
      path.resolve(process.cwd(), "app/(dashboard)/test-specialist/final-review/page.tsx"),
      "utf8"
    );
    expect(src).toMatch(/recitationScore: true/);
    expect(src).toMatch(/tajweedScore: true/);
    expect(src).toMatch(/getTenantFilter\(user\)/);
    expect(src).toMatch(/user\.role !== Role\.TEST_SPECIALIST && user\.role !== Role\.ADMIN/);
  });
});

describe("M34/HEAD_OF_AFFAIRS — لا يرى تفاصيل التقييم", () => {
  const forbidden = [
    "recitationScore",
    "tajweedScore",
    "wordErrors",
    "letterErrors",
    "diacriticErrors",
    "seriousErrors",
    "subtleErrors",
    "tajweedErrors",
    "memorizationDeduction",
  ];

  it("صفحة رئيس الشؤون تقرأ التقييم بـ select محدود (finalScore فقط)", () => {
    const src = fs.readFileSync(
      path.resolve(process.cwd(), "app/(dashboard)/head-of-affairs/page.tsx"),
      "utf8"
    );
    expect(src).toMatch(/select: \{ finalScore: true \}/);
    for (const field of forbidden) {
      expect(src.includes(field), `تسريب ${field} لرئيس الشؤون`).toBe(false);
    }
  });

  it("صفحة مصدر الشهادات لا تطلب أي حقل من تفاصيل التقييم", () => {
    const src = fs.readFileSync(
      path.resolve(process.cwd(), "app/(dashboard)/certificate-source/page.tsx"),
      "utf8"
    );
    expect(src).toMatch(/select: \{ finalScore: true \}/);
    for (const field of forbidden) {
      expect(src.includes(field), `تسريب ${field} لمصدر الشهادات`).toBe(false);
    }
  });

  it("getStudentsForHeadReview محصورة في دوره ونطاق tenant", async () => {
    await asUser(E.head);
    const out = await headActions.getStudentsForHeadReview();
    expect(out.total).toBeGreaterThanOrEqual(0);
    for (const s of out.students) {
      expect(s.tenantId).toBe(ownTenantId);
      expect(s).not.toHaveProperty("recitationScore");
      expect(s).not.toHaveProperty("tajweedScore");
    }
  });

  it("غير مختبر ولا مسؤول يُرفض في getStudentsForHeadReview", async () => {
    await asUser(E.examiner1);
    await expectDenied(headActions.getStudentsForHeadReview());
    await asUser(E.certSource);
    await expectDenied(headActions.getStudentsForHeadReview());
    await asUser(E.specialist);
    await expectDenied(headActions.getStudentsForHeadReview());
  });
});

describe("M34/CERTIFICATE_SOURCE — بيانات الشهادة فقط", () => {
  it("مسار API الشهادة محمي بالدور + المستأجر + select محدود", () => {
    const src = fs.readFileSync(
      path.resolve(process.cwd(), "app/api/certificate/[id]/route.ts"),
      "utf8"
    );
    expect(src).toMatch(/requireApiUser\(\)/);
    expect(src).toMatch(
      /requireRole\(user, \[Role\.CERTIFICATE_SOURCE, Role\.INSTITUTION, Role\.ADMIN\]\)/
    );
    expect(src).toMatch(/institution\.tenantId !== user\.tenantId/);
    for (const field of ["recitationScore", "tajweedScore", "wordErrors", "tajweedErrors"]) {
      expect(src.includes(field), `تسريب ${field} عبر API الشهادة`).toBe(false);
    }
  });

  it("غير مصدر الشهادات يُرفض في إجراء الإصدار", async () => {
    await asUser(E.head);
    await expectDenied(certificateActions.generateCertificate(otherTenantStudentId));
    await asUser(E.admin);
    await expectDenied(certificateActions.generateCertificate(otherTenantStudentId));
    await asUser(E.examiner1);
    await expectDenied(certificateActions.generateCertificate(otherTenantStudentId));
  });
});
