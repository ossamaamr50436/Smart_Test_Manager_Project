import { test } from "node:test";
import assert from "node:assert/strict";
import "dotenv/config";
import { prisma } from "../../lib/prisma";
import { AuditAction, Role } from "@prisma/client";
import {
  isUniqueConstraintError,
  friendlyUniqueMessage,
} from "../../lib/actions/unique-guard";

// ============================================================
// B3 — إنشاء لجنة من /test-specialist/committees (الدورة الكاملة على مستوى الكود/DB)
// يعادل ما يحدث عبر الواجهة: validate → transaction → unique constraint → atomicity
// ============================================================

const TENANT_ID = "cmu5ngaxg0000to23u132olty";
const SEASON_ID = "cmu5okrtg000114ablr8hp8ob";
const TEACHER1_ID = "cmu5ob8ca000ip2cjon3w8dm6"; // مختبر 1 (EXAMINER)
const TEACHER2_ID = "cmu5ohhxx0008cot1zopapsvy"; // مختبر 2 (EXAMINER)
const MODEL_5 = "cmu5ondmd000lse1qzkkvoqno"; // نموذج فرع 5
const SPECIALIST_USER_ID = "cmu6wk0rz0003547lmjjr9f3c"; // TEST_SPECIALIST — ليس EXAMINER
const NAME_PREFIX = "B3 لجنة اختبار الاتجاه";

function uniqueName() {
  return `${NAME_PREFIX} ${Date.now()}`;
}

async function cleanupCommitteeByName(name: string) {
  const c = await prisma.committee.findFirst({
    where: { tenantId: TENANT_ID, name },
    select: { id: true },
  });
  if (!c) return;
  await prisma.committeeModelSelection.deleteMany({ where: { committeeId: c.id } });
  await prisma.committee.delete({ where: { id: c.id } });
}

// ==== يحاكي createCommittee: التحقق من القيود قبل إنشاء أي شيء ====
async function validateCommitteeInput(input: {
  name: string;
  branch: string;
  seasonId: string;
  teacher1Id: string;
  teacher2Id: string;
}) {
  const season = await prisma.examSeason.findUnique({
    where: { id: input.seasonId },
    select: { id: true, tenantId: true },
  });
  if (!season || season.tenantId !== TENANT_ID) return "الموسم غير موجود";

  const teachers = await prisma.user.findMany({
    where: { tenantId: TENANT_ID, id: { in: [input.teacher1Id, input.teacher2Id] } },
    select: { id: true, role: true },
  });
  if (teachers.length !== 2) return "أحد المختبرين غير موجود";
  for (const t of teachers) {
    if (t.role !== Role.EXAMINER) return "يجب أن يكون كل من المختبرين بدور EXAMINER";
  }

  const existing = await prisma.committee.findFirst({
    where: { tenantId: TENANT_ID, name: input.name, seasonId: input.seasonId },
    select: { id: true },
  });
  if (existing) return "يوجد لجنة بنفس الاسم في هذا الموسم";

  return null;
}

test("B3-1: إنشاء لجنة كاملة بنجاح + حفظ المختبرين + ربط جميع النماذج", async () => {
  const name = uniqueName();
  try {
    const validationError = await validateCommitteeInput({
      name,
      branch: "5",
      seasonId: SEASON_ID,
      teacher1Id: TEACHER1_ID,
      teacher2Id: TEACHER2_ID,
    });
    assert.equal(validationError, null, `التحقق يجب أن يمر (${validationError})`);

    const modelIds = [MODEL_5];
    const selectedModels = await prisma.questionBankModel.findMany({
      where: { tenantId: TENANT_ID, branch: "5", id: { in: modelIds } },
      select: { id: true },
    });
    assert.equal(selectedModels.length, modelIds.length, "النماذج المختارة يجب أن توجد");

    // نفس معاملة createCommittee
    const committee = await prisma.$transaction(async (tx) => {
      const created = await tx.committee.create({
        data: {
          name,
          branch: "5",
          seasonId: SEASON_ID,
          teacher1Id: TEACHER1_ID,
          teacher2Id: TEACHER2_ID,
          tenantId: TENANT_ID,
        },
      });
      await tx.committeeModelSelection.createMany({
        data: modelIds.map((modelId) => ({ committeeId: created.id, modelId })),
      });
      await tx.auditLog.create({
        data: {
          userId: SPECIALIST_USER_ID,
          tenantId: TENANT_ID,
          action: AuditAction.CREATE,
          details: JSON.stringify({ entity: "Committee", committeeId: created.id, name }),
        },
      });
      return created;
    });

    // اللجنة محفوظة + المختبران محفوظان
    const saved = await prisma.committee.findUnique({
      where: { id: committee.id },
      select: { id: true, name: true, teacher1Id: true, teacher2Id: true, tenantId: true, seasonId: true, branch: true },
    });
    assert.ok(saved, "اللجنة يجب أن تُحفظ في DB");
    assert.equal(saved.teacher1Id, TEACHER1_ID);
    assert.equal(saved.teacher2Id, TEACHER2_ID);
    assert.equal(saved.tenantId, TENANT_ID);
    assert.equal(saved.branch, "5");

    // كل النماذج المختارة محفوظة
    const selections = await prisma.committeeModelSelection.findMany({
      where: { committeeId: committee.id },
      select: { modelId: true },
    });
    assert.equal(selections.length, modelIds.length, "كل النماذج المختارة يجب أن تُحفظ");
    assert.deepEqual(selections.map((s) => s.modelId).sort(), [...modelIds].sort());

    // نموذج DB قابل للتسلسل كـ RSC payload
    const serialized = JSON.stringify([
      saved,
      selections,
    ]);
    assert.ok(serialized.length > 0);
    JSON.parse(serialized);
  } finally {
    await cleanupCommitteeByName(name);
  }
});

