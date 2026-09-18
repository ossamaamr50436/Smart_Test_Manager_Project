import { test } from "node:test";
import assert from "node:assert/strict";
import "dotenv/config";
import { prisma } from "../../lib/prisma";
import { AuditAction } from "@prisma/client";
import { questionBankSchema } from "../../lib/validations/question-bank";
import { isUniqueConstraintError, friendlyUniqueMessage } from "../../lib/actions/unique-guard";

// ============================================================
// B1 — إنشاء نموذج من بنك الأسئلة (الدورة الكاملة على مستوى الكود/DB)
// يعادل ما يحدث عبر الواجهة: validation → create → duplicate → serialize
// ============================================================

const TENANT_ID = "cmu5ngaxg0000to23u132olty";

function makeSegments(count: number) {
  return Array.from({ length: count }, (_, i) => ({
    number: i + 1,
    fromText: "نص تجريبي",
    fromSurah: "البقرة",
    fromVerse: i + 1,
    toText: "نص تجريبي",
    toSurah: "البقرة",
    toVerse: i + 2,
  }));
}

async function nextFreeModelNumber(branch: string): Promise<number> {
  const rows = await prisma.questionBankModel.findMany({
    where: { tenantId: TENANT_ID, branch },
    select: { modelNumber: true },
  });
  const used = new Set(rows.map((r) => r.modelNumber));
  for (let n = 1; n <= 100; n++) if (!used.has(n)) return n;
  return 101;
}

test("B1: questionBankSchema يقبل بيانات صحيحة من نموذج الواجهة", () => {
  const input = {
    modelNumber: 99,
    branch: "5",
    segmentsCount: 10,
    segments: makeSegments(10),
  };
  const parsed = questionBankSchema.safeParse(input);
  assert.equal(parsed.success, true, JSON.stringify(parsed.error?.issues));
});

test("B1: إنشاء نموذج + حفظه فعلياً في DB + قابلية التسلسل (RSC-safe)", async () => {
  const branch = "5";
  const modelNumber = await nextFreeModelNumber(branch);
  const input = {
    modelNumber,
    branch,
    segmentsCount: 3,
    segments: makeSegments(3),
  };

  const parsed = questionBankSchema.safeParse(input);
  assert.equal(parsed.success, true);
  const data = parsed.data;

  const model = await prisma.$transaction(async (tx) => {
    const created = await tx.questionBankModel.create({
      data: {
        modelNumber: data.modelNumber,
        branch: data.branch,
        detailsJSON: { segments: data.segments },
        segmentsCount: data.segmentsCount,
        tenantId: TENANT_ID,
      },
    });
    await tx.auditLog.create({
      data: {
        userId: null,
        tenantId: TENANT_ID,
        action: AuditAction.CREATE,
        details: JSON.stringify({ entity: "QuestionBankModel", modelId: created.id }),
      },
    });
    return created;
  });

  try {
    const saved = await prisma.questionBankModel.findUnique({ where: { id: model.id } });
    assert.ok(saved, "النموذج يجب أن يكون محفوظاً في DB");
    assert.equal(saved.modelNumber, modelNumber);
    assert.equal(saved.segmentsCount, 3);
    assert.deepEqual(
      (saved.detailsJSON as { segments: unknown }).segments,
      data.segments
    );

    // التسلسل كـ RSC payload (لا قيم دائرية/undefined/function)
    const models = await prisma.questionBankModel.findMany({
      where: { tenantId: TENANT_ID },
      orderBy: [{ branch: "asc" }, { modelNumber: "asc" }],
      take: 200,
    });
    const serialized = JSON.stringify(models);
    assert.ok(serialized.length > 0, "المصفوفة قابلة للتسلسل");
    const roundTrip = JSON.parse(serialized) as typeof models;
    assert.equal(roundTrip.length, models.length);
  } finally {
    await prisma.auditLog.deleteMany({ where: { tenantId: TENANT_ID, userId: null } });
    await prisma.questionBankModel.deleteMany({ where: { id: model.id } });
  }
});

test("B1: إنشاء نموذج مكرر يعالج القيد الفريد بشكل صحيح", async () => {
  const branch = "10";
  const modelNumber = await nextFreeModelNumber(branch);
  const input = {
    modelNumber,
    branch,
    segmentsCount: 1,
    segments: makeSegments(1),
  };
  const parsed = questionBankSchema.safeParse(input);
  assert.equal(parsed.success, true);
  const data = parsed.data;

  const created = await prisma.questionBankModel.create({
    data: {
      modelNumber: data.modelNumber,
      branch: data.branch,
      detailsJSON: { segments: data.segments },
      segmentsCount: data.segmentsCount,
      tenantId: TENANT_ID,
    },
  });

  try {
    // محاكاة مسارين للمكرر:
    // 1) الفحص المسبق الذي ينفذه createQuestionBankModel
    const existing = await prisma.questionBankModel.findFirst({
      where: { tenantId: TENANT_ID, modelNumber, branch },
      select: { id: true },
    });
    assert.ok(existing, "يجب أن يكن موجوداً");

    // 2) القيد الفريد نفسه عند سباق (race): create مباشر يُفشل بـ P2002
    try {
      await prisma.questionBankModel.create({
        data: {
          modelNumber: data.modelNumber,
          branch: data.branch,
          detailsJSON: { segments: data.segments },
          segmentsCount: data.segmentsCount,
          tenantId: TENANT_ID,
        },
      });
      assert.fail("يفترض أن يفشل الإدراج المكرر (P2002)");
    } catch (e) {
      assert.equal(isUniqueConstraintError(e), true, "يجب أن يكون P2002");
      const msg = friendlyUniqueMessage(e as never);
      assert.equal(typeof msg, "string");
      assert.ok(msg.length > 0);
    }
  } finally {
    await prisma.questionBankModel.deleteMany({ where: { id: created.id } });
  }
});