test("B3-2: رفض مختبر غير EXAMINER — لا يُنشأ أي سجل", async () => {
  const name = uniqueName();
  const candidateRoles = await prisma.user.findMany({
    where: { tenantId: TENANT_ID, id: { in: [TEACHER1_ID, TEACHER2_ID, SPECIALIST_USER_ID] } },
    select: { id: true, role: true },
  });
  const byId = new Map(candidateRoles.map((u) => [u.id, u.role]));
  assert.equal(byId.get(TEACHER1_ID), Role.EXAMINER);
  assert.equal(byId.get(TEACHER2_ID), Role.EXAMINER);
  assert.notEqual(byId.get(SPECIALIST_USER_ID), Role.EXAMINER);

  // استبدال المختبر الأول بمستخدم TEST_SPECIALIST (غير EXAMINER)
  const error = await validateCommitteeInput({
    name,
    branch: "5",
    seasonId: SEASON_ID,
    teacher1Id: SPECIALIST_USER_ID,
    teacher2Id: TEACHER2_ID,
  });
  assert.equal(error, "يجب أن يكون كل من المختبرين بدور EXAMINER");

  // لم يُنشأ أي سجل جزئي
  const count = await prisma.committee.count({ where: { tenantId: TENANT_ID, name } });
  assert.equal(count, 0, "لا لجنة مع مستخدم غير EXAMINER");
});

test("B3-3: رفض اسم مكرر داخل نفس الموسم (قاعدة السباق P2002 + الفحص المسبق)", async () => {
  const name = uniqueName();
  try {
    // لجنة أولى
    const c1 = await prisma.committee.create({
      data: {
        name,
        branch: "5",
        seasonId: SEASON_ID,
        teacher1Id: TEACHER1_ID,
        teacher2Id: TEACHER2_ID,
        tenantId: TENANT_ID,
      },
    });

    // 1) الفحص المسبق (كما في createCommittee) يمنع التكرار المعتاد
    const precheck = await validateCommitteeInput({
      name,
      branch: "5",
      seasonId: SEASON_ID,
      teacher1Id: TEACHER1_ID,
      teacher2Id: TEACHER2_ID,
    });
    assert.equal(precheck, "يوجد لجنة بنفس الاسم في هذا الموسم");

    // 2) القيد الفريد نفسه تحت سباق (race) يرمي P2002
    //    — وهو ما يلتقطه isUniqueConstraintError الجديد في createCommittee
    let threw = null as string | null;
    try {
      await prisma.committee.create({
        data: {
          name,
          branch: "5",
          seasonId: SEASON_ID,
          teacher1Id: TEACHER1_ID,
          teacher2Id: TEACHER2_ID,
          tenantId: TENANT_ID,
        },
      });
    } catch (e) {
      threw = isUniqueConstraintError(e) ? "P2002" : "other";
      const msg = friendlyUniqueMessage(e as never);
      assert.ok(msg.length > 0, "رسالة أمان لانتهاك القيد الفريد");
    }
    assert.equal(threw, "P2002", "السباق يجب أن يفشل بالقيد الفريد (P2002)");
  } finally {
    await cleanupCommitteeByName(name);
  }
});

test("B3-4: عدم ترك سجلات جزئية عند فشل المعاملة (atomicity)", async () => {
  const name = uniqueName();
  try {
    // إدراج يشير إلى modelId غير موجود → FK violation بعد إنشاء اللجنة
    // داخل نفس المعاملة → يجب أن تتراجع بالكامل
    await assert.rejects(
      prisma.$transaction(async (tx) => {
        const created = await tx.committee.create({
          data: {
            name,
            branch: "5",
            seasonId: SEASON_ID,
            teacher1Id: TEACHER1_ID,
            teacher2Id: TEACHER2_ID,
            tenantId: TENANT_ID,
          },
        });
        await tx.committeeModelSelection.createMany({
          data: [{ committeeId: created.id, modelId: "cmu_does_not_exist" }],
        });
      })
    );

    // لا لجنة ولا اختيارات — لا سجلات جزئية
    const committeeCount = await prisma.committee.count({ where: { tenantId: TENANT_ID, name } });
    assert.equal(committeeCount, 0, "لا سجلات جزئية: يجب التراجع عن اللجنة مع فشل الربط");
    const connectedSelection = await prisma.committeeModelSelection.count({
      where: { committee: { tenantId: TENANT_ID, name } },
    });
    assert.equal(connectedSelection, 0, "لا اختيارات متبقية");
  } finally {
    await cleanupCommitteeByName(name);
  }
});